import { prisma } from "../../../lib/prisma";
import { requirePermission, resolveActor } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError as routeError } from "../../../lib/api";
import { normalizeOrderType, parseOrderSide, parsePositiveFiniteNumber } from "../../../lib/order-input";
import { createSubmittedOrder } from "../../../lib/oms/order-service";
import { availableActions } from "../../../lib/oms/status";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = resolveActor(request);
    const rows = await prisma.order.findMany({
      where: { brokerId: actor.brokerId },
      include: {
        account: { include: { client: true } },
        instrument: true,
        assignedTrader: true,
        trades: { include: { settlement: true, capturedByUser: true }, orderBy: { capturedAt: "asc" } },
        events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
        cashLedgerEntries: { orderBy: { createdAt: "asc" } },
        securityLedgerEntries: { include: { instrument: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });
    const orderIds = rows.map((order) => order.id);
    const tradeIds = rows.flatMap((order) => order.trades.map((trade) => trade.id));
    const settlementIds = rows.flatMap((order) => order.trades.flatMap((trade) => trade.settlement ? [trade.settlement.id] : []));
    const auditRows = await prisma.auditLog.findMany({
      where: {
        brokerId: actor.brokerId,
        OR: [
          { entityType: "order", entityId: { in: orderIds } },
          { entityType: "trade", entityId: { in: tradeIds } },
          { entityType: "settlement", entityId: { in: settlementIds } },
        ],
      },
      include: { actor: true },
      orderBy: { createdAt: "asc" },
    });

    return Response.json({
      orders: rows.map((order) => {
        const latestTrade = order.trades.at(-1);
        const baseActions: readonly string[] = availableActions(order.status);
        return {
        id: order.id,
        createdAt: (order.submittedAt ?? order.createdAt).toISOString(),
        client: order.account.client.fullName,
        clientCode: order.account.client.clientCode,
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        symbol: order.instrument.symbol,
        side: order.side,
        quantity: toNum(order.quantity),
        price: toNum(order.price),
        triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
        orderType: order.orderType,
        estimatedGross: toNum(order.estimatedGross),
        estimatedFees: toNum(order.estimatedFees),
        estimatedNet: toNum(order.estimatedNet),
        status: order.status,
        source: order.source,
        riskFlag: order.riskFlag,
        trader: order.assignedTrader?.fullName ?? "Unassigned",
        filledQuantity: toNum(order.filledQuantity),
        remainingQuantity: toNum(order.remainingQuantity),
        averageFillPrice: order.averageFillPrice ? toNum(order.averageFillPrice) : null,
        executedGross: toNum(order.executedGross),
        executedFees: toNum(order.executedFees),
        executedNet: toNum(order.executedNet),
        blockedCash: toNum(order.blockedCash),
        blockedQuantity: toNum(order.blockedQuantity),
        contractNoteNumber: order.contractNoteNumber,
        contractNoteGeneratedAt: order.contractNoteGeneratedAt?.toISOString(),
        availableActions: [
          ...baseActions,
          ...(!baseActions.includes("contract_note") && order.trades.length && (order.remainingQuantity.isZero() || ["cancelled", "failed"].includes(order.status)) ? ["contract_note"] : []),
          ...(!baseActions.includes("settle") && order.trades.some((trade) => trade.settlement?.status !== "settled") ? ["settle"] : []),
        ],
        tradeId: latestTrade?.id,
        capturedBy: latestTrade?.capturedByUser.fullName,
        tradeDate: latestTrade?.tradeDate.toISOString().slice(0, 10),
        settlementDate: latestTrade?.settlementDate.toISOString().slice(0, 10),
        tradeQuantity: latestTrade ? toNum(latestTrade.quantityFilled) : undefined,
        executionPrice: latestTrade ? toNum(latestTrade.executionPrice) : undefined,
        tradeGross: latestTrade ? toNum(latestTrade.grossAmount) : undefined,
        tradeFees: latestTrade ? toNum(latestTrade.fees) : undefined,
        tradeNet: latestTrade ? toNum(latestTrade.netAmount) : undefined,
        cashStatus: latestTrade?.settlement?.cashStatus,
        securitiesStatus: latestTrade?.settlement?.securitiesStatus,
        trades: order.trades.map((trade) => ({
          id: trade.id,
          quantity: toNum(trade.quantityFilled),
          executionPrice: toNum(trade.executionPrice),
          gross: toNum(trade.grossAmount),
          fees: toNum(trade.fees),
          net: toNum(trade.netAmount),
          tradeDate: trade.tradeDate.toISOString().slice(0, 10),
          settlementDate: trade.settlementDate.toISOString().slice(0, 10),
          settlementStatus: trade.settlement?.status ?? "missing",
          cashStatus: trade.settlement?.cashStatus ?? "missing",
          securitiesStatus: trade.settlement?.securitiesStatus ?? "missing",
          capturedBy: trade.capturedByUser.fullName,
          capturedAt: trade.capturedAt.toISOString(),
        })),
        ledgerEntries: [
          ...order.cashLedgerEntries.map((entry) => ({
            id: entry.id,
            ledger: "cash",
            entryType: entry.entryType,
            amount: toNum(entry.amount),
            totalImpact: toNum(entry.totalImpact),
            availableImpact: toNum(entry.availableImpact),
            blockedImpact: toNum(entry.blockedImpact),
            unsettledImpact: toNum(entry.unsettledImpact),
            runningBalance: toNum(entry.runningBalance),
            description: entry.description,
            reason: entry.reason,
            tradeId: entry.tradeId,
            createdAt: entry.createdAt.toISOString(),
          })),
          ...order.securityLedgerEntries.map((entry) => ({
            id: entry.id,
            ledger: "securities",
            entryType: entry.entryType,
            quantity: toNum(entry.quantity),
            totalImpact: toNum(entry.totalImpact),
            availableImpact: toNum(entry.availableImpact),
            blockedImpact: toNum(entry.blockedImpact),
            unsettledImpact: toNum(entry.unsettledImpact),
            runningQuantity: toNum(entry.runningQuantity),
            description: entry.description,
            reason: entry.reason,
            tradeId: entry.tradeId,
            symbol: entry.instrument.symbol,
            createdAt: entry.createdAt.toISOString(),
          })),
        ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
        auditTrail: auditRows
          .filter((entry) => entry.entityId === order.id || tradeIdsForOrder(order).includes(entry.entityId ?? ""))
          .map((entry) => ({
            id: entry.id,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            actor: entry.actor?.fullName ?? "System",
            summary: entry.summary,
            reason: entry.reason,
            previousValue: entry.previousValue,
            newValue: entry.newValue,
            createdAt: entry.createdAt.toISOString(),
          })),
        events: order.events.map((event) => ({
          id: event.id,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          reason: event.reason,
          actor: event.actor?.fullName ?? "System",
          createdAt: event.createdAt.toISOString(),
        })),
        };
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}

function tradeIdsForOrder(order: {
  trades: Array<{ id: string; settlement: { id: string } | null }>;
}) {
  return order.trades.flatMap((trade) => [trade.id, ...(trade.settlement ? [trade.settlement.id] : [])]);
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, "create");
    const payload = (await request.json()) as {
      accountId?: string;
      instrumentId?: string;
      side?: "buy" | "sell";
      quantity?: number;
      price?: number;
      triggerPrice?: number;
      orderType?: string;
      validity?: string;
      notes?: string;
      submissionReference?: string;
      source?: string;
      verificationId?: string;
    };

    const side = parseOrderSide(payload.side);
    const quantityInput = parsePositiveFiniteNumber(payload.quantity);
    const priceInput = parsePositiveFiniteNumber(payload.price);
    const triggerPriceInput = payload.triggerPrice === undefined ? null : parsePositiveFiniteNumber(payload.triggerPrice);
    if (!payload.accountId || !payload.instrumentId || !side || quantityInput === null || priceInput === null || !payload.submissionReference?.trim()) {
      return Response.json(
        { error: "A valid account, instrument, buy/sell side, positive quantity, positive price, and submission reference are required." },
        { status: 400 },
      );
    }
    if ((payload.notes?.length ?? 0) > 2_000 || (payload.validity?.length ?? 0) > 40 || (payload.orderType?.length ?? 0) > 40 || payload.submissionReference.length > 120) {
      return Response.json({ error: "Order text fields exceed the permitted length." }, { status: 400 });
    }

    const result = await createSubmittedOrder(actor, {
      accountId: payload.accountId,
      instrumentId: payload.instrumentId,
      side,
      quantity: quantityInput,
      price: priceInput,
      triggerPrice: triggerPriceInput,
      orderType: normalizeOrderType(payload.orderType ?? "limit"),
      validity: payload.validity,
      notes: payload.notes,
      source: payload.source,
      verificationId: payload.verificationId,
      submissionReference: payload.submissionReference?.trim() || undefined,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
