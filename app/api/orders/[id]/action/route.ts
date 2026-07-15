import { FEE_RATE, settlementDateFrom } from "../../../../../lib/frank";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";
import { computeCumulativeFillAmounts, D, money, ZERO, toNum } from "../../../../../lib/money";
import { apiError as routeError } from "../../../../../lib/api";
import { normalizeOrderType, parseDateOnly, parsePositiveFiniteNumber } from "../../../../../lib/order-input";

export const runtime = "nodejs";

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
    const supportedActions = ["approve", "reject", "cancel", "execute", "settle"];
    if (!payload.action || !supportedActions.includes(payload.action)) {
      return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
    }
    if ((payload.reason?.length ?? 0) > 1_000) {
      return Response.json({ error: "The workflow reason is too long." }, { status: 400 });
    }
    if (payload.action === "execute") {
      const quantityFilled = parsePositiveFiniteNumber(payload.quantityFilled);
      const executionPrice = parsePositiveFiniteNumber(payload.executionPrice);
      const tradeDate = parseDateOnly(payload.tradeDate);
      if (quantityFilled === null || executionPrice === null || !tradeDate) {
        return Response.json({ error: "A positive execution quantity, positive price, and valid trade date are required." }, { status: 400 });
      }
    }
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
        account: { include: { client: true } },
        events: { orderBy: { createdAt: "asc" } },
        trades: { include: { settlement: true }, orderBy: { capturedAt: "asc" } },
      },
    });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (order.brokerId !== actor.brokerId) {
      return Response.json({ error: "Order not found for this tenant." }, { status: 404 });
    }
    const [settings, entitlement] = await Promise.all([
      prisma.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
      prisma.brokerInstrument.findUnique({ where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId: order.instrumentId } } }),
    ]);
    const features = (settings?.features ?? {}) as unknown as Record<string, unknown>;

    const now = new Date();

    if (payload.action === "approve") {
      if (order.status !== "pending_broker_review") {
        return Response.json({ error: "Only orders pending review can be approved." }, { status: 409 });
      }
      // Segregation of duties (BRK-010 / SECUR-006): the order creator may not
      // approve their own order, but only when the tenant has maker-checker
      // enabled and the order value meets the configured approval threshold.
      // Defaults (no settings) preserve strict four-eyes on every order.
      const makerChecker = settings?.makerChecker ?? true;
      const approvalThreshold = settings?.approvalThreshold ?? D(0);
      if (makerChecker && order.estimatedNet.gte(approvalThreshold)) {
        const creatorId = order.events.find((event) => event.fromStatus === null)?.actorId;
        if (creatorId && creatorId === actor.id) {
          return Response.json({ error: `Four-eyes control: orders at or above ${toNum(approvalThreshold).toLocaleString()} ETB require a second approver. The order creator cannot approve this one — switch to Compliance or another authorized approver.` }, { status: 409 });
        }
      }

      const allowedOrderTypes = Array.isArray(settings?.allowedOrderTypes)
        ? settings.allowedOrderTypes.filter((item): item is string => typeof item === "string")
        : ["Limit"];
      const controlFailure = order.account.client.brokerId !== actor.brokerId
        ? "The account no longer belongs to this tenant."
        : order.account.client.kycStatus !== "approved"
          ? "Client KYC is no longer approved."
          : order.account.status !== "active" || order.account.client.status !== "active"
            ? "The client or trading account is no longer active."
            : order.instrument.tradingStatus !== "tradable" || entitlement?.enabled !== true
              ? "The instrument is no longer tradable for this tenant."
              : !allowedOrderTypes.some((item) => normalizeOrderType(item) === normalizeOrderType(order.orderType))
                ? "The order type is no longer enabled for this tenant."
                : !["buy", "sell"].includes(order.side) || order.quantity.lte(0) || order.price.lte(0)
                  ? "The stored order direction, quantity, or price is invalid."
                  : (!(order.source === "investor_portal" && features.fractionalOrders === true) && !order.quantity.mod(order.instrument.lotSize).isZero()) || !order.price.div(order.instrument.tickSize).isInteger()
                    ? "The order no longer meets the instrument lot or tick-size rules."
                    : null;
      if (controlFailure) {
        return Response.json({ error: `${controlFailure} Run validation again before approval.` }, { status: 409 });
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
      if (features.manualTradeCapture === false) {
        return Response.json({ error: "Manual trade capture is disabled for this tenant." }, { status: 403 });
      }
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
      const settlementDate = settlementDateFrom(tradeDate, settings?.settlementCycle ?? order.instrument.settlementCycle);
      const priorGross = order.trades.reduce((total, trade) => total.plus(trade.grossAmount), ZERO);
      const priorFees = order.trades.reduce((total, trade) => total.plus(trade.fees), ZERO);
      const feeRate = settings ? settings.brokerageFeePct.div(100) : D(FEE_RATE);
      const amounts = computeCumulativeFillAmounts(order.side as "buy" | "sell", quantityFilled, executionPrice, priorGross, priorFees, feeRate, settings?.minimumFee);
      let reservationUpdate = null;
      if (order.side === "buy") {
        const reservedForFill = money(order.estimatedNet.times(quantityFilled).div(order.quantity));
        const reservationDelta = money(amounts.net.minus(reservedForFill));
        if (reservationDelta.gt(0)) {
          if (order.account.availableCash.lt(reservationDelta)) {
            return Response.json({ error: "Execution price exceeds reserved cash and the account has insufficient available cash." }, { status: 409 });
          }
          reservationUpdate = prisma.account.update({ where: { id: order.accountId }, data: { availableCash: { decrement: reservationDelta }, blockedCash: { increment: reservationDelta } } });
        } else if (reservationDelta.lt(0)) {
          const release = reservationDelta.abs();
          reservationUpdate = prisma.account.update({ where: { id: order.accountId }, data: { availableCash: { increment: release }, blockedCash: { decrement: release } } });
        }
      }
      const tradeId = `TRD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const settlementId = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const cumulativeFilled = alreadyFilled.plus(quantityFilled);
      const status = cumulativeFilled.lt(order.quantity) ? "partially_filled" : "settlement_pending";

      await prisma.$transaction([
        ...(reservationUpdate ? [reservationUpdate] : []),
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
        trade: { id: tradeId, settlementId, tradeDate, settlementDate, quantity: toNum(quantityFilled), executionPrice: toNum(executionPrice), gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net), cashStatus: "pending", securitiesStatus: "pending", capturedBy: actor.email },
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

      const accountUpdate = order.side === "buy"
        ? prisma.account.update({
          where: { id: account.id },
          data: {
            totalCash: { decrement: trade.netAmount },
            blockedCash: { decrement: trade.netAmount },
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
