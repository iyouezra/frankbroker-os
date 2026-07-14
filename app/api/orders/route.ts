import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";
import { computeAmounts, D, toNum } from "../../../lib/money";

export const runtime = "nodejs";

function routeError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const rows = await prisma.order.findMany({
      include: {
        account: { include: { client: true } },
        instrument: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return Response.json({
      orders: rows.map((order) => ({
        id: order.id,
        createdAt: order.createdAt.toISOString(),
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
      })),
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

    const [account, instrument] = await Promise.all([
      prisma.account.findUnique({
        where: { id: payload.accountId },
        include: {
          client: true,
          holdings: { where: { instrumentId: payload.instrumentId } },
        },
      }),
      prisma.instrument.findUnique({ where: { id: payload.instrumentId } }),
    ]);

    if (!account || !instrument) {
      return Response.json({ error: "The selected client account or instrument does not exist." }, { status: 404 });
    }

    const quantity = D(quantityInput);
    const price = D(priceInput);
    const holding = account.holdings[0];
    const amounts = computeAmounts(payload.side, quantity, price);
    const checks = [
      { code: "CLIENT_EXISTS", label: "Client exists", passed: Boolean(account.clientId), message: "Client profile found" },
      { code: "KYC_APPROVED", label: "KYC approved", passed: account.client.kycStatus === "approved", message: account.client.kycStatus === "approved" ? "KYC is current" : "KYC approval is required" },
      { code: "ACCOUNT_ACTIVE", label: "Account active", passed: account.status === "active" && account.client.status === "active", message: account.status === "active" ? "Trading account is active" : "Trading account is not active" },
      { code: "INSTRUMENT_TRADABLE", label: "Instrument tradable", passed: instrument.tradingStatus === "tradable", message: instrument.tradingStatus === "tradable" ? "Instrument is open for manual trading" : "Instrument is not tradable" },
      { code: "QUANTITY_VALID", label: "Quantity valid", passed: quantity.gt(0) && quantity.mod(instrument.lotSize).isZero(), message: `Must be a positive multiple of ${instrument.lotSize}` },
      { code: "PRICE_VALID", label: "Price valid", passed: price.gt(0) && price.div(instrument.tickSize).isInteger(), message: `Must align to the ${instrument.tickSize.toString()} tick size` },
      payload.side === "buy"
        ? { code: "SUFFICIENT_CASH", label: "Sufficient available cash", passed: account.availableCash.gte(amounts.net), message: `${toNum(account.availableCash).toLocaleString()} ETB available including estimated fees` }
        : { code: "SUFFICIENT_HOLDINGS", label: "Sufficient available holdings", passed: Boolean(holding && holding.availableQuantity.gte(quantity)), message: `${toNum(holding?.availableQuantity).toLocaleString()} units available and unblocked` },
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
