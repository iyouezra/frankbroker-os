import { calculateOrderAmounts } from "../../../lib/frank";
import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";

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
        quantity: order.quantity,
        price: order.price,
        orderType: order.orderType,
        estimatedGross: order.estimatedGross,
        estimatedFees: order.estimatedFees,
        estimatedNet: order.estimatedNet,
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

    const quantity = Number(payload.quantity);
    const price = Number(payload.price);
    if (!payload.accountId || !payload.instrumentId || !payload.side || !quantity || !price) {
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

    const holding = account.holdings[0];
    const amounts = calculateOrderAmounts(payload.side, quantity, price);
    const checks = [
      { code: "CLIENT_EXISTS", label: "Client exists", passed: Boolean(account.clientId), message: "Client profile found" },
      { code: "KYC_APPROVED", label: "KYC approved", passed: account.client.kycStatus === "approved", message: account.client.kycStatus === "approved" ? "KYC is current" : "KYC approval is required" },
      { code: "ACCOUNT_ACTIVE", label: "Account active", passed: account.status === "active" && account.client.status === "active", message: account.status === "active" ? "Trading account is active" : "Trading account is not active" },
      { code: "INSTRUMENT_TRADABLE", label: "Instrument tradable", passed: instrument.tradingStatus === "tradable", message: instrument.tradingStatus === "tradable" ? "Instrument is open for manual trading" : "Instrument is not tradable" },
      { code: "QUANTITY_VALID", label: "Quantity valid", passed: quantity > 0 && quantity % instrument.lotSize === 0, message: `Must be a positive multiple of ${instrument.lotSize}` },
      { code: "PRICE_VALID", label: "Price valid", passed: price > 0 && Math.abs(price / instrument.tickSize - Math.round(price / instrument.tickSize)) < 0.000001, message: `Must align to the ${instrument.tickSize} tick size` },
      payload.side === "buy"
        ? { code: "SUFFICIENT_CASH", label: "Sufficient available cash", passed: account.availableCash >= amounts.net, message: `${account.availableCash.toLocaleString()} ETB available including estimated fees` }
        : { code: "SUFFICIENT_HOLDINGS", label: "Sufficient available holdings", passed: Boolean(holding && holding.availableQuantity >= quantity), message: `${holding?.availableQuantity ?? 0} units available and unblocked` },
    ];

    const valid = checks.every((check) => check.passed);
    const id = `ORD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const now = new Date();
    const riskFlag = amounts.net >= 2_000_000 ? "review" : "none";
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
          summary: `${payload.side!.toUpperCase()} order created for ${account.client.fullName}: ${quantity} ${instrument.symbol} at ${price} ETB`,
          newValue: JSON.stringify({ status, riskFlag, ...amounts }),
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
          quantity,
          price,
          orderType: payload.orderType ?? "limit",
          estimatedGross: amounts.gross,
          estimatedFees: amounts.fees,
          estimatedNet: amounts.net,
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
