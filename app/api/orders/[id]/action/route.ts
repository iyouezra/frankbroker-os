import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  accounts,
  auditLogs,
  cashLedgerEntries,
  holdings,
  instruments,
  orders,
  securitiesLedgerEntries,
  settlements,
  trades,
} from "../../../../../db/schema";
import { calculateOrderAmounts, settlementDateFrom } from "../../../../../lib/frank";
import { requirePermission } from "../../../../../lib/server-auth";

function routeError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
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
    const permission = payload.action === "execute" ? "trade" : payload.action === "settle" ? "settle" : payload.action === "cancel" ? "create" : payload.action ?? "approve";
    const actor = requirePermission(request, permission);
    const db = getDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    const [instrument] = await db.select().from(instruments).where(eq(instruments.id, order.instrumentId)).limit(1);
    if (!instrument) return Response.json({ error: "Instrument not found." }, { status: 404 });
    const now = new Date().toISOString();

    if (payload.action === "approve") {
      if (order.status !== "pending_broker_review") return Response.json({ error: "Only orders pending review can be approved." }, { status: 409 });
      if (order.side === "buy") {
        const [account] = await db.select().from(accounts).where(eq(accounts.id, order.accountId)).limit(1);
        if (!account || account.availableCash < order.estimatedNet) return Response.json({ error: "Available cash changed; validation must be rerun." }, { status: 409 });
        await db.update(accounts).set({ availableCash: account.availableCash - order.estimatedNet, blockedCash: account.blockedCash + order.estimatedNet, updatedAt: now }).where(eq(accounts.id, account.id));
      } else {
        const [holding] = await db.select().from(holdings).where(and(eq(holdings.accountId, order.accountId), eq(holdings.instrumentId, order.instrumentId))).limit(1);
        if (!holding || holding.availableQuantity < order.quantity) return Response.json({ error: "Available holdings changed; validation must be rerun." }, { status: 409 });
        await db.update(holdings).set({ availableQuantity: holding.availableQuantity - order.quantity, blockedQuantity: holding.blockedQuantity + order.quantity, updatedAt: now }).where(eq(holdings.id, holding.id));
      }
      await db.update(orders).set({ status: "approved", approvedAt: now, approvedBy: actor.id, updatedAt: now }).where(eq(orders.id, id));
    } else if (payload.action === "reject") {
      if (order.status !== "pending_broker_review") return Response.json({ error: "Only orders pending review can be rejected." }, { status: 409 });
      await db.update(orders).set({ status: "rejected", rejectionReason: payload.reason?.trim() || "Rejected during broker review", updatedAt: now }).where(eq(orders.id, id));
    } else if (payload.action === "cancel") {
      await db.update(orders).set({ status: "cancelled", updatedAt: now }).where(eq(orders.id, id));
    } else if (payload.action === "execute") {
      if (!["approved", "partially_filled", "sent_to_esx_manually"].includes(order.status)) return Response.json({ error: "This order is not ready for trade capture." }, { status: 409 });
      const quantityFilled = Number(payload.quantityFilled ?? order.quantity);
      const executionPrice = Number(payload.executionPrice ?? order.price);
      if (quantityFilled <= 0 || quantityFilled > order.quantity || executionPrice <= 0) return Response.json({ error: "Execution quantity or price is invalid." }, { status: 400 });
      const tradeDate = payload.tradeDate ?? now.slice(0, 10);
      const settlementDate = settlementDateFrom(tradeDate, instrument.settlementCycle);
      const amounts = calculateOrderAmounts(order.side as "buy" | "sell", quantityFilled, executionPrice);
      const tradeId = `TRD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const settlementId = `STL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await db.insert(trades).values({ id: tradeId, orderId: id, executionPrice, quantityFilled, grossAmount: amounts.gross, fees: amounts.fees, netAmount: amounts.net, tradeDate, settlementDate, capturedBy: actor.id });
      await db.insert(settlements).values({ id: settlementId, tradeId, status: "pending", settlementDate, cashStatus: "pending", securitiesStatus: "pending" });
      await db.update(orders).set({ status: quantityFilled < order.quantity ? "partially_filled" : "settlement_pending", updatedAt: now }).where(eq(orders.id, id));
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "TRADE_CAPTURED", entityType: "trade", entityId: tradeId, summary: `${quantityFilled} ${instrument.symbol} captured at ${executionPrice} ETB`, newValue: JSON.stringify({ ...amounts, settlementDate }) });
      return Response.json({ ok: true, status: quantityFilled < order.quantity ? "partially_filled" : "settlement_pending", trade: { id: tradeId, settlementId, settlementDate, ...amounts } });
    } else if (payload.action === "settle") {
      const [trade] = await db.select().from(trades).where(eq(trades.orderId, id)).limit(1);
      if (!trade) return Response.json({ error: "No captured trade exists for this order." }, { status: 409 });
      const [settlement] = await db.select().from(settlements).where(eq(settlements.tradeId, trade.id)).limit(1);
      if (!settlement) return Response.json({ error: "Settlement record not found." }, { status: 404 });
      const [account] = await db.select().from(accounts).where(eq(accounts.id, order.accountId)).limit(1);
      if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
      const [holding] = await db.select().from(holdings).where(and(eq(holdings.accountId, order.accountId), eq(holdings.instrumentId, order.instrumentId))).limit(1);
      if (order.side === "buy") {
        await db.update(accounts).set({ totalCash: account.totalCash - trade.netAmount, blockedCash: Math.max(0, account.blockedCash - order.estimatedNet), updatedAt: now }).where(eq(accounts.id, account.id));
        if (holding) {
          await db.update(holdings).set({ totalQuantity: holding.totalQuantity + trade.quantityFilled, availableQuantity: holding.availableQuantity + trade.quantityFilled, updatedAt: now }).where(eq(holdings.id, holding.id));
        } else {
          await db.insert(holdings).values({ id: crypto.randomUUID(), accountId: order.accountId, instrumentId: order.instrumentId, totalQuantity: trade.quantityFilled, availableQuantity: trade.quantityFilled, averageCost: trade.executionPrice });
        }
      } else {
        await db.update(accounts).set({ totalCash: account.totalCash + trade.netAmount, availableCash: account.availableCash + trade.netAmount, updatedAt: now }).where(eq(accounts.id, account.id));
        if (holding) await db.update(holdings).set({ totalQuantity: holding.totalQuantity - trade.quantityFilled, blockedQuantity: Math.max(0, holding.blockedQuantity - trade.quantityFilled), updatedAt: now }).where(eq(holdings.id, holding.id));
      }
      await db.update(settlements).set({ status: "settled", cashStatus: "settled", securitiesStatus: "settled", confirmedBy: actor.id, confirmedAt: now, updatedAt: now }).where(eq(settlements.id, settlement.id));
      await db.update(orders).set({ status: "settled", updatedAt: now }).where(eq(orders.id, id));
      await db.insert(cashLedgerEntries).values({ id: crypto.randomUUID(), accountId: order.accountId, orderId: id, tradeId: trade.id, entryType: order.side === "buy" ? "trade_debit" : "trade_credit", amount: order.side === "buy" ? -trade.netAmount : trade.netAmount, runningBalance: order.side === "buy" ? account.totalCash - trade.netAmount : account.totalCash + trade.netAmount, description: `Settlement for ${trade.id}`, valueDate: settlement.settlementDate, createdBy: actor.id });
      await db.insert(securitiesLedgerEntries).values({ id: crypto.randomUUID(), accountId: order.accountId, instrumentId: order.instrumentId, orderId: id, tradeId: trade.id, entryType: order.side === "buy" ? "trade_receipt" : "trade_delivery", quantity: order.side === "buy" ? trade.quantityFilled : -trade.quantityFilled, runningQuantity: order.side === "buy" ? (holding?.totalQuantity ?? 0) + trade.quantityFilled : (holding?.totalQuantity ?? 0) - trade.quantityFilled, description: `Settlement for ${trade.id}`, valueDate: settlement.settlementDate, createdBy: actor.id });
    } else {
      return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
    }

    await db.insert(auditLogs).values({ id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: `ORDER_${payload.action?.toUpperCase()}`, entityType: "order", entityId: id, summary: `${payload.action} completed for ${id}`, previousValue: JSON.stringify({ status: order.status }) });
    return Response.json({ ok: true, status: payload.action === "approve" ? "approved" : payload.action === "reject" ? "rejected" : payload.action === "settle" ? "settled" : "cancelled" });
  } catch (error) {
    return routeError(error);
  }
}
