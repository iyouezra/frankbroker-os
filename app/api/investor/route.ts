import { prisma } from "../../../lib/prisma";
import { toNum } from "../../../lib/money";
import { resolveInvestorContext } from "../../../lib/server-auth";
import { apiError as routeError } from "../../../lib/api";
import { normalizeOrderType, parseOrderSide, parsePositiveFiniteNumber } from "../../../lib/order-input";
import { createSubmittedOrder } from "../../../lib/oms/order-service";
import { serializeCashMovement, submitInvestorCashMovement } from "../../../lib/cash-service";
import { confirmOtpChallenge, createOtpChallenge, orderPayloadHash } from "../../../lib/verification-service";
import { sortInvestorActivity, type InvestorActivity } from "../../../lib/investor-activity";

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
          pooledBankAccounts: { where: { status: "active" }, orderBy: { purpose: "asc" } },
        },
      }),
      prisma.client.findFirst({
        where: { id: clientId, brokerId },
        include: {
          accounts: {
            include: {
              holdings: { include: { instrument: true } },
              orders: {
                include: { instrument: true, trades: { include: { settlement: true }, orderBy: { capturedAt: "desc" } } },
                orderBy: { createdAt: "desc" },
                take: 25,
              },
              clientMoneyPositions: { include: { pooledBankAccount: true } },
            },
          },
          consents: { orderBy: { acceptedAt: "desc" } },
          serviceRequests: { orderBy: { submittedAt: "desc" }, take: 20 },
          cashMovements: { include: { pooledBankAccount: true }, orderBy: { submittedAt: "desc" }, take: 25 },
        },
      }),
    ]);
    if (!broker) return Response.json({ error: "Tenant not found." }, { status: 404 });
    const account = client?.accounts[0];
    const legalDocument = broker.legalDocuments[0] ?? null;
    const feeSchedule = broker.feeSchedules[0] ?? null;
    const activity = sortInvestorActivity([
      ...(account?.orders.flatMap((order): InvestorActivity[] => [
        {
          kind: "order",
          id: order.id,
          occurredAt: (order.submittedAt ?? order.createdAt).toISOString(),
          status: order.status,
          ticker: order.instrument.symbol,
          instrumentName: order.instrument.name,
          side: order.side === "sell" ? "sell" : "buy",
          quantity: toNum(order.quantity),
          price: toNum(order.price),
          triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
          orderType: order.orderType,
          filledQuantity: toNum(order.filledQuantity),
          estimatedFees: toNum(order.estimatedFees),
          estimatedNet: toNum(order.estimatedNet),
          reference: order.submissionReference ?? order.id,
          submittedAt: (order.submittedAt ?? order.createdAt).toISOString(),
          rejectionReason: order.rejectionReason,
        },
        ...order.trades.map((trade) => ({
          kind: "trade" as const,
          id: trade.id,
          occurredAt: trade.capturedAt.toISOString(),
          status: trade.settlement?.status === "settled" ? "settled" : "settlement_pending",
          ticker: order.instrument.symbol,
          instrumentName: order.instrument.name,
          side: order.side === "sell" ? "sell" as const : "buy" as const,
          quantity: toNum(trade.quantityFilled),
          executionPrice: toNum(trade.executionPrice),
          grossAmount: toNum(trade.grossAmount),
          fees: toNum(trade.fees),
          netAmount: toNum(trade.netAmount),
          tradeDate: trade.tradeDate.toISOString().slice(0, 10),
          settlementDate: trade.settlementDate.toISOString().slice(0, 10),
          settlementStatus: trade.settlement?.status ?? "pending",
          reference: trade.id,
        })),
      ]) ?? []),
      ...(client?.cashMovements.map((movement): InvestorActivity => ({
        kind: "money",
        id: movement.id,
        occurredAt: movement.submittedAt.toISOString(),
        status: movement.status,
        movementType: movement.movementType === "withdrawal" ? "withdrawal" : "deposit",
        amount: toNum(movement.amount),
        currency: movement.currency,
        bankReference: movement.bankReference,
        bankName: movement.movementType === "withdrawal" ? movement.destinationBankName : movement.pooledBankAccount.bankName,
        accountName: movement.movementType === "withdrawal" ? movement.destinationAccountName : movement.pooledBankAccount.accountName,
        accountMasked: movement.movementType === "withdrawal" ? movement.destinationAccountMasked : movement.pooledBankAccount.accountNumberMasked,
        submittedAt: movement.submittedAt.toISOString(),
        reviewedAt: movement.reviewedAt?.toISOString() ?? null,
        completedAt: movement.completedAt?.toISOString() ?? null,
        rejectionReason: movement.rejectionReason,
        failureReason: movement.failureReason,
        reference: movement.submissionReference,
      })) ?? []),
    ]).slice(0, 25);
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
          price: toNum(order.price), triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
          status: order.status, createdAt: order.createdAt.toISOString(),
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
      cashPools: broker.pooledBankAccounts.map((pool) => ({
        id: pool.id,
        bankName: pool.bankName,
        accountName: pool.accountName,
        accountNumberMasked: pool.accountNumberMasked,
        currency: pool.currency,
        purpose: pool.purpose,
        beneficialBalance: toNum(account?.clientMoneyPositions.find((position) => position.pooledBankAccountId === pool.id)?.balance),
      })),
      cashMovements: (client?.cashMovements ?? []).map(serializeCashMovement),
      activity,
      instruments: broker.instrumentAccess.map(({ instrument }) => ({
        id: instrument.id, ticker: instrument.symbol, name: instrument.name, assetClass: instrument.assetClass,
        issuer: instrument.issuer,
        price: toNum(instrument.lastPrice),
        status: instrument.tradingStatus,
        lotSize: instrument.lotSize,
        tickSize: toNum(instrument.tickSize),
        settlementCycle: instrument.settlementCycle,
        faceValue: instrument.faceValue ? toNum(instrument.faceValue) : null,
        maturityDate: instrument.maturityDate?.toISOString().slice(0, 10) ?? null,
        couponRate: instrument.couponRate ? toNum(instrument.couponRate) : null,
        couponFrequency: instrument.couponFrequency,
      })),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const { brokerId, clientId } = resolveInvestorContext(request);
    const payload = await request.json() as Record<string, unknown>;

    if (payload.action === "request_kyc_otp" || payload.action === "confirm_otp") {
      const client = await prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } });
      if (!client) return Response.json({ error: "Investor profile not found." }, { status: 404 });
      if (payload.action === "confirm_otp") {
        return Response.json(await confirmOtpChallenge({ id: String(payload.verificationId ?? ""), brokerId, clientId, code: String(payload.code ?? "") }));
      }
      const challenge = await createOtpChallenge({ brokerId, clientId, accountId: client.accounts[0]?.id, purpose: "kyc_phone", source: "investor_portal", payloadHash: String(payload.phone ?? "").replace(/\D/g, ""), destinationHint: `mobile ending ${String(payload.phone ?? "").replace(/\D/g, "").slice(-4)}` });
      return Response.json(challenge, { status: 201 });
    }

    if (payload.action === "request_order_otp") {
      const [client, instrument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } }),
        prisma.instrument.findUnique({ where: { symbol: String(payload.symbol ?? "") } }),
      ]);
      const account = client?.accounts[0];
      if (!client || !account || !instrument) return Response.json({ error: "Investor account or instrument not found." }, { status: 404 });
      const challenge = await createOtpChallenge({ brokerId, clientId, accountId: account.id, purpose: "order_instruction", source: "investor_portal", destinationHint: `mobile ending ${client.phone?.replace(/\D/g, "").slice(-4) ?? "unknown"}`, payloadHash: orderPayloadHash({ accountId: account.id, instrumentId: instrument.id, side: String(payload.side ?? ""), quantity: String(payload.quantity ?? ""), price: String(payload.price ?? ""), triggerPrice: payload.triggerPrice === undefined ? null : String(payload.triggerPrice), orderType: String(payload.orderType ?? ""), source: "investor_portal", submissionReference: String(payload.submissionReference ?? "") }) });
      return Response.json(challenge, { status: 201 });
    }

    if (payload.action === "cash_movement") {
      const movementType = String(payload.movementType ?? "");
      if (!['deposit', 'withdrawal'].includes(movementType)) {
        return Response.json({ error: "Movement type must be deposit or withdrawal." }, { status: 400 });
      }
      const movement = await submitInvestorCashMovement(brokerId, clientId, {
        pooledBankAccountId: String(payload.pooledBankAccountId ?? ""),
        movementType: movementType as "deposit" | "withdrawal",
        amount: String(payload.amount ?? ""),
        submissionReference: String(payload.submissionReference ?? ""),
        bankReference: String(payload.bankReference ?? ""),
        proofReference: String(payload.proofReference ?? ""),
        destinationBankName: String(payload.destinationBankName ?? ""),
        destinationAccountName: String(payload.destinationAccountName ?? ""),
        destinationAccountMasked: String(payload.destinationAccountMasked ?? ""),
        notes: String(payload.notes ?? ""),
      });
      const account = await prisma.account.findUnique({ where: { id: movement.accountId } });
      return Response.json({
        cashMovement: serializeCashMovement(movement),
        account: account ? {
          id: account.id,
          totalCash: toNum(account.totalCash),
          availableCash: toNum(account.availableCash),
          blockedCash: toNum(account.blockedCash),
        } : null,
      }, { status: 201 });
    }

    if (payload.action === "kyc") {
      const fullName = String(payload.fullName ?? "").trim();
      const email = String(payload.email ?? "").trim();
      const faydaId = String(payload.faydaId ?? "").replace(/\D/g, "");
      const tin = String(payload.tin ?? "").replace(/\D/g, "");
      const emailValid = email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!fullName || fullName.length > 160 || !emailValid || faydaId.length < 4 || faydaId.length > 32 || tin.length < 4 || tin.length > 32) {
        return Response.json({ error: "Name, email, Fayda ID, and TIN are required." }, { status: 400 });
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
      const phoneVerification = await prisma.verificationChallenge.findFirst({ where: {
        id: String(payload.verificationId ?? ""), brokerId, clientId, purpose: "kyc_phone", status: "verified",
        consumedAt: null, expiresAt: { gt: new Date() }, payloadHash: String(payload.phone ?? "").replace(/\D/g, ""),
      } });
      if (!phoneVerification) return Response.json({ error: "Verify the mobile number before submitting KYC." }, { status: 409 });

      // The raw identifiers are deliberately never stored. Production should send
      // them directly to an Ethiopia-resident identity provider and retain only its reference.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.verificationChallenge.update({ where: { id: phoneVerification.id }, data: { status: "consumed", consumedAt: new Date() } });
        const next = await tx.client.update({ where: { id: client.id }, data: {
          fullName,
          clientType: payload.accountType === "institution" ? "institution" : "individual",
          phone: String(payload.phone ?? "") || null,
          email,
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
          kycStatus: "pending_review", riskRating: "standard", status: "pending_approval", kycConsentAt: new Date(),
          onboardingChannel: "investor_portal", phoneVerifiedAt: new Date(),
          sourceOfFunds: String(payload.sourceOfFunds ?? "").trim() || null,
          investmentObjective: String(payload.investmentObjective ?? "").trim() || null,
          taxResidency: String(payload.taxResidency ?? "Ethiopia").trim(),
          pepStatus: String(payload.pepStatus ?? "not_pep"),
          nationality: String(payload.nationality ?? "Ethiopian").trim(),
          countryOfResidence: String(payload.countryOfResidence ?? "Ethiopia").trim(),
          occupation: String(payload.occupation ?? "").trim() || null,
          electronicDeliveryConsentAt: payload.electronicDeliveryConsent === true ? new Date() : null,
        } });
        await tx.account.updateMany({ where: { clientId: client.id }, data: { status: "pending_approval" } });
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
          id: crypto.randomUUID(), brokerId, actorId: null, action: "INVESTOR_KYC_SUBMITTED",
          entityType: "client", entityId: client.id, summary: `Digital KYC submitted for broker review for ${fullName}; only masked identifiers retained`,
        } });
        return next;
      });
      const account = await prisma.account.findFirst({ where: { clientId: updated.id } });
      return Response.json({ profile: { id: updated.id, clientCode: updated.clientCode, accountNumber: account?.accountNumber, fullName: updated.fullName, kycStatus: updated.kycStatus } });
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
      const orderType = normalizeOrderType(payload.orderType, "market");
      const triggerPriceInput = payload.triggerPrice === undefined || payload.triggerPrice === null || payload.triggerPrice === ""
        ? null
        : parsePositiveFiniteNumber(payload.triggerPrice);
      const submissionReference = typeof payload.submissionReference === "string" ? payload.submissionReference.trim() : "";
      if (!side || quantityInput === null || priceInput === null || !submissionReference || submissionReference.length > 120) {
        return Response.json({ error: "A buy/sell side, positive quantity, positive price, and valid submission reference are required." }, { status: 400 });
      }
      if (orderType === "stop_loss" && (side !== "sell" || triggerPriceInput === null || triggerPriceInput >= priceInput)) {
        return Response.json({ error: "A Stop-Loss sell needs a positive trigger price below the current price." }, { status: 400 });
      }
      const result = await createSubmittedOrder(
        { id: null, email: "investor-portal", role: "broker_admin", brokerId },
        {
          accountId: account.id,
          instrumentId: instrument.id,
          side,
          quantity: quantityInput,
          price: priceInput,
          triggerPrice: orderType === "stop_loss" ? triggerPriceInput : null,
          orderType,
          validity: "day",
          source: "investor_portal",
          submissionReference,
          termsVersion: legalDocument?.version,
          disclosureVersion: "order-v1",
          disclosureAcceptedAt: new Date(),
          verificationId: String(payload.verificationId ?? ""),
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
