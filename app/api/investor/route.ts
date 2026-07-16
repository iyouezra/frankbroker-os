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
          legalDocuments: {
            where: { documentType: "brokerage_terms", status: "published" },
            orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
            take: 1,
          },
          feeSchedules: {
            where: { status: "published" },
            include: { rules: true },
            orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
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
          consents: { orderBy: { acceptedAt: "desc" } },
          serviceRequests: { orderBy: { submittedAt: "desc" }, take: 20 },
        },
      }),
    ]);
    if (!broker) return Response.json({ error: "Tenant not found." }, { status: 404 });
    const account = client?.accounts[0];
    const legalDocument = broker.legalDocuments[0] ?? null;
    const feeSchedule = broker.feeSchedules[0] ?? null;
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
        requireTermsAcceptance: broker.settings?.requireTermsAcceptance ?? true,
        discrepancyWindowDays: broker.settings?.discrepancyWindowDays ?? 10,
        legalDocument: legalDocument ? {
          id: legalDocument.id,
          title: legalDocument.title,
          version: legalDocument.version,
          summary: legalDocument.summary,
          content: legalDocument.content,
          effectiveAt: legalDocument.effectiveAt.toISOString().slice(0, 10),
        } : null,
        feeSchedule: feeSchedule ? {
          id: feeSchedule.id,
          version: feeSchedule.version,
          effectiveFrom: feeSchedule.effectiveFrom.toISOString().slice(0, 10),
          rules: feeSchedule.rules.map((rule) => ({
            assetClass: rule.assetClass,
            marketSegment: rule.marketSegment,
            brokeragePct: toNum(rule.brokeragePct),
            regulatorPct: toNum(rule.regulatorPct),
            exchangePct: toNum(rule.exchangePct),
            csdPct: toNum(rule.csdPct),
            minimumFee: toNum(rule.minimumFee),
            maximumFee: rule.maximumFee ? toNum(rule.maximumFee) : null,
          })),
        } : null,
      },
      profile: client ? {
        id: client.id, fullName: client.fullName, clientType: client.clientType, phone: client.phone,
        kycStatus: client.kycStatus, faydaMasked: client.faydaLast4 ? `•••• •••• ${client.faydaLast4}` : null,
        taxIdMasked: client.taxIdLast4 ? `••••••${client.taxIdLast4}` : null,
        address: client.address,
        proofOfAddressStatus: client.proofOfAddressStatus,
        kycReviewDueAt: client.kycReviewDueAt?.toISOString() ?? null,
        termsAcceptedVersion: client.consents.find((consent) => consent.consentType === "brokerage_terms" && consent.accepted && !consent.withdrawnAt)?.version ?? null,
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
      serviceRequests: (client?.serviceRequests ?? []).map((item) => ({
        id: item.id,
        requestType: item.requestType,
        status: item.status,
        subject: item.subject,
        description: item.description,
        orderId: item.orderId,
        submittedAt: item.submittedAt.toISOString(),
        resolutionNotes: item.resolutionNotes,
      })),
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
      const [client, settings, legalDocument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId } }),
        prisma.brokerSettings.findUnique({ where: { brokerId } }),
        prisma.legalDocument.findFirst({
          where: { brokerId, documentType: "brokerage_terms", status: "published" },
          orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
        }),
      ]);
      if (!client) return Response.json({ error: "Demo investor profile is not seeded." }, { status: 404 });
      if ((settings?.requireTermsAcceptance ?? true) && legalDocument && payload.termsAccepted !== true) {
        return Response.json({ error: "You must accept the current brokerage terms before opening the account." }, { status: 400 });
      }
      if (legalDocument && String(payload.termsVersion ?? "") !== legalDocument.version) {
        return Response.json({ error: "The brokerage terms changed. Review the current version and try again." }, { status: 409 });
      }

      // The raw identifiers are deliberately never stored. Production should send
      // them directly to an Ethiopia-resident identity provider and retain only its reference.
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.client.update({ where: { id: client.id }, data: {
          fullName,
          clientType: payload.accountType === "institution" ? "institution" : "individual",
          phone: String(payload.phone ?? "") || null,
          identityReference: `demo_fayda_${crypto.randomUUID()}`,
          faydaLast4: faydaId.slice(-4), taxIdLast4: tin.slice(-4), taxId: null,
          address: String(payload.address ?? "").trim() || null,
          proofOfAddressType: String(payload.proofOfAddressType ?? "").trim() || null,
          proofOfAddressReference: String(payload.proofOfAddressReference ?? "").trim() || null,
          proofOfAddressStatus: payload.proofOfAddressReference ? "received" : "pending",
          businessRegistrationNumber: String(payload.registrationNumber ?? "").trim() || null,
          authorizedRepresentativeName: String(payload.representativeName ?? "").trim() || null,
          signatoryAuthorityConfirmed: payload.accountType !== "institution" || payload.signatoryAuthorityConfirmed === true,
          beneficialOwners: payload.accountType === "institution" && String(payload.beneficialOwnerName ?? "").trim()
            ? [{ name: String(payload.beneficialOwnerName).trim(), status: "declared" }]
            : undefined,
          kycStatus: "approved", riskRating: "standard", status: "active", kycConsentAt: new Date(),
          kycReviewDueAt: new Date(Date.now() + (settings?.kycReviewMonths ?? 12) * 30 * 24 * 60 * 60 * 1000),
          electronicDeliveryConsentAt: payload.electronicDeliveryConsent === true ? new Date() : null,
        } });
        await tx.account.updateMany({ where: { clientId: client.id }, data: { status: "active" } });
        if (legalDocument && payload.termsAccepted === true) {
          await tx.clientConsent.create({ data: {
            id: crypto.randomUUID(),
            clientId: client.id,
            legalDocumentId: legalDocument.id,
            consentType: "brokerage_terms",
            version: legalDocument.version,
            channel: "investor_portal",
            metadata: { electronicDeliveryConsent: payload.electronicDeliveryConsent === true },
          } });
        }
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "INVESTOR_KYC_DEMO_COMPLETED",
          entityType: "client", entityId: client.id, summary: `Demo KYC completed for ${fullName}; only masked identifiers retained`,
        } });
        return next;
      });
      return Response.json({ profile: { id: updated.id, fullName: updated.fullName, kycStatus: updated.kycStatus } });
    }

    if (payload.action === "service_request") {
      const requestType = String(payload.requestType ?? "");
      if (!["trade_discrepancy", "account_closure", "profile_correction"].includes(requestType)) {
        return Response.json({ error: "Unsupported service request type." }, { status: 400 });
      }
      const client = await prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } });
      const account = client?.accounts[0];
      if (!client || !account) return Response.json({ error: "Investor account not found." }, { status: 404 });
      const description = String(payload.description ?? "").trim();
      if (description.length < 8 || description.length > 2_000) {
        return Response.json({ error: "Please provide a short description of at least 8 characters." }, { status: 400 });
      }
      const orderId = String(payload.orderId ?? "").trim() || null;
      if (requestType === "trade_discrepancy") {
        const settings = await prisma.brokerSettings.findUnique({ where: { brokerId } });
        const earliest = new Date(Date.now() - (settings?.discrepancyWindowDays ?? 10) * 24 * 60 * 60 * 1000);
        const order = orderId ? await prisma.order.findFirst({ where: { id: orderId, accountId: account.id, createdAt: { gte: earliest } } }) : null;
        if (!order) return Response.json({ error: "Select a recent order within the discrepancy reporting window." }, { status: 400 });
      }
      const duplicate = await prisma.clientServiceRequest.findFirst({
        where: { clientId, requestType, status: { in: ["open", "under_review"] }, ...(orderId ? { orderId } : {}) },
      });
      if (duplicate) return Response.json({ error: "A matching request is already being reviewed." }, { status: 409 });
      const created = await prisma.$transaction(async (tx) => {
        const next = await tx.clientServiceRequest.create({ data: {
          id: `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          brokerId,
          clientId,
          accountId: account.id,
          orderId,
          requestType,
          subject: requestType === "trade_discrepancy" ? `Order discrepancy${orderId ? ` · ${orderId}` : ""}` : requestType === "account_closure" ? "Account closure request" : "Profile correction request",
          description,
          submittedBy: "investor_portal",
        } });
        if (requestType === "account_closure") {
          await tx.account.update({ where: { id: account.id }, data: { closureRequestedAt: new Date() } });
        }
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "CLIENT_SERVICE_REQUEST_CREATED",
          entityType: "client_service_request", entityId: next.id, summary: `${next.subject} submitted by ${client.fullName}`,
          newValue: JSON.stringify({ requestType, status: next.status, orderId }),
        } });
        return next;
      });
      return Response.json({ request: { id: created.id, status: created.status } }, { status: 201 });
    }

    if (payload.action === "order") {
      const [client, instrument, settings, legalDocument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true, consents: { orderBy: { acceptedAt: "desc" } } } }),
        prisma.instrument.findUnique({ where: { symbol: String(payload.symbol ?? "") } }),
        prisma.brokerSettings.findUnique({ where: { brokerId } }),
        prisma.legalDocument.findFirst({
          where: { brokerId, documentType: "brokerage_terms", status: "published" },
          orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
        }),
      ]);
      const account = client?.accounts[0];
      if (!client || !account) return Response.json({ error: "Investor account not found." }, { status: 404 });
      if (!instrument) return Response.json({ error: "Instrument not found." }, { status: 404 });
      const acceptedTerms = legalDocument
        ? client.consents.some((consent) => consent.consentType === "brokerage_terms" && consent.version === legalDocument.version && consent.accepted && !consent.withdrawnAt)
        : true;
      if ((settings?.requireTermsAcceptance ?? true) && !acceptedTerms) {
        return Response.json({ error: "Accept the current brokerage terms before placing an order." }, { status: 409 });
      }
      if (payload.disclosureAccepted !== true || String(payload.disclosureVersion ?? "") !== "order-v1") {
        return Response.json({ error: "Review and accept the order disclosure before submitting." }, { status: 400 });
      }

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
          termsVersion: legalDocument?.version,
          disclosureVersion: "order-v1",
          disclosureAcceptedAt: new Date(),
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
