import { settlementDateFrom } from "../../../../../lib/frank";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";
import { computeAmounts, D, money, ZERO, toNum } from "../../../../../lib/money";

export const runtime = "nodejs";

function routeError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

// Records one row in the order status timeline (STAT-002). Every transition
// below emits an event so the full lifecycle is auditable and reconstructable.
function orderEvent(orderId: string, fromStatus: string, toStatus: string, actorId: string, reason?: string, detail?: Record<string, unknown>) {
  return prisma.orderEvent.create({
    data: {
      id: crypto.randomUUID(),
      orderId,
      fromStatus,
      toStatus,
      actorId,
      reason,
      detail: detail ? JSON.stringify(detail) : null,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as {
      action?: "approve" | "reject" | "cancel" | "execute" | "settle";
      reason?: string;
      executionPrice?: number;
      quantityFilled?: number;
      tradeDate?: string;
    };
    const permission = payload.action === "execute"
      ? "trade"
      : payload.action === "settle"
        ? "settle"
        : payload.action === "cancel"
          ? "create"
          : payload.action ?? "approve";
    const actor = requirePermission(request, permission);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        instrument: true,
        events: { orderBy: { createdAt: "asc" } },
        trades: { include: { settlement: true }, orderBy: { capturedAt: "asc" } },
      },
    });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

    const now = new Date();

    if (payload.action === "approve") {
      if (order.status !== "pending_broker_review") {
        return Response.json({ error: "Only orders pending review can be approved." }, { status: 409 });
      }
      const creatorId = order.events.find((event) => event.fromStatus === null)?.actorId;
      if (creatorId && creatorId === actor.id) {
        return Response.json({ error: "Four-eyes control: the order creator cannot approve this order. Switch to Compliance or another authorized approver." }, { status: 409 });
      }

      if (order.side === "buy") {
        const account = await prisma.account.findUnique({ where: { id: order.accountId } });
        if (!account || account.availableCash.lt(order.estimatedNet)) {
          return Response.json({ error: "Available cash changed; validation must be rerun." }, { status: 409 });
        }
        await prisma.$transaction([
          prisma.account.update({
            where: { id: account.id },
            data: {
              availableCash: { decrement: order.estimatedNet },
              blockedCash: { increment: order.estimatedNet },
            },
          }),
          prisma.order.update({
            where: { id },
            data: { status: "approved", approvedAt: now, approvedBy: actor.id },
          }),
          orderEvent(id, order.status, "approved", actor.id, "Approved; cash blocked", { blockedCash: toNum(order.estimatedNet) }),
          prisma.auditLog.create({
            data: {
              id: crypto.randomUUID(),
              brokerId: actor.brokerId,
              actorId: actor.id,
              action: "ORDER_APPROVE",
              entityType: "order",
              entityId: id,
              summary: `approve completed for ${id}`,
              previousValue: JSON.stringify({ status: order.status }),
            },
          }),
        ]);
      } else {
        const holding = await prisma.holding.findUnique({
          where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
        });
        if (!holding || holding.availableQuantity.lt(order.quantity)) {
          return Response.json({ error: "Available holdings changed; validation must be rerun." }, { status: 409 });
        }
        await prisma.$transaction([
          prisma.holding.update({
            where: { id: holding.id },
            data: {
              availableQuantity: { decrement: order.quantity },
              blockedQuantity: { increment: order.quantity },
            },
          }),
          prisma.order.update({
            where: { id },
            data: { status: "approved", approvedAt: now, approvedBy: actor.id },
          }),
          orderEvent(id, order.status, "approved", actor.id, "Approved; securities blocked", { blockedQuantity: toNum(order.quantity) }),
          prisma.auditLog.create({
            data: {
              id: crypto.randomUUID(),
              brokerId: actor.brokerId,
              actorId: actor.id,
              action: "ORDER_APPROVE",
              entityType: "order",
              entityId: id,
              summary: `approve completed for ${id}`,
              previousValue: JSON.stringify({ status: order.status }),
            },
          }),
        ]);
      }
      return Response.json({ ok: true, status: "approved" });
    }

    if (payload.action === "reject") {
      if (order.status !== "pending_broker_review") {
        return Response.json({ error: "Only orders pending review can be rejected." }, { status: 409 });
      }
      const reason = payload.reason?.trim() || "Rejected during broker review";
      await prisma.$transaction([
        prisma.order.update({
          where: { id },
          data: { status: "rejected", rejectionReason: reason },
        }),
        orderEvent(id, order.status, "rejected", actor.id, reason),
        prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            actorId: actor.id,
            action: "ORDER_REJECT",
            entityType: "order",
            entityId: id,
            summary: `reject completed for ${id}`,
            previousValue: JSON.stringify({ status: order.status }),
          },
        }),
      ]);
      return Response.json({ ok: true, status: "rejected" });
    }

    if (payload.action === "cancel") {
      // Only cancellable before execution. If assets were blocked at approval,
      // release them so cash/holdings are not stranded (CASH-006 / SEC-004).
      const cancellablePreBlock = ["draft", "submitted", "validation_failed", "pending_broker_review"];
      const reason = payload.reason?.trim() || "Cancelled by broker";

      if (order.status === "approved") {
        const releaseUpdate = order.side === "buy"
          ? prisma.account.update({
            where: { id: order.accountId },
            data: {
              availableCash: { increment: order.estimatedNet },
              blockedCash: { decrement: order.estimatedNet },
            },
          })
          : prisma.holding.update({
            where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
            data: {
              availableQuantity: { increment: order.quantity },
              blockedQuantity: { decrement: order.quantity },
            },
          });
        await prisma.$transaction([
          releaseUpdate,
          prisma.order.update({ where: { id }, data: { status: "cancelled", rejectionReason: reason } }),
          orderEvent(id, order.status, "cancelled", actor.id, `${reason}; blocked assets released`),
          prisma.auditLog.create({
            data: {
              id: crypto.randomUUID(),
              brokerId: actor.brokerId,
              actorId: actor.id,
              action: "ORDER_CANCEL",
              entityType: "order",
              entityId: id,
              summary: `cancel completed for ${id}; blocked assets released`,
              previousValue: JSON.stringify({ status: order.status }),
            },
          }),
        ]);
        return Response.json({ ok: true, status: "cancelled" });
      }

      if (!cancellablePreBlock.includes(order.status)) {
        return Response.json({ error: "This order can no longer be cancelled." }, { status: 409 });
      }

      await prisma.$transaction([
        prisma.order.update({ where: { id }, data: { status: "cancelled", rejectionReason: reason } }),
        orderEvent(id, order.status, "cancelled", actor.id, reason),
        prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            actorId: actor.id,
            action: "ORDER_CANCEL",
            entityType: "order",
            entityId: id,
            summary: `cancel completed for ${id}`,
            previousValue: JSON.stringify({ status: order.status }),
          },
        }),
      ]);
      return Response.json({ ok: true, status: "cancelled" });
    }

    if (payload.action === "execute") {
      if (!["approved", "partially_filled", "sent_to_esx_manually"].includes(order.status)) {
        return Response.json({ error: "This order is not ready for trade capture." }, { status: 409 });
      }
      const alreadyFilled = order.trades.reduce((total, trade) => total.plus(trade.quantityFilled), ZERO);
      const remainingQuantity = order.quantity.minus(alreadyFilled);
      const quantityFilled = D(payload.quantityFilled ?? remainingQuantity);
      const executionPrice = D(payload.executionPrice ?? order.price);
      if (quantityFilled.lte(0) || quantityFilled.gt(remainingQuantity) || executionPrice.lte(0)) {
        return Response.json({ error: `Execution quantity must be between 0 and the remaining ${toNum(remainingQuantity)} units.` }, { status: 400 });
      }

      const tradeDate = payload.tradeDate ?? now.toISOString().slice(0, 10);
      const settlementDate = settlementDateFrom(tradeDate, order.instrument.settlementCycle);
      const amounts = computeAmounts(order.side as "buy" | "sell", quantityFilled, executionPrice);
      if (order.side === "buy") {
        const reservedForFill = money(order.estimatedNet.times(quantityFilled).div(order.quantity));
        const additionalCashRequired = amounts.net.minus(reservedForFill);
        if (additionalCashRequired.gt(0)) {
          const account = await prisma.account.findUnique({ where: { id: order.accountId } });
          if (!account || account.availableCash.lt(additionalCashRequired)) {
            return Response.json({ error: "Execution price exceeds reserved cash and the account has insufficient available cash." }, { status: 409 });
          }
        }
      }
      const tradeId = `TRD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const settlementId = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const cumulativeFilled = alreadyFilled.plus(quantityFilled);
      const status = cumulativeFilled.lt(order.quantity) ? "partially_filled" : "settlement_pending";

      await prisma.$transaction([
        prisma.trade.create({
          data: {
            id: tradeId,
            orderId: id,
            executionPrice,
            quantityFilled,
            grossAmount: amounts.gross,
            fees: amounts.fees,
            netAmount: amounts.net,
            tradeDate: dateOnly(tradeDate),
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
        }),
        prisma.order.update({ where: { id }, data: { status } }),
        orderEvent(id, order.status, status, actor.id, `Trade ${tradeId} captured`, {
          tradeId,
          quantityFilled: toNum(quantityFilled),
          cumulativeFilled: toNum(cumulativeFilled),
          remainingQuantity: toNum(order.quantity.minus(cumulativeFilled)),
          executionPrice: toNum(executionPrice),
          net: toNum(amounts.net),
        }),
        prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            actorId: actor.id,
            action: "TRADE_CAPTURED",
            entityType: "trade",
            entityId: tradeId,
            summary: `${toNum(quantityFilled)} ${order.instrument.symbol} captured at ${toNum(executionPrice)} ETB`,
            newValue: JSON.stringify({ gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net), settlementDate }),
          },
        }),
      ]);

      return Response.json({
        ok: true,
        status,
        filledQuantity: toNum(cumulativeFilled),
        remainingQuantity: toNum(order.quantity.minus(cumulativeFilled)),
        trade: { id: tradeId, settlementId, settlementDate, gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net) },
      });
    }

    if (payload.action === "settle") {
      const trade = order.trades.find((item) => item.settlement && item.settlement.status !== "settled");
      const [account, holding] = await Promise.all([
        prisma.account.findUnique({ where: { id: order.accountId } }),
        prisma.holding.findUnique({
          where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
        }),
      ]);
      if (!trade) return Response.json({ error: "No unsettled captured trade exists for this order." }, { status: 409 });
      if (!trade.settlement) return Response.json({ error: "Settlement record not found." }, { status: 404 });
      if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

      const reservedForFill = money(order.estimatedNet.times(trade.quantityFilled).div(order.quantity));
      // Release only this fill's proportional reservation so subsequent partial
      // fills remain fully covered until they settle or the remainder is cancelled.
      const accountUpdate = order.side === "buy"
        ? prisma.account.update({
          where: { id: account.id },
          data: {
            totalCash: { decrement: trade.netAmount },
            blockedCash: { decrement: reservedForFill },
            availableCash: { increment: reservedForFill.minus(trade.netAmount) },
          },
        })
        : prisma.account.update({
          where: { id: account.id },
          data: {
            totalCash: { increment: trade.netAmount },
            availableCash: { increment: trade.netAmount },
          },
        });

      // A sell releases only the delivered fill. Any remaining quantity stays
      // blocked for subsequent fills.
      const holdingUpdate = order.side === "buy"
        ? prisma.holding.upsert({
          where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
          update: {
            totalQuantity: { increment: trade.quantityFilled },
            availableQuantity: { increment: trade.quantityFilled },
          },
          create: {
            id: crypto.randomUUID(),
            accountId: order.accountId,
            instrumentId: order.instrumentId,
            totalQuantity: trade.quantityFilled,
            availableQuantity: trade.quantityFilled,
            averageCost: trade.executionPrice,
          },
        })
        : holding
          ? prisma.holding.update({
            where: { id: holding.id },
            data: {
              totalQuantity: { decrement: trade.quantityFilled },
              blockedQuantity: { decrement: trade.quantityFilled },
            },
          })
          : null;

      const runningBalance = order.side === "buy"
        ? account.totalCash.minus(trade.netAmount)
        : account.totalCash.plus(trade.netAmount);
      const runningQuantity = order.side === "buy"
        ? (holding?.totalQuantity ?? ZERO).plus(trade.quantityFilled)
        : (holding?.totalQuantity ?? ZERO).minus(trade.quantityFilled);

      const totalFilled = order.trades.reduce((total, item) => total.plus(item.quantityFilled), ZERO);
      const pendingSettlementsAfterThis = order.trades.filter((item) => item.id !== trade.id && item.settlement?.status !== "settled");
      const nextStatus = totalFilled.lt(order.quantity)
        ? "partially_filled"
        : pendingSettlementsAfterThis.length
          ? "settlement_pending"
          : "settled";

      await prisma.$transaction([
        accountUpdate,
        ...(holdingUpdate ? [holdingUpdate] : []),
        prisma.settlement.update({
          where: { id: trade.settlement.id },
          data: {
            status: "settled",
            cashStatus: "settled",
            securitiesStatus: "settled",
            confirmedBy: actor.id,
            confirmedAt: now,
          },
        }),
        prisma.order.update({ where: { id }, data: { status: nextStatus } }),
        orderEvent(id, order.status, nextStatus, actor.id, `Settlement confirmed for ${trade.id}`, { net: toNum(trade.netAmount) }),
        prisma.cashLedgerEntry.create({
          data: {
            id: crypto.randomUUID(),
            accountId: order.accountId,
            orderId: id,
            tradeId: trade.id,
            entryType: order.side === "buy" ? "trade_debit" : "trade_credit",
            amount: order.side === "buy" ? trade.netAmount.negated() : trade.netAmount,
            runningBalance,
            description: `Settlement for ${trade.id}`,
            valueDate: trade.settlement.settlementDate,
            createdBy: actor.id,
          },
        }),
        prisma.securitiesLedgerEntry.create({
          data: {
            id: crypto.randomUUID(),
            accountId: order.accountId,
            instrumentId: order.instrumentId,
            orderId: id,
            tradeId: trade.id,
            entryType: order.side === "buy" ? "trade_receipt" : "trade_delivery",
            quantity: order.side === "buy" ? trade.quantityFilled : trade.quantityFilled.negated(),
            runningQuantity,
            description: `Settlement for ${trade.id}`,
            valueDate: trade.settlement.settlementDate,
            createdBy: actor.id,
          },
        }),
        prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            actorId: actor.id,
            action: "ORDER_SETTLE",
            entityType: "order",
            entityId: id,
            summary: `settle completed for ${id}`,
            previousValue: JSON.stringify({ status: order.status }),
          },
        }),
      ]);
      return Response.json({ ok: true, status: nextStatus, tradeId: trade.id });
    }

    return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}
