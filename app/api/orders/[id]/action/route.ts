import { calculateOrderAmounts, settlementDateFrom } from "../../../../../lib/frank";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

function routeError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
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
      include: { instrument: true },
    });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

    const now = new Date();

    if (payload.action === "approve") {
      if (order.status !== "pending_broker_review") {
        return Response.json({ error: "Only orders pending review can be approved." }, { status: 409 });
      }

      if (order.side === "buy") {
        const account = await prisma.account.findUnique({ where: { id: order.accountId } });
        if (!account || account.availableCash < order.estimatedNet) {
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
        if (!holding || holding.availableQuantity < order.quantity) {
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
      await prisma.$transaction([
        prisma.order.update({
          where: { id },
          data: { status: "rejected", rejectionReason: payload.reason?.trim() || "Rejected during broker review" },
        }),
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
      await prisma.$transaction([
        prisma.order.update({ where: { id }, data: { status: "cancelled" } }),
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
      const quantityFilled = Number(payload.quantityFilled ?? order.quantity);
      const executionPrice = Number(payload.executionPrice ?? order.price);
      if (quantityFilled <= 0 || quantityFilled > order.quantity || executionPrice <= 0) {
        return Response.json({ error: "Execution quantity or price is invalid." }, { status: 400 });
      }

      const tradeDate = payload.tradeDate ?? now.toISOString().slice(0, 10);
      const settlementDate = settlementDateFrom(tradeDate, order.instrument.settlementCycle);
      const amounts = calculateOrderAmounts(order.side as "buy" | "sell", quantityFilled, executionPrice);
      const tradeId = `TRD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const settlementId = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const status = quantityFilled < order.quantity ? "partially_filled" : "settlement_pending";

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
        prisma.auditLog.create({
          data: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            actorId: actor.id,
            action: "TRADE_CAPTURED",
            entityType: "trade",
            entityId: tradeId,
            summary: `${quantityFilled} ${order.instrument.symbol} captured at ${executionPrice} ETB`,
            newValue: JSON.stringify({ ...amounts, settlementDate }),
          },
        }),
      ]);

      return Response.json({
        ok: true,
        status,
        trade: { id: tradeId, settlementId, settlementDate, ...amounts },
      });
    }

    if (payload.action === "settle") {
      const [trade, account, holding] = await Promise.all([
        prisma.trade.findFirst({ where: { orderId: id }, include: { settlement: true } }),
        prisma.account.findUnique({ where: { id: order.accountId } }),
        prisma.holding.findUnique({
          where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
        }),
      ]);
      if (!trade) return Response.json({ error: "No captured trade exists for this order." }, { status: 409 });
      if (!trade.settlement) return Response.json({ error: "Settlement record not found." }, { status: 404 });
      if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

      const accountUpdate = order.side === "buy"
        ? prisma.account.update({
          where: { id: account.id },
          data: {
            totalCash: { decrement: trade.netAmount },
            blockedCash: Math.max(0, account.blockedCash - order.estimatedNet),
          },
        })
        : prisma.account.update({
          where: { id: account.id },
          data: {
            totalCash: { increment: trade.netAmount },
            availableCash: { increment: trade.netAmount },
          },
        });

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
              blockedQuantity: Math.max(0, holding.blockedQuantity - trade.quantityFilled),
            },
          })
          : null;

      const runningBalance = order.side === "buy"
        ? account.totalCash - trade.netAmount
        : account.totalCash + trade.netAmount;
      const runningQuantity = order.side === "buy"
        ? (holding?.totalQuantity ?? 0) + trade.quantityFilled
        : (holding?.totalQuantity ?? 0) - trade.quantityFilled;

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
        prisma.order.update({ where: { id }, data: { status: "settled" } }),
        prisma.cashLedgerEntry.create({
          data: {
            id: crypto.randomUUID(),
            accountId: order.accountId,
            orderId: id,
            tradeId: trade.id,
            entryType: order.side === "buy" ? "trade_debit" : "trade_credit",
            amount: order.side === "buy" ? -trade.netAmount : trade.netAmount,
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
            quantity: order.side === "buy" ? trade.quantityFilled : -trade.quantityFilled,
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
      return Response.json({ ok: true, status: "settled" });
    }

    return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}
