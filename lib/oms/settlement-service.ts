import { Prisma } from "../../app/generated/prisma/client";
import { toNum } from "../money";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit, writeOrderEvent } from "./audit-service";
import { writeNotification, OPS } from "./notification-service";
import { settleBuySecurities, settleSellCash, type CashSnapshot, type SecuritySnapshot } from "./ledger-service";
import { lockAccount, lockHolding, lockOrder, persistCashMutation, persistSecuritiesMutation } from "./persistence";
import { assertTransition } from "./status";
import { confirmClientMoneyTradeAtSettlement } from "../client-money-service";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

function cashSnapshot(account: { totalCash: Prisma.Decimal; availableCash: Prisma.Decimal; blockedCash: Prisma.Decimal; unsettledCash: Prisma.Decimal }): CashSnapshot {
  return { total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash };
}

function securitySnapshot(holding: { totalQuantity: Prisma.Decimal; availableQuantity: Prisma.Decimal; blockedQuantity: Prisma.Decimal; unsettledQuantity: Prisma.Decimal }): SecuritySnapshot {
  return { total: holding.totalQuantity, available: holding.availableQuantity, blocked: holding.blockedQuantity, unsettled: holding.unsettledQuantity };
}

export async function settleNextTrade(actor: Actor, orderId: string, requestedTradeId?: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        instrument: true,
        trades: { include: { settlement: true }, orderBy: { capturedAt: "asc" } },
      },
    });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    if (!["partially_filled", "filled", "settlement_pending", "cancelled", "failed"].includes(order.status)) {
      throw new Response("This order has no settlement-ready trade.", { status: 409 });
    }
    const requestedTrade = requestedTradeId ? order.trades.find((candidate) => candidate.id === requestedTradeId) : null;
    if (requestedTradeId && !requestedTrade) throw new Response("The requested trade does not belong to this order.", { status: 404 });
    if (requestedTrade?.settlement?.status === "settled") {
      return { status: order.status, tradeId: requestedTrade.id, idempotent: true };
    }
    const trade = requestedTrade ?? order.trades.find((candidate) => candidate.settlement?.status !== "settled");
    if (!trade?.settlement) throw new Response("No unsettled captured trade exists for this order.", { status: 409 });

    await lockAccount(tx, order.accountId);
    const account = await tx.account.findUnique({ where: { id: order.accountId } });
    if (!account) throw new Response("Account not found.", { status: 404 });
    await lockHolding(tx, order.accountId, order.instrumentId);
    const holding = await tx.holding.findUnique({
      where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
    });
    if (!holding) throw new Response("Holding not found.", { status: 404 });

    if (order.side === "buy") {
      const mutation = settleBuySecurities(securitySnapshot(holding), trade.quantityFilled);
      await persistSecuritiesMutation(tx, {
        holdingId: holding.id,
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        orderId,
        tradeId: trade.id,
        actorId: actor.id,
        valueDate: trade.settlement.settlementDate,
        reason: "Settlement confirmed",
        mutation,
      });
    } else {
      const mutation = settleSellCash(cashSnapshot(account), trade.netAmount);
      await persistCashMutation(tx, {
        accountId: order.accountId,
        orderId,
        tradeId: trade.id,
        actorId: actor.id,
        valueDate: trade.settlement.settlementDate,
        reason: "Settlement confirmed",
        mutation,
      });
    }

    await confirmClientMoneyTradeAtSettlement(tx, {
      brokerId: actor.brokerId,
      orderId,
      tradeId: trade.id,
      actorId: actor.id,
    });

    await tx.settlement.update({
      where: { id: trade.settlement.id },
      data: {
        status: "settled",
        cashStatus: "settled",
        securitiesStatus: "settled",
        confirmedBy: actor.id,
        confirmedAt: new Date(),
      },
    });

    const otherPending = order.trades.some((candidate) => candidate.id !== trade.id && candidate.settlement?.status !== "settled");
    const nextStatus = ["cancelled", "failed"].includes(order.status)
      ? order.status
      : order.remainingQuantity.gt(0)
        ? "partially_filled"
        : otherPending
          ? "settlement_pending"
          : "settled";
    if (nextStatus !== order.status) {
      if (order.status === "filled" && nextStatus === "settled") {
        assertTransition("filled", "settlement_pending");
        await writeOrderEvent(tx, {
          orderId,
          fromStatus: "filled",
          toStatus: "settlement_pending",
          actorId: actor.id,
          reason: "Captured trade entered settlement processing",
        });
        await writeAudit(tx, {
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "ORDER_SETTLEMENT_PENDING",
          entityType: "order",
          entityId: orderId,
          summary: `Order ${orderId} entered settlement processing`,
          previousValue: { status: "filled" },
          newValue: { status: "settlement_pending" },
        });
        assertTransition("settlement_pending", "settled");
      } else {
        assertTransition(order.status, nextStatus);
      }
      await tx.order.update({ where: { id: orderId }, data: { status: nextStatus, version: { increment: 1 } } });
      await writeOrderEvent(tx, {
        orderId,
        fromStatus: order.status === "filled" && nextStatus === "settled" ? "settlement_pending" : order.status,
        toStatus: nextStatus,
        actorId: actor.id,
        reason: `Settlement confirmed for ${trade.id}`,
        detail: { tradeId: trade.id, net: toNum(trade.netAmount) },
      });
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: nextStatus === "settled" ? "ORDER_SETTLED" : "ORDER_STATUS_CHANGED",
        entityType: "order",
        entityId: orderId,
        summary: `Order ${orderId} moved from ${order.status === "filled" && nextStatus === "settled" ? "settlement_pending" : order.status} to ${nextStatus}`,
        previousValue: { status: order.status === "filled" && nextStatus === "settled" ? "settlement_pending" : order.status },
        newValue: { status: nextStatus },
        reason: `Settlement confirmed for ${trade.id}`,
      });
    }

    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "SETTLEMENT_UPDATED",
      entityType: "settlement",
      entityId: trade.settlement.id,
      summary: `Cash and securities settlement confirmed for ${trade.id}`,
      previousValue: {
        status: trade.settlement.status,
        cashStatus: trade.settlement.cashStatus,
        securitiesStatus: trade.settlement.securitiesStatus,
      },
      newValue: { status: "settled", cashStatus: "settled", securitiesStatus: "settled" },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: account.clientId,
      category: "settlement",
      severity: "success",
      title: "Settlement confirmed",
      body: `${order.side === "buy" ? "Purchase" : "Sale"} of ${order.instrument.symbol} has settled — cash and securities confirmed.`,
      entityType: "order",
      entityId: orderId,
    });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: actor.brokerId,
      roles: OPS,
      category: "settlement",
      severity: "info",
      title: `Settlement confirmed · ${order.instrument.symbol}`,
      body: `${trade.id} for order ${orderId} settled (${toNum(trade.netAmount)} ETB).`,
      entityType: "order",
      entityId: orderId,
    });
    return { status: nextStatus, tradeId: trade.id };
  }, transactionOptions);
}
