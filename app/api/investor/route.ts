import { prisma } from "../../../lib/prisma";
import { addisYear } from "../../../lib/addis-date";
import { composeFeeRules } from "../../../lib/fee-schedule-view";
import { toNum } from "../../../lib/money";
import { resolveInvestorContext } from "../../../lib/server-auth";
import { resolveTenantContext } from "../../../lib/tenant-capabilities";
import { apiError as routeError } from "../../../lib/api";
import { normalizeOrderType, parseOrderSide, parsePositiveFiniteNumber } from "../../../lib/order-input";
import { createSubmittedOrder } from "../../../lib/oms/order-service";
import { prepareCashMovementProof, serializeCashMovement, submitInvestorCashMovement } from "../../../lib/cash-service";
import { confirmOtpChallenge, createOtpChallenge, OTP_DELIVERY_CHANNELS, otpDestinationHint, orderPayloadHash, type OtpDeliveryChannel } from "../../../lib/verification-service";
import { sortInvestorActivity, type InvestorActivity } from "../../../lib/investor-activity";
import {
  createInvestorThread,
  markThreadReadByInvestor,
  openThreadForServiceRequest,
  postInvestorMessage,
} from "../../../lib/crm/thread-service";
import { categoryForServiceRequest } from "../../../lib/crm/categories";
import { clientIdentityReference } from "../../../lib/client-identity";
import { investorRelationshipOfficer } from "../../../lib/crm/assignment-service";
import { prepareAttachments } from "../../../lib/crm/attachments";
import { SERVICE, writeNotificationOnce } from "../../../lib/oms/notification-service";
import {
  parseLinkedBanks,
  prepareDocuments,
  saveOnboardingEvidence,
  serializeClientDocument,
  serializeLinkedBank,
} from "../../../lib/onboarding-evidence";
import { getFrankCoachHoldingValue } from "../../../lib/frank-coach";
import { taxIdentityReference } from "../../../lib/monitoring";
import { openComplaintCaseFromThread } from "../../../lib/crm/complaint-service";

export const runtime = "nodejs";

async function requireInvestorPortalAccess(brokerId: string) {
  const [context, settings] = await Promise.all([
    resolveTenantContext(brokerId),
    prisma.brokerSettings.findUnique({ where: { brokerId }, select: { features: true } }),
  ]);
  const features = (settings?.features ?? {}) as Record<string, unknown>;
  if (!context?.modules.investor_servicing || features.investorPortal !== true) {
    throw new Response("The investor portal is not enabled for this tenant's active registration, licence, and modules.", { status: 403 });
  }
}

