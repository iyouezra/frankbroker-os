import { prisma } from "../../../lib/prisma";
import { computeAmounts, D, toNum } from "../../../lib/money";
import { resolveInvestorContext } from "../../../lib/server-auth";
import { apiError as routeError } from "../../../lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { brokerId, clientId } = resolveInvestorContext(request);
    const [broker, client] = await Promise.all([
      prisma.broker.findUnique({
        where: { id: brokerId },
        include: {
          settings: true,
          instrumentAccess: { where: { enabled: true }, include: { instrument: true } },
        },
      }),
      prisma.client.findFirst({
        where: { id: clientId, brokerId },
        include: {
          accounts: {
            include: {
              holdings: { include: { instrument: true } },
              orders: { include: { instrument: true }, orderBy: { createdAt: "desc" }, take: 25 },
            },
          },
        },
      }),
    ]);
    if (!broker) return Response.json({ error: "Tenant not found." }, { status: 404 });
    const account = client?.accounts[0];
    return Response.json({
      tenant: {
        id: broker.id,
        name: broker.settings?.tradingName ?? broker.name,
        primaryColor: broker.settings?.primaryColor ?? "#0C8189",
        welcomeMessage: broker.settings?.welcomeMessage,
        supportEmail: broker.settings?.supportEmail,
        features: broker.settings?.features ?? {},
        brokerageFeePct: toNum(broker.settings?.brokerageFeePct),
        minimumFee: toNum(broker.settings?.minimumFee),
        allowedOrderTypes: broker.settings?.allowedOrderTypes ?? ["Market", "Limit"],
      },
      profile: client ? {
        id: client.id, fullName: client.fullName, clientType: client.clientType, phone: client.phone,
        kycStatus: client.kycStatus, faydaMasked: client.faydaLast4 ? `•••• •••• ${client.faydaLast4}` : null,
        taxIdMasked: client.taxIdLast4 ? `••••••${client.taxIdLast4}` : null,
      } : null,
      account: account ? {
        id: account.id, accountNumber: account.accountNumber, totalCash: toNum(account.totalCash),
        availableCash: toNum(account.availableCash), blockedCash: toNum(account.blockedCash), status: account.status,
        holdings: account.holdings.map((holding) => ({
          instrumentId: holding.instrumentId, ticker: holding.instrument.symbol, name: holding.instrument.name,
          quantity: toNum(holding.totalQuantity), availableQuantity: toNum(holding.availableQuantity),
          averageCost: toNum(holding.averageCost), price: toNum(holding.instrument.lastPrice),
        })),
        orders: account.orders.map((order) => ({
          id: order.id, ticker: order.instrument.symbol, side: order.side, quantity: toNum(order.quantity),
          price: toNum(order.price), status: order.status, createdAt: order.createdAt.toISOString(),
        })),
      } : null,
      instruments: broker.instrumentAccess.map(({ instrument }) => ({
        id: instrument.id, ticker: instrument.symbol, name: instrument.name, assetClass: instrument.assetClass,
        price: toNum(instrument.lastPrice), status: instrument.tradingStatus, lotSize: instrument.lotSize,
      })),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const { brokerId, clientId } = resolveInvestorContext(request);
    const payload = await request.json() as Record<string, unknown>;

    if (payload.action === "kyc") {
      const fullName = String(payload.fullName ?? "").trim();
      const faydaId = String(payload.faydaId ?? "").replace(/\D/g, "");
      const tin = String(payload.tin ?? "").replace(/\D/g, "");
      if (!fullName || faydaId.length < 4 || tin.length < 4) {
        return Response.json({ error: "Name, Fayda ID, and TIN are required." }, { status: 400 });
      }
      const client = await prisma.client.findFirst({ where: { id: clientId, brokerId } });
      if (!client) return Response.json({ error: "Demo investor profile is not seeded." }, { status: 404 });

      // The raw identifiers are deliberately never stored. Production should send
      // them directly to an Ethiopia-resident identity provider and retain only its reference.
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.client.update({ where: { id: client.id }, data: {
          fullName,
          clientType: payload.accountType === "institution" ? "institution" : "individual",
          phone: String(payload.phone ?? "") || null,
          identityReference: `demo_fayda_${crypto.randomUUID()}`,
          faydaLast4: faydaId.slice(-4), taxIdLast4: tin.slice(-4), taxId: null,
          kycStatus: "approved", riskRating: "standard", status: "active", kycConsentAt: new Date(),
        } });
        await tx.account.updateMany({ where: { clientId: client.id }, data: { status: "active" } });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "INVESTOR_KYC_DEMO_COMPLETED",
          entityType: "client", entityId: client.id, summary: `Demo KYC completed for ${fullName}; only masked identifiers retained`,
        } });
        return next;
      });
      return Response.json({ profile: { id: updated.id, fullName: updated.fullName, kycStatus: updated.kycStatus } });
    }

    if (payload.action === "order") {
      const [client, instrument, settings, entitlement] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: { include: { holdings: true } } } }),
        prisma.instrument.findUnique({ where: { symbol: String(payload.symbol ?? "") } }),
        prisma.brokerSettings.findUnique({ where: { brokerId } }),
        prisma.brokerInstrument.findFirst({ where: { brokerId, instrument: { symbol: String(payload.symbol ?? "") }, enabled: true } }),
      ]);
      const account = client?.accounts[0];
      if (!client || !account) return Response.json({ error: "Investor account not found." }, { status: 404 });
      if (!instrument || !entitlement) return Response.json({ error: "This instrument is not enabled for the tenant." }, { status: 404 });

      const side = payload.side === "sell" ? "sell" : "buy";
      const quantity = D(String(payload.quantity ?? 0));
      const price = D(String(payload.price ?? instrument.lastPrice ?? 0));
      const features = (settings?.features ?? {}) as Record<string, unknown>;
      const fractionalAllowed = features.fractionalOrders === true;
      const orderType = String(payload.orderType ?? "market").toLowerCase().replace("-", "_");
      const allowedTypes = (settings?.allowedOrderTypes ?? ["Market", "Limit"]) as string[];
      const feeRate = settings ? settings.brokerageFeePct.div(100) : undefined;
      const amounts = computeAmounts(side, quantity, price, feeRate, settings?.minimumFee);
      const holding = account.holdings.find((item) => item.instrumentId === instrument.id);
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const dayAgg = await prisma.order.aggregate({ where: { accountId: account.id, submittedAt: { gte: startOfDay }, status: { notIn: ["rejected", "validation_failed", "cancelled"] } }, _sum: { estimatedGross: true } });
      const projectedToday = (dayAgg._sum.estimatedGross ?? D(0)).plus(amounts.gross);
      const checks = [
        { code: "KYC_APPROVED", passed: client.kycStatus === "approved", message: "Investor KYC must be approved" },
        { code: "ACCOUNT_ACTIVE", passed: account.status === "active" && client.status === "active", message: "Investor account must be active" },
        { code: "TENANT_INSTRUMENT", passed: entitlement.enabled && instrument.tradingStatus === "tradable", message: "Instrument must be enabled and tradable" },
        { code: "ORDER_TYPE", passed: allowedTypes.some((item) => item.toLowerCase().replace("-", "_") === orderType), message: "Order type must be enabled by the tenant" },
        { code: "QUANTITY_VALID", passed: quantity.gt(0) && (fractionalAllowed || quantity.mod(instrument.lotSize).isZero()), message: fractionalAllowed ? "Quantity must be positive" : `Quantity must be a multiple of ${instrument.lotSize}` },
        side === "buy"
          ? { code: "SUFFICIENT_CASH", passed: account.availableCash.gte(amounts.net), message: "Sufficient available cash is required" }
          : { code: "SUFFICIENT_HOLDINGS", passed: Boolean(holding?.availableQuantity.gte(quantity)), message: "Sufficient available holdings are required" },
        { code: "DAILY_LIMIT", passed: !settings?.clientDailyLimit || projectedToday.lte(settings.clientDailyLimit), message: settings?.clientDailyLimit ? `Within the ${toNum(settings.clientDailyLimit).toLocaleString()} ETB daily limit` : "No daily limit configured" },
      ];
      const valid = checks.every((check) => check.passed);
      const id = `ORD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const now = new Date();
      const status = valid ? "pending_broker_review" : "validation_failed";
      const riskFlag = settings && amounts.net.gte(settings.approvalThreshold) ? "review" : "none";
      await prisma.$transaction([
        prisma.order.create({ data: {
          id, brokerId, accountId: account.id, instrumentId: instrument.id, side, quantity, price,
          orderType, validity: "day", estimatedGross: amounts.gross, estimatedFees: amounts.fees, estimatedNet: amounts.net,
          status, source: "investor_portal", riskFlag, submittedAt: now,
          validations: { create: checks.map((check) => ({ id: crypto.randomUUID(), ruleCode: check.code, label: check.code.replaceAll("_", " "), result: check.passed ? "passed" : "failed", message: check.message })) },
          events: { create: { id: crypto.randomUUID(), toStatus: status, actorId: null, reason: valid ? "Investor order passed pre-trade validation" : "Investor order failed pre-trade validation", detail: JSON.stringify({ checks }) } },
        } }),
        prisma.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "INVESTOR_ORDER_SUBMITTED", entityType: "order", entityId: id,
          summary: `${side.toUpperCase()} ${toNum(quantity)} ${instrument.symbol} submitted from investor portal`,
          newValue: JSON.stringify({ status, gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net) }),
        } }),
      ]);
      return Response.json({ order: { id, status, gross: toNum(amounts.gross), fees: toNum(amounts.fees), net: toNum(amounts.net) }, checks }, { status: 201 });
    }

    return Response.json({ error: "Unsupported investor action." }, { status: 400 });
  } catch (error) { return routeError(error); }
}
