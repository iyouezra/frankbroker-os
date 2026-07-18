import { Prisma } from "../../app/generated/prisma/client";
import { settlementDateFrom } from "../frank";
import { D, money, toNum, ZERO } from "../money";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit, writeOrderEvent } from "./audit-service";
import { writeNotification, SETTLEMENT } from "./notification-service";
import { captureBuyFill, captureSellFill, type CashSnapshot, type SecuritySnapshot } from "./ledger-service";
import { lockAccount, lockHolding, lockOrder, persistCashMutation, persistSecuritiesMutation } from "./persistence";
import { assertTransition, isExecutableStatus } from "./status";
import { validateExecution, weightedAveragePrice } from "./validation-service";
import {
  addFeeBreakdowns,
  computeCumulativeConfiguredFill,
  feeBreakdownFromJson,
  resolveFeePolicy,
  serializeFeeBreakdown,
} from "./fee-service";
import { applyClientMoneyTradeBook } from "../client-money-service";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

function cashSnapshot(account: { totalCash: Prisma.Decimal; availableCash: Prisma.Decimal; blockedCash: Prisma.Decimal; unsettledCash: Prisma.Decimal }): CashSnapshot {
  return { total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash };
}

function securitySnapshot(holding: { totalQuantity: Prisma.Decimal; availableQuantity: Prisma.Decimal; blockedQuantity: Prisma.Decimal; unsettledQuantity: Prisma.Decimal }): SecuritySnapshot {
  return { total: holding.totalQuantity, available: holding.availableQuantity, blocked: holding.blockedQuantity, unsettled: holding.unsettledQuantity };
}

export type CaptureTradeInput = {
  quantity: number | string | Prisma.Decimal;
  executionPrice: number | string | Prisma.Decimal;
  tradeDate: string;
  captureReference?: string;
};