export async function GET(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    const [broker, client, regulatoryFeeSchedule, tenantContext] = await Promise.all([
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
            where: { status: "published", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
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
          cashMovements: { include: { pooledBankAccount: true, proof: { select: { originalName: true, mimeType: true, sizeBytes: true, uploadedAt: true } } }, orderBy: { submittedAt: "desc" }, take: 25 },
          documents: { include: { content: { select: { documentId: true } } }, orderBy: { uploadedAt: "desc" } },
          linkedBankAccounts: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.platformFeeSchedule.findFirst({
        where: { status: "published", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
        include: { rules: true },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      resolveTenantContext(brokerId),
    ]);
    if (!broker) return Response.json({ error: "Tenant not found." }, { status: 404 });
    const tenantFeatures = (broker.settings?.features ?? {}) as Record<string, unknown>;
    if (!tenantContext?.modules.investor_servicing || tenantFeatures.investorPortal !== true) {
      return Response.json({ error: "The investor portal is not enabled for this tenant's active registration, licence, and modules." }, { status: 403 });
    }
    const account = client?.accounts[0];
    const legalDocument = broker.legalDocuments[0] ?? null;
    const feeSchedule = broker.feeSchedules[0] ?? null;
    const acceptedCurrentTerms = !legalDocument || Boolean(client?.consents.some((consent) =>
      consent.consentType === "brokerage_terms"
      && consent.legalDocumentId === legalDocument.id
      && consent.version === legalDocument.version
      && consent.accepted
      && !consent.withdrawnAt
    ));
    const kycReady = client?.kycStatus === "approved";
    const accountActive = client?.status === "active" && account?.status === "active";
    const explicitlyRestricted = client?.status === "restricted" || account?.status === "restricted" || Boolean(account?.restrictionReason);
    const canTrade = Boolean(client && account && kycReady && accountActive && !explicitlyRestricted && (!(broker.settings?.requireTermsAcceptance ?? true) || acceptedCurrentTerms));
    const canMoveCash = Boolean(client && account && kycReady && accountActive && !explicitlyRestricted);
    const accessReasons = [
      explicitlyRestricted ? {
        code: "broker_restriction",
        message: account?.restrictionReason ?? "Your broker has restricted this account.",
        action: null,
      } : null,
      !kycReady ? {
        code: "kyc",
        message: client?.kycStatus === "review_due" ? "Your KYC review is due." : "Your KYC review is not complete.",
        action: "update_kyc" as const,
      } : null,
      (broker.settings?.requireTermsAcceptance ?? true) && !acceptedCurrentTerms ? {
        code: "terms",
        message: `Accept ${legalDocument?.title ?? "the current brokerage agreement"} before trading.`,
        action: "accept_terms" as const,
      } : null,
      !accountActive && !explicitlyRestricted ? {
        code: "account_status",
        message: client?.status === "pending_approval" || account?.status === "pending_approval"
          ? "Your account is awaiting broker approval."
          : "Your account is not active.",
        action: null,
      } : null,
    ].filter((value): value is { code: string; message: string; action: "accept_terms" | "update_kyc" | null } => Boolean(value));
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
        feeSchedule: regulatoryFeeSchedule && broker.settings ? {
          id: feeSchedule?.id ?? `broker_settings_${broker.id}`,
          version: feeSchedule?.version ?? "broker-settings",
          regulatoryVersion: regulatoryFeeSchedule.version,
          effectiveFrom: (feeSchedule?.effectiveFrom ?? regulatoryFeeSchedule.effectiveFrom).toISOString().slice(0, 10),
          rules: composeFeeRules(feeSchedule?.rules ?? [], regulatoryFeeSchedule.rules, broker.settings),
        } : null,
      },
      profile: client ? {
        id: client.id, fullName: client.fullName, clientType: client.clientType, phone: client.phone, email: client.email, status: client.status,
        kycStatus: client.kycStatus, faydaMasked: client.faydaLast7 ? `••••• ${client.faydaLast7}` : null,
        taxIdMasked: client.taxIdLast4 ? `••••••${client.taxIdLast4}` : null,
        address: client.address,
        proofOfAddressStatus: client.proofOfAddressStatus,
        kycReviewDueAt: client.kycReviewDueAt?.toISOString() ?? null,
        termsAcceptedVersion: client.consents.find((consent) => consent.consentType === "brokerage_terms" && consent.accepted && !consent.withdrawnAt)?.version ?? null,
      } : null,
      account: account ? {
        id: account.id, accountNumber: account.accountNumber, totalCash: toNum(account.totalCash),
        availableCash: toNum(account.availableCash), blockedCash: toNum(account.blockedCash), status: account.status,
        restrictionReason: account.restrictionReason,
        restrictedAt: account.restrictedAt?.toISOString() ?? null,
        holdings: account.holdings.map((holding) => {
          const quantity = toNum(holding.totalQuantity);
          const marketPrice = toNum(holding.instrument.lastPrice);
          const faceValue = holding.instrument.faceValue ? toNum(holding.instrument.faceValue) : null;
          return {
            instrumentId: holding.instrumentId, ticker: holding.instrument.symbol, name: holding.instrument.name,
            assetClass: holding.instrument.assetClass, sector: holding.instrument.sector,
            quantity, availableQuantity: toNum(holding.availableQuantity),
            averageCost: toNum(holding.averageCost), price: marketPrice,
            marketValue: getFrankCoachHoldingValue({
              assetClass: holding.instrument.assetClass,
              quantity,
              marketPrice,
              faceValue,
            }),
            faceValue,
            maturityDate: holding.instrument.maturityDate?.toISOString().slice(0, 10) ?? null,
            couponRate: holding.instrument.couponRate ? toNum(holding.instrument.couponRate) : null,
            couponFrequency: holding.instrument.couponFrequency,
          };
        }),
        orders: account.orders.map((order) => ({
          id: order.id, ticker: order.instrument.symbol, side: order.side, quantity: toNum(order.quantity),
          price: toNum(order.price), triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
          status: order.status, createdAt: order.createdAt.toISOString(),
        })),
      } : null,
      access: {
        restricted: !canTrade || !canMoveCash,
        canTrade,
        canMoveCash,
        reasons: accessReasons,
      },
      // Customer-facing view of who looks after this account: name and role only.
      relationshipOfficer: await investorRelationshipOfficer({ brokerId, clientId }),
      serviceRequests: (client?.serviceRequests ?? []).map((item) => ({
        id: item.id,
        requestType: item.requestType,
        status: item.status,
        subject: item.subject,
        description: item.description,
        orderId: item.orderId,
        submittedAt: item.submittedAt.toISOString(),
        resolutionNotes: item.resolutionNotes,
        threadId: item.threadId,
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
      documents: (client?.documents ?? []).map(serializeClientDocument),
      linkedBanks: (client?.linkedBankAccounts ?? []).map(serializeLinkedBank),
      activity,
      instruments: broker.instrumentAccess.map(({ instrument }) => ({
        id: instrument.id, ticker: instrument.symbol, name: instrument.name, assetClass: instrument.assetClass,
        sector: instrument.sector,
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
    const { brokerId, clientId } = await resolveInvestorContext(request);
    await requireInvestorPortalAccess(brokerId);
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const payload = multipart
      ? JSON.parse(String(formData?.get("payload") ?? "{}")) as Record<string, unknown>
      : await request.json() as Record<string, unknown>;

    if (payload.action === "request_kyc_otp" || payload.action === "confirm_otp") {
      const client = await prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } });
      if (!client) return Response.json({ error: "Investor profile not found." }, { status: 404 });
      if (payload.action === "confirm_otp") {
        return Response.json(await confirmOtpChallenge({ id: String(payload.verificationId ?? ""), brokerId, clientId, code: String(payload.code ?? "") }));
      }
      const phone = String(payload.phone ?? "");
      if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s()-]/g, ""))) {
        return Response.json({ error: "Enter a valid mobile number before requesting verification." }, { status: 400 });
      }
      const challenge = await createOtpChallenge({ brokerId, clientId, accountId: client.accounts[0]?.id, purpose: "kyc_phone", source: "investor_portal", payloadHash: phone.replace(/\D/g, ""), destination: phone, destinationHint: `mobile ending ${phone.replace(/\D/g, "").slice(-4)}` });
      return Response.json(challenge, { status: 201 });
    }

    if (payload.action === "request_order_otp") {
      const [client, instrument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { accounts: true } }),
        prisma.instrument.findUnique({ where: { symbol: String(payload.symbol ?? "") } }),
      ]);
      const account = client?.accounts[0];
      if (!client || !account || !instrument) return Response.json({ error: "Investor account or instrument not found." }, { status: 404 });
      const deliveryChannel = String(payload.deliveryChannel ?? "sms") as OtpDeliveryChannel;
      if (!OTP_DELIVERY_CHANNELS.includes(deliveryChannel)) return Response.json({ error: "Choose SMS or email for the verification code." }, { status: 400 });
      const destination = deliveryChannel === "email" ? client.email : client.phone;
      if (!destination) return Response.json({ error: `No registered ${deliveryChannel === "email" ? "email address" : "mobile number"} is available for this account.` }, { status: 409 });
      const challenge = await createOtpChallenge({ brokerId, clientId, accountId: account.id, purpose: "order_instruction", source: "investor_portal", deliveryChannel, destination, destinationHint: otpDestinationHint(deliveryChannel, destination), payloadHash: orderPayloadHash({ accountId: account.id, instrumentId: instrument.id, side: String(payload.side ?? ""), quantity: String(payload.quantity ?? ""), price: String(payload.price ?? ""), triggerPrice: payload.triggerPrice === undefined ? null : String(payload.triggerPrice), orderType: String(payload.orderType ?? ""), source: "investor_portal", submissionReference: String(payload.submissionReference ?? "") }) });
      return Response.json(challenge, { status: 201 });
    }

    if (payload.action === "cash_movement") {
      const movementType = String(payload.movementType ?? "");
      if (!['deposit', 'withdrawal'].includes(movementType)) {
        return Response.json({ error: "Movement type must be deposit or withdrawal." }, { status: 400 });
      }
      const receipt = formData?.get("attachment0");
      const proof = receipt instanceof File && receipt.size > 0 ? await prepareCashMovementProof(receipt) : undefined;
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
        linkedBankAccountId: String(payload.linkedBankAccountId ?? "") || undefined,
        notes: String(payload.notes ?? ""),
        proof,
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

    if (payload.action === "accept_terms") {
      const [client, legalDocument] = await Promise.all([
        prisma.client.findFirst({ where: { id: clientId, brokerId } }),
        prisma.legalDocument.findFirst({
          where: { brokerId, documentType: "brokerage_terms", status: "published" },
          orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
        }),
      ]);
      if (!client) return Response.json({ error: "Investor profile not found." }, { status: 404 });
      if (!legalDocument) return Response.json({ error: "There is no published brokerage agreement to accept." }, { status: 409 });
      if (String(payload.termsVersion ?? "") !== legalDocument.version || payload.accepted !== true) {
        return Response.json({ error: "Review and accept the current brokerage agreement." }, { status: 400 });
      }
      const existing = await prisma.clientConsent.findFirst({
        where: { clientId, legalDocumentId: legalDocument.id, consentType: "brokerage_terms", accepted: true, withdrawnAt: null },
      });
      if (!existing) {
        await prisma.$transaction(async (tx) => {
          const consent = await tx.clientConsent.create({ data: {
            id: crypto.randomUUID(),
            clientId,
            legalDocumentId: legalDocument.id,
            consentType: "brokerage_terms",
            version: legalDocument.version,
            channel: "investor_portal",
            metadata: { source: "account_records" },
          } });
          await tx.auditLog.create({ data: {
            id: crypto.randomUUID(),
            brokerId,
            actorId: null,
            action: "BROKERAGE_TERMS_ACCEPTED",
            entityType: "client",
            entityId: clientId,
            summary: `${client.fullName} accepted brokerage agreement version ${legalDocument.version} in the investor portal`,
            newValue: JSON.stringify({ consentId: consent.id, version: legalDocument.version, channel: "investor_portal" }),
          } });
        });
      }
      return Response.json({ ok: true, version: legalDocument.version });
    }

    if (payload.action === "kyc_documents") {
      if (!formData) return Response.json({ error: "Attach at least one KYC document." }, { status: 400 });
      const client = await prisma.client.findFirst({ where: { id: clientId, brokerId } });
      if (!client) return Response.json({ error: "Investor profile not found." }, { status: 404 });
      const documents = await prepareDocuments(formData);
      if (!documents.length) return Response.json({ error: "Attach at least one PDF, PNG, or JPG document." }, { status: 400 });
      await prisma.$transaction(async (tx) => {
        await saveOnboardingEvidence(tx, {
          brokerId,
          clientId,
          source: "investor_portal",
          legalName: client.fullName,
          clientType: client.clientType,
          documents,
          banks: [],
        });
        if (documents.some((document) => document.documentType === "proof_of_address")) {
          await tx.client.update({ where: { id: clientId }, data: { proofOfAddressStatus: "received" } });
        }
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(),
          brokerId,
          actorId: null,
          action: "INVESTOR_KYC_DOCUMENTS_UPDATED",
          entityType: "client",
          entityId: clientId,
          summary: `${client.fullName} uploaded or updated KYC documents`,
          newValue: JSON.stringify({ documentTypes: documents.map((document) => document.documentType), source: "investor_portal" }),
        } });
      });
      return Response.json({ ok: true, uploaded: documents.map((document) => document.documentType) }, { status: 201 });
    }

    if (payload.action === "kyc") {
      const fullName = String(payload.fullName ?? "").trim();
      const email = String(payload.email ?? "").trim();
      const faydaId = String(payload.faydaId ?? "").replace(/\D/g, "");
      const tin = String(payload.tin ?? "").replace(/\D/g, "");
      const pepStatus = String(payload.pepStatus ?? "not_declared");
      const emailValid = email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!fullName || fullName.length > 160 || !emailValid || faydaId.length !== 16 || tin.length < 4 || tin.length > 32) {
        return Response.json({ error: "Name, email, a 16-digit Fayda FAN, and TIN are required." }, { status: 400 });
      }
      if (!["not_pep", "pep", "related_to_pep"].includes(pepStatus)) {
        return Response.json({ error: "Complete the politically exposed person declaration before submitting KYC." }, { status: 400 });
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

      // A stable hash of the legal identity so the same person cannot open a
      // second account with this broker (the raw Fayda is still never stored).
      const identityRef = clientIdentityReference({
        clientType: payload.accountType === "institution" ? "institution" : "individual",
        faydaId,
        businessRegistrationNumber: String(payload.registrationNumber ?? ""),
      });
      const newApplication = payload.newApplication === true;
      const applicationSuffix = crypto.randomUUID().slice(0, 6).toUpperCase();
      const applicationClientId = `cli_${crypto.randomUUID().slice(0, 12)}`;
      const applicationClientCode = `CL-${addisYear()}-${applicationSuffix}`;
      const applicationClientType = payload.accountType === "institution" ? "institution" : "individual";
      const clientData = {
        fullName,
        clientType: applicationClientType,
        phone: String(payload.phone ?? "") || null,
        email,
        identityReference: identityRef,
        faydaLast7: faydaId.slice(-7),
        taxIdLast4: tin.slice(-4),
        taxIdentityReference: taxIdentityReference(tin),
        taxId: null,
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
        kycStatus: "pending_review",
        riskRating: pepStatus === "not_pep" ? "standard" : "enhanced",
        status: "pending_approval",
        kycConsentAt: new Date(),
        submittedAt: new Date(),
        onboardingChannel: "investor_portal",
        phoneVerifiedAt: new Date(),
        sourceOfFunds: String(payload.sourceOfFunds ?? "").trim() || null,
        investmentObjective: String(payload.investmentObjective ?? "").trim() || null,
        taxResidency: String(payload.taxResidency ?? "Ethiopia").trim(),
        pepStatus,
        nationality: String(payload.nationality ?? "Ethiopian").trim(),
        countryOfResidence: String(payload.countryOfResidence ?? "Ethiopia").trim(),
        occupation: String(payload.occupation ?? "").trim() || null,
        electronicDeliveryConsentAt: payload.electronicDeliveryConsent === true ? new Date() : null,
      };

      // The raw identifiers are deliberately never stored. Production should send
      // them directly to an Ethiopia-resident identity provider and retain only its reference.
      const updated = await prisma.$transaction(async (tx) => {
        const clash = await tx.client.findFirst({
          where: {
            brokerId,
            identityReference: identityRef,
            ...(newApplication ? {} : { id: { not: client.id } }),
          },
        });
        const resumableApplication = newApplication
          && clash?.status === "pending_approval"
          && clash.kycStatus === "pending_review"
          && clash.email?.trim().toLocaleLowerCase() === email.toLocaleLowerCase()
          && clash.phone?.replace(/\D/g, "") === String(payload.phone ?? "").replace(/\D/g, "");
        if (clash && !resumableApplication) throw new Response("These identity details are already registered with this broker.", { status: 409 });
        await tx.verificationChallenge.update({ where: { id: phoneVerification.id }, data: { status: "consumed", consumedAt: new Date() } });
        const next = resumableApplication
          ? await tx.client.update({ where: { id: clash!.id }, data: clientData })
          : newApplication
          ? await tx.client.create({
            data: {
              id: applicationClientId,
              brokerId,
              clientCode: applicationClientCode,
              ...clientData,
            },
          })
          : await tx.client.update({ where: { id: client.id }, data: clientData });
        const targetClientId = next.id;
        await tx.beneficialOwner.deleteMany({ where: { clientId: targetClientId } });
        if (applicationClientType === "institution" && String(payload.beneficialOwnerName ?? "").trim()) {
          await tx.beneficialOwner.create({ data: {
            id: crypto.randomUUID(), brokerId, clientId: targetClientId,
            displayName: String(payload.beneficialOwnerName).trim(),
          } });
        }
        const documents = formData ? await prepareDocuments(formData) : [];
        const linkedBanks = parseLinkedBanks(payload.linkedBanks);
        await saveOnboardingEvidence(tx, {
          brokerId,
          clientId: targetClientId,
          source: "investor_portal",
          legalName: fullName,
          clientType: applicationClientType,
          documents,
          banks: linkedBanks,
          replaceBanks: true,
        });
        if (!newApplication) {
          await tx.account.updateMany({
            where: { clientId: targetClientId },
            data: { status: "pending_approval", restrictionReason: "Awaiting client onboarding approval" },
          });
        }
        if (legalDocument && payload.termsAccepted === true) {
          await tx.clientConsent.create({ data: {
            id: crypto.randomUUID(),
            clientId: targetClientId,
            legalDocumentId: legalDocument.id,
            consentType: "brokerage_terms",
            version: legalDocument.version,
            channel: "investor_portal",
            metadata: { electronicDeliveryConsent: payload.electronicDeliveryConsent === true },
          } });
        }
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "INVESTOR_KYC_SUBMITTED",
          entityType: "client", entityId: targetClientId, summary: `Digital KYC submitted for broker review for ${fullName}; only masked identifiers retained`,
          newValue: JSON.stringify({ clientType: applicationClientType, pepStatus, riskRating: clientData.riskRating, source: "investor_portal" }),
        } });
        await writeNotificationOnce(tx, {
          dedupeKey: `investor-onboarding:${targetClientId}`,
          scope: "broker",
          brokerId,
          roles: SERVICE,
          category: "kyc",
          severity: "warning",
          title: "New account application",
          body: `${fullName} (${next.clientCode}) is waiting for onboarding review.`,
          entityType: "client",
          entityId: targetClientId,
          link: "/?view=clients",
        });
        return next;
      });
      const account = await prisma.account.findFirst({ where: { clientId: updated.id } });
      return Response.json({ profile: { id: updated.id, clientCode: updated.clientCode, accountNumber: account?.accountNumber, fullName: updated.fullName, kycStatus: updated.kycStatus } });
    }

    if (payload.action === "service_request") {
      const requestType = String(payload.requestType ?? "");
      if (!["trade_discrepancy", "account_closure", "profile_correction", "tax_document", "security_concern"].includes(requestType)) {
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
      const attachments = formData ? await prepareAttachments(formData) : [];
      const formalComplaint = requestType === "trade_discrepancy" && payload.formalComplaint === true;
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
          subject: requestType === "trade_discrepancy" ? `Order discrepancy${orderId ? ` · ${orderId}` : ""}` : requestType === "account_closure" ? "Account closure request" : requestType === "profile_correction" ? "Profile correction request" : requestType === "tax_document" ? "Tax document request" : "Security concern",
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
        // Open a linked conversation so the structured request and the discussion
        // about it live together. Same transaction, so they commit as one.
        const thread = await openThreadForServiceRequest(tx, {
          brokerId,
          clientId,
          accountId: account.id,
          requestId: next.id,
          subject: next.subject,
          body: description,
          category: formalComplaint ? "complaint" : categoryForServiceRequest(requestType),
          clientName: client.fullName,
          attachments,
        });
        await tx.clientServiceRequest.update({ where: { id: next.id }, data: { threadId: thread.id } });
        const complaint = formalComplaint ? await openComplaintCaseFromThread(tx, {
          brokerId, clientId, clientName: client.fullName, threadId: thread.id,
          subject: next.subject, assignedToUserId: thread.assignedToUserId,
        }) : null;
        return { ...next, threadId: thread.id, caseId: complaint?.id ?? null };
      });
      return Response.json({ request: { id: created.id, status: created.status, threadId: created.threadId, caseId: created.caseId } }, { status: 201 });
    }

    if (payload.action === "support_thread_create") {
      const attachments = formData ? await prepareAttachments(formData) : [];
      const thread = await createInvestorThread({ brokerId, clientId }, {
        subject: payload.subject,
        body: payload.body,
        category: payload.category,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId,
        attachments,
      });
      return Response.json({ thread }, { status: 201 });
    }

    if (payload.action === "support_thread_reply") {
      const attachments = formData ? await prepareAttachments(formData) : [];
      const result = await postInvestorMessage({ brokerId, clientId }, String(payload.threadId ?? ""), payload.body, attachments);
      return Response.json({ ok: true, ...result }, { status: 201 });
    }

    if (payload.action === "support_thread_read") {
      return Response.json(await markThreadReadByInvestor({ brokerId, clientId }, String(payload.threadId ?? "")));
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
