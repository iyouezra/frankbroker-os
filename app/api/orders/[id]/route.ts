import { apiError } from "../../../../lib/api";
import { toNum } from "../../../../lib/money";
import { availableActions } from "../../../../lib/oms/status";
import { orderResponsibility } from "../../../../lib/order-log";
import { prisma } from "../../../../lib/prisma";
import { requireTenantModule } from "../../../../lib/tenant-capabilities";

const feeBreakdown = (value: unknown) => {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { brokerage: Number(data.brokerage ?? 0), regulator: Number(data.regulator ?? 0), exchange: Number(data.exchange ?? 0), csd: Number(data.csd ?? 0), total: Number(data.total ?? 0), policy: data.policy };
};

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const { id } = await context.params;
    const order = await prisma.order.findFirst({
      where: { id, brokerId: actor.brokerId },
      include: {
        account: { include: { client: true } },
        instrument: true,
        assignedTrader: true,
        approver: true,
        validations: { orderBy: { checkedAt: "asc" } },
        trades: { include: { settlement: true, capturedByUser: true }, orderBy: { capturedAt: "asc" } },
        events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
        cashLedgerEntries: { orderBy: { createdAt: "asc" } },
        securityLedgerEntries: { include: { instrument: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

    const tradeIds = order.trades.map((trade) => trade.id);
    const settlementIds = order.trades.flatMap((trade) => trade.settlement ? [trade.settlement.id] : []);
    const auditRows = await prisma.auditLog.findMany({
      where: {
        brokerId: actor.brokerId,
        OR: [
          { entityType: "order", entityId: order.id },
          { entityType: "trade", entityId: { in: tradeIds } },
          { entityType: "settlement", entityId: { in: settlementIds } },
        ],
      },
      include: { actor: true },
      orderBy: { createdAt: "asc" },
    });
    const latestTrade = order.trades.at(-1);
    const baseActions: readonly string[] = availableActions(order.status);
    const trader = order.assignedTrader?.fullName ?? "Unassigned";

    return Response.json({
      order: {
        id: order.id,
        createdAt: (order.submittedAt ?? order.createdAt).toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        client: order.account.client.fullName,
        clientCode: order.account.client.clientCode,
        accountId: order.accountId,
        accountNumber: order.account.accountNumber,
        instrumentId: order.instrumentId,
        symbol: order.instrument.symbol,
        side: order.side,
        quantity: toNum(order.quantity),
        price: toNum(order.price),
        triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
        orderType: order.orderType,
        validity: order.validity,
        submissionReference: order.submissionReference,
        estimatedGross: toNum(order.estimatedGross),
        estimatedFees: toNum(order.estimatedFees),
        estimatedFeeBreakdown: feeBreakdown(order.estimatedFeeBreakdown),
        estimatedNet: toNum(order.estimatedNet),
        status: order.status,
        source: order.source,
        riskFlag: order.riskFlag,
        trader,
        approvedBy: order.approver?.fullName ?? null,
        approvedAt: order.approvedAt?.toISOString() ?? null,
        rejectionReason: order.rejectionReason,
        notes: order.notes,
        ...orderResponsibility(order.status, trader === "Unassigned" ? null : trader),
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
          captureReference: trade.captureReference,
          quantity: toNum(trade.quantityFilled),
          executionPrice: toNum(trade.executionPrice),
          gross: toNum(trade.grossAmount),
          fees: toNum(trade.fees),
          feeBreakdown: feeBreakdown(trade.feeBreakdown),
          net: toNum(trade.netAmount),
          tradeDate: trade.tradeDate.toISOString().slice(0, 10),
          settlementDate: trade.settlementDate.toISOString().slice(0, 10),
          settlementStatus: trade.settlement?.status ?? "missing",
          cashStatus: trade.settlement?.cashStatus ?? "missing",
          securitiesStatus: trade.settlement?.securitiesStatus ?? "missing",
          capturedBy: trade.capturedByUser.fullName,
          capturedAt: trade.capturedAt.toISOString(),
        })),
        validations: order.validations.map((validation) => ({
          id: validation.id,
          code: validation.ruleCode,
          label: validation.label,
          passed: validation.result === "passed",
          message: validation.message,
          checkedAt: validation.checkedAt.toISOString(),
        })),
        ledgerEntries: [
          ...order.cashLedgerEntries.map((entry) => ({
            id: entry.id,
            ledger: "cash" as const,
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
            ledger: "securities" as const,
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
        auditTrail: auditRows.map((entry) => ({
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
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
