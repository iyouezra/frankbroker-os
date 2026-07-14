import { prisma } from "../../../lib/prisma";
import { requirePermission, resolveActor } from "../../../lib/server-auth";
import { computeAmounts, D, toNum } from "../../../lib/money";
import { apiError as routeError } from "../../../lib/api";

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
        trades: { include: { settlement: true }, orderBy: { capturedAt: "asc" } },
        events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });

    return Response.json({
      orders: rows.map((order) => {
        const filledQuantity = order.trades.reduce((total, trade) => total.plus(trade.quantityFilled), D(0));
        const latestTrade = order.trades.at(-1);
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
        orderType: order.orderType,
        estimatedGross: toNum(order.estimatedGross),
        estimatedFees: toNum(order.estimatedFees),
        estimatedNet: toNum(order.estimatedNet),
        status: order.status,
        source: order.source,
        riskFlag: order.riskFlag,
        trader: order.assignedTrader?.fullName ?? "Unassigned",
        filledQuantity: toNum(filledQuantity),
        remainingQuantity: toNum(order.quantity.minus(filledQuantity)),
        tradeId: latestTrade?.id,
        settlementDate: latestTrade?.settlementDate.toISOString().slice(0, 10),
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

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, "create");
    const payload = (await request.json()) as {
      accountId?: string;
      instrumentId?: string;
      side?: "buy" | "sell";
      quantity?: number;
      price?: number;
      orderType?: string;
      validity?: string;
      notes?: string;
    };

    const quantityInput = Number(payload.quantity);
    const priceInput = Number(payload.price);
    if (!payload.accountId || !payload.instrumentId || !payload.side || !quantityInput || !priceInput) {
      return Response.json(
        { error: "Account, instrument, side, quantity, and price are required." },
        { status: 400 },
      );
    }

    const [account, instrument, entitlement, settings] = await Promise.all([
      prisma.account.findUnique({
        where: { id: payload.accountId },
        include: {
          client: true,
          holdings: { where: { instrumentId: payload.instrumentId } },
        },
      }),
      prisma.instrument.findUnique({ where: { id: payload.instrumentId } }),
      prisma.brokerInstrument.findUnique({
        where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId: payload.instrumentId } },
      }),
      prisma.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
    ]);

    if (!account || !instrument) {
      return Response.json({ error: "The selected client account or instrument does not exist." }, { status: 404 });
    }
    if (account.client.brokerId !== actor.brokerId) {
      return Response.json({ error: "The selected account does not belong to this tenant." }, { status: 403 });
    }

    const quantity = D(quantityInput);
    const price = D(priceInput);
    const holding = account.holdings[0];
    const feeRate = settings ? settings.brokerageFeePct.div(100) : undefined;
    const amounts = computeAmounts(payload.side, quantity, price, feeRate, settings?.minimumFee);

    // Committed notional booked for this account so far today (excludes orders
    // that never consumed limit: rejected, cancelled, validation-failed).
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dayAgg = await prisma.order.aggregate({
      where: { accountId: account.id, submittedAt: { gte: startOfDay }, status: { notIn: ["rejected", "validation_failed", "cancelled"] } },
      _sum: { estimatedGross: true },
    });
    const projectedToday = (dayAgg._sum.estimatedGross ?? D(0)).plus(amounts.gross);

    const checks = [
      { code: "CLIENT_EXISTS", label: "Client exists", passed: Boolean(account.clientId), message: "Client profile found" },
      { code: "KYC_APPROVED", label: "KYC approved", passed: account.client.kycStatus === "approved", message: account.client.kycStatus === "approved" ? "KYC is current" : "KYC approval is required" },
      { code: "ACCOUNT_ACTIVE", label: "Account active", passed: account.status === "active" && account.client.status === "active", message: account.status === "active" ? "Trading account is active" : "Trading account is not active" },
      { code: "INSTRUMENT_TRADABLE", label: "Instrument tradable", passed: instrument.tradingStatus === "tradable" && entitlement?.enabled === true, message: instrument.tradingStatus === "tradable" && entitlement?.enabled === true ? "Instrument is enabled for this tenant" : "Instrument is not available to this tenant" },
      { code: "QUANTITY_VALID", label: "Quantity valid", passed: quantity.gt(0) && quantity.mod(instrument.lotSize).isZero(), message: `Must be a positive multiple of ${instrument.lotSize}` },
      { code: "PRICE_VALID", label: "Price valid", passed: price.gt(0) && price.div(instrument.tickSize).isInteger(), message: `Must align to the ${instrument.tickSize.toString()} tick size` },
      payload.side === "buy"
        ? { code: "SUFFICIENT_CASH", label: "Sufficient available cash", passed: account.availableCash.gte(amounts.net), message: `${toNum(account.availableCash).toLocaleString()} ETB available including estimated fees` }
        : { code: "SUFFICIENT_HOLDINGS", label: "Sufficient available holdings", passed: Boolean(holding && holding.availableQuantity.gte(quantity)), message: `${toNum(holding?.availableQuantity).toLocaleString()} units available and unblocked` },
      { code: "DAILY_LIMIT", label: "Within daily trading limit", passed: !settings?.clientDailyLimit || projectedToday.lte(settings.clientDailyLimit), message: settings?.clientDailyLimit ? `${toNum(projectedToday).toLocaleString()} / ${toNum(settings.clientDailyLimit).toLocaleString()} ETB used today` : "No daily limit configured" },
    ];

    const valid = checks.every((check) => check.passed);
    const id = `ORD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const now = new Date();
    const riskFlag = amounts.net.gte(2_000_000) ? "review" : "none";
    const status = valid ? "pending_broker_review" : "validation_failed";

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id,
          brokerId: actor.brokerId,
          accountId: payload.accountId!,
          instrumentId: payload.instrumentId!,
          side: payload.side!,
          quantity,
          price,
          orderType: payload.orderType ?? "limit",
          validity: payload.validity ?? "day",
          estimatedGross: amounts.gross,
          estimatedFees: amounts.fees,
          estimatedNet: amounts.net,
          status,
          source: "manual",
          riskFlag,
          notes: payload.notes?.trim() || null,
          submittedAt: now,
          validations: {
            create: checks.map((check) => ({
              id: crypto.randomUUID(),
              ruleCode: check.code,
              label: check.label,
              result: check.passed ? "passed" : "failed",
              message: check.message,
            })),
          },
          events: {
            create: {
              id: crypto.randomUUID(),
              toStatus: status,
              actorId: actor.id,
              reason: valid ? "Pre-trade validation passed" : "Pre-trade validation failed",
              detail: JSON.stringify({ checks: checks.map((c) => ({ code: c.code, passed: c.passed })) }),
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "ORDER_CREATED",
          entityType: "order",
          entityId: id,
          summary: `${payload.side!.toUpperCase()} order created for ${account.client.fullName}: ${toNum(quantity)} ${instrument.symbol} at ${toNum(price)} ETB`,
          newValue: JSON.stringify({ status, riskFlag, gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net) }),
        },
      });
    });

    return Response.json(
      {
        order: {
          id,
          createdAt: now.toISOString(),
          client: account.client.fullName,
          clientCode: account.client.clientCode,
          accountId: payload.accountId,
          instrumentId: payload.instrumentId,
          symbol: instrument.symbol,
          side: payload.side,
          quantity: toNum(quantity),
          price: toNum(price),
          orderType: payload.orderType ?? "limit",
          estimatedGross: toNum(amounts.gross),
          estimatedFees: toNum(amounts.fees),
          estimatedNet: toNum(amounts.net),
          status,
          source: "manual",
          riskFlag,
        },
        checks,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
