import { prisma } from "../../../lib/prisma";
import { toNum } from "../../../lib/money";
import { resolveInvestorContext } from "../../../lib/server-auth";
import { apiError as routeError } from "../../../lib/api";
import { normalizeOrderType, parseOrderSide, parsePositiveFiniteNumber } from "../../../lib/order-input";
import { createSubmittedOrder } from "../../../lib/oms/order-service";

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
      if (!fullName || fullName.length > 160 || faydaId.length < 4 || faydaId.length > 32 || tin.length < 4 || tin.length > 32) {
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
      const [client, instrument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } }),
        prisma.instrument.findUnique({ where: { symbol: String(payload.symbol ?? "") } }),
      ]);
      const account = client?.accounts[0];
      if (!client || !account) return Response.json({ error: "Investor account not found." }, { status: 404 });
      if (!instrument) return Response.json({ error: "Instrument not found." }, { status: 404 });

      const side = parseOrderSide(payload.side);
      const quantityInput = parsePositiveFiniteNumber(payload.quantity);
      const priceInput = parsePositiveFiniteNumber(payload.price ?? toNum(instrument.lastPrice));
      const submissionReference = typeof payload.submissionReference === "string" ? payload.submissionReference.trim() : "";
      if (!side || quantityInput === null || priceInput === null || !submissionReference || submissionReference.length > 120) {
        return Response.json({ error: "A buy/sell side, positive quantity, positive price, and valid submission reference are required." }, { status: 400 });
      }
      const orderType = normalizeOrderType(payload.orderType, "market");
      const result = await createSubmittedOrder(
        { id: null, email: "investor-portal", role: "broker_admin", brokerId },
        {
          accountId: account.id,
          instrumentId: instrument.id,
          side,
          quantity: quantityInput,
          price: priceInput,
          orderType,
          validity: "day",
          source: "investor_portal",
          submissionReference,
        },
      );
      return Response.json({
        order: {
          id: result.order.id,
          status: result.order.status,
          gross: result.order.estimatedGross,
          fees: result.order.estimatedFees,
          net: result.order.estimatedNet,
        },
        checks: result.checks,
      }, { status: 201 });
    }

    return Response.json({ error: "Unsupported investor action." }, { status: 400 });
  } catch (error) { return routeError(error); }
}
