import { desc, eq } from "drizzle-orm";
import { ensureDb, getDb } from "../../../db";
import {
  accounts,
  auditLogs,
  clients,
  holdings,
  instruments,
  orders,
  orderValidations,
} from "../../../db/schema";
import { calculateOrderAmounts } from "../../../lib/frank";
import { requirePermission } from "../../../lib/server-auth";

function routeError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    await ensureDb();
    const db = getDb();
    const rows = await db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        client: clients.fullName,
        clientCode: clients.clientCode,
        accountId: accounts.id,
        instrumentId: instruments.id,
        symbol: instruments.symbol,
        side: orders.side,
        quantity: orders.quantity,
        price: orders.price,
        orderType: orders.orderType,
        estimatedGross: orders.estimatedGross,
        estimatedFees: orders.estimatedFees,
        estimatedNet: orders.estimatedNet,
        status: orders.status,
        source: orders.source,
        riskFlag: orders.riskFlag,
      })
      .from(orders)
      .innerJoin(accounts, eq(orders.accountId, accounts.id))
      .innerJoin(clients, eq(accounts.clientId, clients.id))
      .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    return Response.json({ orders: rows });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, "create");
    await ensureDb();
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
      return Response.json({ error: "Account, instrument, side, quantity, and price are required." }, { status: 400 });
    }

    const db = getDb();
    const [account] = await db
      .select({
        id: accounts.id,
        status: accounts.status,
        availableCash: accounts.availableCash,
        clientId: clients.id,
        clientName: clients.fullName,
        kycStatus: clients.kycStatus,
        clientStatus: clients.status,
      })
      .from(accounts)
      .innerJoin(clients, eq(accounts.clientId, clients.id))
      .where(eq(accounts.id, payload.accountId))
      .limit(1);
    const [instrument] = await db
      .select()
      .from(instruments)
      .where(eq(instruments.id, payload.instrumentId))
      .limit(1);
    const [holding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.accountId, payload.accountId))
      .limit(1);

    if (!account || !instrument) {
      return Response.json({ error: "The selected client account or instrument does not exist." }, { status: 404 });
    }

    const amounts = calculateOrderAmounts(payload.side, quantity, price);
    const checks = [
      { code: "CLIENT_EXISTS", label: "Client exists", passed: Boolean(account.clientId), message: "Client profile found" },
      { code: "KYC_APPROVED", label: "KYC approved", passed: account.kycStatus === "approved", message: account.kycStatus === "approved" ? "KYC is current" : "KYC approval is required" },
      { code: "ACCOUNT_ACTIVE", label: "Account active", passed: account.status === "active" && account.clientStatus === "active", message: account.status === "active" ? "Trading account is active" : "Trading account is not active" },
      { code: "INSTRUMENT_TRADABLE", label: "Instrument tradable", passed: instrument.tradingStatus === "tradable", message: instrument.tradingStatus === "tradable" ? "Instrument is open for manual trading" : "Instrument is not tradable" },
      { code: "QUANTITY_VALID", label: "Quantity valid", passed: quantity > 0 && quantity % instrument.lotSize === 0, message: `Must be a positive multiple of ${instrument.lotSize}` },
      { code: "PRICE_VALID", label: "Price valid", passed: price > 0 && Math.abs(price / instrument.tickSize - Math.round(price / instrument.tickSize)) < 0.000001, message: `Must align to the ${instrument.tickSize} tick size` },
      payload.side === "buy"
        ? { code: "SUFFICIENT_CASH", label: "Sufficient available cash", passed: account.availableCash >= amounts.net, message: `${account.availableCash.toLocaleString()} ETB available including estimated fees` }
        : { code: "SUFFICIENT_HOLDINGS", label: "Sufficient available holdings", passed: Boolean(holding && holding.instrumentId === payload.instrumentId && holding.availableQuantity >= quantity), message: `${holding?.availableQuantity ?? 0} units available and unblocked` },
    ];

    const valid = checks.every((check) => check.passed);
    const id = `ORD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const riskFlag = amounts.net >= 2_000_000 ? "review" : "none";
    const status = valid ? "pending_broker_review" : "validation_failed";

    await db.insert(orders).values({
      id,
      brokerId: actor.brokerId,
      accountId: payload.accountId,
      instrumentId: payload.instrumentId,
      side: payload.side,
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
    });

    for (const check of checks) {
      await db.insert(orderValidations).values({
        id: crypto.randomUUID(),
        orderId: id,
        ruleCode: check.code,
        label: check.label,
        result: check.passed ? "passed" : "failed",
        message: check.message,
      });
    }

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: id,
      summary: `${payload.side.toUpperCase()} order created for ${account.clientName}: ${quantity} ${instrument.symbol} at ${price} ETB`,
      newValue: JSON.stringify({ status, riskFlag, ...amounts }),
    });

    return Response.json({
      order: {
        id,
        createdAt: now,
        client: account.clientName,
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
    }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