export async function captureTrade(actor: Actor, orderId: string, input: CaptureTradeInput) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        instrument: true,
        account: true,
        trades: { orderBy: { capturedAt: "asc" } },
      },
    });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    if (input.captureReference) {
      const existing = await tx.trade.findUnique({
        where: { captureReference: input.captureReference },
        include: { settlement: true, capturedByUser: true },
      });
      if (existing) {
        if (existing.orderId !== orderId) throw new Response("This trade capture reference is already used by another order.", { status: 409 });
        return {
          status: order.status,
          filledQuantity: toNum(order.filledQuantity),
          remainingQuantity: toNum(order.remainingQuantity),
          averageFillPrice: toNum(order.averageFillPrice),
          executedGross: toNum(order.executedGross),
          executedFees: toNum(order.executedFees),
          executedNet: toNum(order.executedNet),
          blockedCash: toNum(order.blockedCash),
          blockedQuantity: toNum(order.blockedQuantity),
          trade: {
            id: existing.id,
            settlementId: existing.settlement?.id,
            tradeDate: existing.tradeDate.toISOString().slice(0, 10),
            settlementDate: existing.settlementDate.toISOString().slice(0, 10),
            quantity: toNum(existing.quantityFilled),
            executionPrice: toNum(existing.executionPrice),
            gross: toNum(existing.grossAmount),
            fees: toNum(existing.fees),
            net: toNum(existing.netAmount),
            cashStatus: existing.settlement?.cashStatus ?? "pending",
            securitiesStatus: existing.settlement?.securitiesStatus ?? "pending",
            capturedBy: existing.capturedByUser.fullName,
          },
        };
      }
    }
    if (!isExecutableStatus(order.status)) {
      throw new Response("Only approved or partially filled orders can be executed.", { status: 409 });
    }
    const settings = await tx.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } });
    const features = (settings?.features ?? {}) as unknown as Record<string, unknown>;
    if (features.manualTradeCapture === false) throw new Response("Manual trade capture is disabled for this tenant.", { status: 403 });

    const capturedQuantity = order.trades.reduce((total, trade) => total.plus(trade.quantityFilled), ZERO);
    const capturedGross = order.trades.reduce((total, trade) => total.plus(trade.grossAmount), ZERO);
    const capturedFees = order.trades.reduce((total, trade) => total.plus(trade.fees), ZERO);
    const capturedNet = order.trades.reduce((total, trade) => total.plus(trade.netAmount), ZERO);
    if (
      !capturedQuantity.eq(order.filledQuantity)
      || !capturedGross.eq(order.executedGross)
      || !capturedFees.eq(order.executedFees)
      || !capturedNet.eq(order.executedNet)
      || !order.remainingQuantity.eq(order.quantity.minus(order.filledQuantity))
    ) {
      throw new Response("Order fill aggregates do not match the trade book. Reconcile the order before capturing another fill.", { status: 409 });
    }

    const quantity = D(input.quantity);
    const executionPrice = D(input.executionPrice);
    const validationError = validateExecution(quantity, executionPrice, order.remainingQuantity);
    if (validationError) throw new Response(validationError, { status: 400 });
    if (!executionPrice.div(order.instrument.tickSize).isInteger()) {
      throw new Response(`Execution price must align to the ${order.instrument.tickSize.toString()} tick size.`, { status: 400 });
    }

    const feePolicy = await resolveFeePolicy(tx, actor.brokerId, order.instrument, settings, dateOnly(input.tradeDate));
    const priorFeeBreakdown = addFeeBreakdowns(order.trades.map((trade) => {
      if (trade.feeBreakdown) return feeBreakdownFromJson(trade.feeBreakdown);
      return { brokerage: trade.fees, regulator: ZERO, exchange: ZERO, csd: ZERO, total: trade.fees };
    }));
    const amounts = computeCumulativeConfiguredFill(
      order.side as "buy" | "sell",
      quantity,
      executionPrice,
      order.executedGross,
      priorFeeBreakdown,
      feePolicy,
    );
    if (order.side === "sell" && amounts.net.lte(0)) throw new Response("Fees exceed sell proceeds.", { status: 409 });

    const remainingQuantity = order.remainingQuantity.minus(quantity);
    const filledQuantity = order.filledQuantity.plus(quantity);
    const executedGross = order.executedGross.plus(amounts.gross);
    const executedFees = order.executedFees.plus(amounts.fees);
    const executedNet = order.executedNet.plus(amounts.net);
    const averageFillPrice = weightedAveragePrice(order.filledQuantity, order.averageFillPrice, quantity, executionPrice);
    const tradeId = `TRD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const settlementId = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const settlementDate = settlementDateFrom(input.tradeDate, settings?.settlementCycle ?? order.instrument.settlementCycle);
    const valueDate = dateOnly(input.tradeDate);

    await lockAccount(tx, order.accountId);
    const account = await tx.account.findUnique({ where: { id: order.accountId } });
    if (!account) throw new Response("Account not found.", { status: 404 });
    await tx.holding.upsert({
      where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
      update: {},
      create: {
        id: crypto.randomUUID(),
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        totalQuantity: ZERO,
        availableQuantity: ZERO,
        blockedQuantity: ZERO,
        unsettledQuantity: ZERO,
        averageCost: ZERO,
      },
    });
    await lockHolding(tx, order.accountId, order.instrumentId);
    const holding = await tx.holding.findUnique({
      where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
    });
    if (!holding) throw new Response("Holding could not be initialized.", { status: 500 });

    // Create the trade and settlement shell before ledger rows reference it.
    // The serializable transaction rolls both back if any financial mutation fails.
    await tx.trade.create({
      data: {
        id: tradeId,
        captureReference: input.captureReference ?? null,
        orderId,
        executionPrice,
        quantityFilled: quantity,
        grossAmount: amounts.gross,
        fees: amounts.fees,
        feeBreakdown: serializeFeeBreakdown(amounts.breakdown),
        netAmount: amounts.net,
        tradeDate: valueDate,
        settlementDate: dateOnly(settlementDate),
        capturedBy: actor.id,
        settlement: {
          create: {
            id: settlementId,
            status: "pending",
            settlementDate: dateOnly(settlementDate),
            cashStatus: "pending",
            securitiesStatus: "pending",
          },
        },
      },
    });

    let blockedCash = order.blockedCash;
    let blockedQuantity = order.blockedQuantity;
    let cashBookImpact = ZERO;
    if (order.side === "buy") {
      const targetRemainingBlock = remainingQuantity.isZero()
        ? ZERO
        : money(order.estimatedNet.times(remainingQuantity).div(order.quantity));
      const mutations = captureBuyFill(
        cashSnapshot(account),
        securitySnapshot(holding),
        order.blockedCash,
        targetRemainingBlock,
        quantity,
        amounts.gross,
        amounts.fees,
      );
      const newAverageCost = weightedAveragePrice(
        holding.totalQuantity,
        holding.averageCost,
        quantity,
        executionPrice,
      ) ?? executionPrice;
      await persistCashMutation(tx, {
        accountId: order.accountId,
        orderId,
        tradeId,
        actorId: actor.id,
        valueDate,
        reason: "Trade captured",
        mutation: mutations.cash,
      });
      cashBookImpact = money(mutations.cash.next.total.minus(account.totalCash));
      await persistSecuritiesMutation(tx, {
        holdingId: holding.id,
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        orderId,
        tradeId,
        actorId: actor.id,
        valueDate,
        reason: "Trade captured",
        averageCost: newAverageCost,
        mutation: mutations.securities,
      });
      blockedCash = targetRemainingBlock;
      if (mutations.releasedCash.gt(0)) {
        await writeAudit(tx, {
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "CASH_RELEASED",
          entityType: "order",
          entityId: orderId,
          summary: `${toNum(mutations.releasedCash)} ETB released from the order reservation for the captured fill`,
          previousValue: { blockedCash: toNum(order.blockedCash) },
          newValue: { blockedCash: toNum(targetRemainingBlock) },
          reason: "Trade capture allocation",
        });
      }
    } else {
      if (order.blockedQuantity.lt(quantity)) {
        throw new Response("Execution quantity exceeds securities blocked for this order.", { status: 409 });
      }
      const mutations = captureSellFill(cashSnapshot(account), securitySnapshot(holding), quantity, amounts.gross, amounts.fees);
      await persistCashMutation(tx, {
        accountId: order.accountId,
        orderId,
        tradeId,
        actorId: actor.id,
        valueDate,
        reason: "Trade captured",
        mutation: mutations.cash,
      });
      cashBookImpact = money(mutations.cash.next.total.minus(account.totalCash));
      await persistSecuritiesMutation(tx, {
        holdingId: holding.id,
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        orderId,
        tradeId,
        actorId: actor.id,
        valueDate,
        reason: "Trade captured",
        mutation: mutations.securities,
      });
      blockedQuantity = order.blockedQuantity.minus(quantity);
    }

    await applyClientMoneyTradeBook(tx, {
      brokerId: actor.brokerId,
      accountId: order.accountId,
      orderId,
      tradeId,
      actorId: actor.id,
      impact: cashBookImpact,
      assetClass: order.instrument.assetClass,
    });

    const finalStatus = remainingQuantity.gt(0) ? "partially_filled" : "settlement_pending";
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: finalStatus,
        filledQuantity,
        remainingQuantity,
        averageFillPrice,
        executedGross,
        executedFees,
        executedNet,
        blockedCash,
        blockedQuantity,
        version: { increment: 1 },
      },
    });
    if (remainingQuantity.gt(0)) {
      assertTransition(order.status, "partially_filled");
      await writeOrderEvent(tx, {
        orderId,
        fromStatus: order.status,
        toStatus: "partially_filled",
        actorId: actor.id,
        reason: `Partial fill ${tradeId} captured`,
        detail: {
          tradeId,
          fillQuantity: toNum(quantity),
          filledQuantity: toNum(filledQuantity),
          remainingQuantity: toNum(remainingQuantity),
          averageFillPrice: toNum(averageFillPrice),
        },
      });
    } else {
      assertTransition(order.status, "filled");
      await writeOrderEvent(tx, {
        orderId,
        fromStatus: order.status,
        toStatus: "filled",
        actorId: actor.id,
        reason: `Final fill ${tradeId} captured`,
        detail: { tradeId, filledQuantity: toNum(filledQuantity), averageFillPrice: toNum(averageFillPrice) },
      });
      await writeOrderEvent(tx, {
        orderId,
        fromStatus: "filled",
        toStatus: "settlement_pending",
        actorId: actor.id,
        reason: "All fills captured; settlement pending",
      });
    }

    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "TRADE_CAPTURED",
      entityType: "trade",
      entityId: tradeId,
      summary: `${toNum(quantity)} ${order.instrument.symbol} captured at ${toNum(executionPrice)} ETB`,
      newValue: {
        orderId,
        gross: toNum(amounts.gross),
        fees: toNum(amounts.fees),
        feeBreakdown: serializeFeeBreakdown(amounts.breakdown),
        feeScheduleVersion: feePolicy.scheduleVersion,
        net: toNum(amounts.net),
        settlementDate,
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: remainingQuantity.gt(0) ? "PARTIAL_FILL_RECORDED" : "ORDER_FILLED",
      entityType: "order",
      entityId: orderId,
      summary: remainingQuantity.gt(0)
        ? `${toNum(filledQuantity)} of ${toNum(order.quantity)} units filled`
        : `Order ${orderId} fully filled`,
      previousValue: {
        status: order.status,
        filledQuantity: toNum(order.filledQuantity),
        remainingQuantity: toNum(order.remainingQuantity),
      },
      newValue: {
        status: remainingQuantity.gt(0) ? "partially_filled" : "filled",
        filledQuantity: toNum(filledQuantity),
        remainingQuantity: toNum(remainingQuantity),
        averageFillPrice: toNum(averageFillPrice),
      },
    });
    if (remainingQuantity.isZero()) {
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "ORDER_SETTLEMENT_PENDING",
        entityType: "order",
        entityId: orderId,
        summary: `All captured fills for ${orderId} are pending settlement`,
        previousValue: { status: "filled" },
        newValue: { status: "settlement_pending" },
      });
    }

    await writeNotification(tx, {
      scope: "broker",
      brokerId: actor.brokerId,
      roles: SETTLEMENT,
      category: "trade",
      severity: "info",
      title: `Trade captured · ${order.instrument.symbol}`,
      body: `${toNum(quantity)} ${order.instrument.symbol} filled at ${toNum(executionPrice)} ETB. Settlement due ${settlementDate}.`,
      entityType: "order",
      entityId: orderId,
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: order.account.clientId,
      category: "trade",
      severity: "success",
      title: "Order executed",
      body: `${toNum(quantity)} ${order.instrument.symbol} ${order.side === "buy" ? "bought" : "sold"} at ${toNum(executionPrice)} ETB. Settlement is due ${settlementDate}.`,
      entityType: "order",
      entityId: orderId,
    });

    return {
      status: finalStatus,
      filledQuantity: toNum(filledQuantity),
      remainingQuantity: toNum(remainingQuantity),
      averageFillPrice: toNum(averageFillPrice),
      executedGross: toNum(executedGross),
      executedFees: toNum(executedFees),
      executedNet: toNum(executedNet),
      blockedCash: toNum(blockedCash),
      blockedQuantity: toNum(blockedQuantity),
      trade: {
        id: tradeId,
        settlementId,
        tradeDate: input.tradeDate,
        settlementDate,
        quantity: toNum(quantity),
        executionPrice: toNum(executionPrice),
        gross: toNum(amounts.gross),
        fees: toNum(amounts.fees),
        net: toNum(amounts.net),
        cashStatus: "pending",
        securitiesStatus: "pending",
        capturedBy: actor.email,
      },
    };
  }, transactionOptions);
}
