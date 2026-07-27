import { apiError } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { ZERO } from "../../../../../lib/money";
import { requirePermission } from "../../../../../lib/server-auth";
import { approveClient, rejectClient } from "../../../../../lib/client-service";
import { expectedDocumentTypes } from "../../../../../lib/onboarding-evidence";

export const runtime = "nodejs";

type ClientAction = "approve_client" | "reject_client" | "restrict" | "restore" | "record_terms_acceptance" | "complete_kyc_review" | "resolve_request" | "approve_closure" | "reject_request" | "add_note";
const restrictionCategories = new Set(["compliance_review", "kyc_overdue", "missing_documents", "suspicious_activity", "legal_regulatory", "client_request", "other"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as {
      action?: ClientAction;
      requestId?: string;
      reason?: string;
      resolutionNotes?: string;
      noteText?: string;
      category?: string;
      restrictionCategory?: string;
      restrictionNote?: string;
    };
    if (!payload.action) return Response.json({ error: "A client action is required." }, { status: 400 });
    const permission = payload.action === "approve_client" ? "approve" : payload.action === "reject_client" ? "reject" : "adjust";
    const actor = requirePermission(request, permission);
    const reason = String(payload.reason ?? payload.resolutionNotes ?? "").trim();
    if (reason.length > 1_000) return Response.json({ error: "The reason is too long." }, { status: 400 });

    if (payload.action === "approve_client") {
      return Response.json({ ok: true, ...(await approveClient(actor, id)) });
    }
    if (payload.action === "reject_client") {
      return Response.json({ ok: true, ...(await rejectClient(actor, id, reason || "Client onboarding rejected after review")) });
    }

    if (payload.action === "add_note") {
      const client = await prisma.client.findFirst({ where: { id, brokerId: actor.brokerId } });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      const noteText = String(payload.noteText ?? "").trim();
      const category = String(payload.category ?? "general").trim().toLowerCase();
      if (noteText.length < 3 || noteText.length > 2_000) {
        return Response.json({ error: "Internal notes must contain between 3 and 2,000 characters." }, { status: 400 });
      }
      if (!["general", "compliance", "support", "trading", "settlement"].includes(category)) {
        return Response.json({ error: "Unsupported note category." }, { status: 400 });
      }
      const note = await prisma.$transaction(async (tx) => {
        const next = await tx.clientNote.create({ data: {
          id: `NOTE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          clientId: id,
          noteText,
          category,
          visibility: "internal",
          createdBy: actor.id,
        } });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "CLIENT_INTERNAL_NOTE_ADDED",
          entityType: "client_note",
          entityId: next.id,
          summary: `${category} note added to ${client.fullName}`,
          newValue: JSON.stringify({ clientId: id, category, visibility: "internal" }),
        } });
        return next;
      });
      return Response.json({ ok: true, note: { id: note.id, category: note.category, createdAt: note.createdAt.toISOString() } }, { status: 201 });
    }

    if (payload.action === "record_terms_acceptance") {
      const [client, legalDocument] = await Promise.all([
        prisma.client.findFirst({ where: { id, brokerId: actor.brokerId } }),
        prisma.legalDocument.findFirst({
          where: { brokerId: actor.brokerId, documentType: "brokerage_terms", status: "published" },
          orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
        }),
      ]);
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      if (!legalDocument) return Response.json({ error: "There is no published brokerage agreement." }, { status: 409 });
      if (reason.length < 5) return Response.json({ error: "Record how the client's acceptance was evidenced." }, { status: 400 });
      const existing = await prisma.clientConsent.findFirst({ where: { clientId: id, legalDocumentId: legalDocument.id, accepted: true, withdrawnAt: null } });
      if (!existing) {
        await prisma.$transaction(async (tx) => {
          const consent = await tx.clientConsent.create({ data: {
            id: crypto.randomUUID(),
            clientId: id,
            legalDocumentId: legalDocument.id,
            consentType: "brokerage_terms",
            version: legalDocument.version,
            channel: "broker_desk",
            metadata: { recordedBy: actor.id, evidenceNote: reason },
          } });
          await tx.auditLog.create({ data: {
            id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id,
            action: "BROKER_RECORDED_TERMS_ACCEPTANCE", entityType: "client", entityId: id,
            summary: `Broker recorded ${client.fullName}'s acceptance of brokerage agreement version ${legalDocument.version}`,
            reason,
            newValue: JSON.stringify({ consentId: consent.id, version: legalDocument.version, channel: "broker_desk" }),
          } });
        });
      }
      return Response.json({ ok: true, version: legalDocument.version });
    }

    if (payload.action === "complete_kyc_review") {
      const client = await prisma.client.findFirst({
        where: { id, brokerId: actor.brokerId },
        include: { documents: true, broker: { include: { settings: true } } },
      });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      const expected = expectedDocumentTypes(client.clientType);
      const incomplete = expected.filter((type) => !client.documents.some((document) => document.documentType === type && document.status === "approved"));
      if (incomplete.length) return Response.json({ error: `Approve all required KYC documents first: ${incomplete.join(", ")}.` }, { status: 409 });
      const reviewedAt = new Date();
      const dueAt = new Date(reviewedAt);
      dueAt.setUTCMonth(dueAt.getUTCMonth() + (client.broker.settings?.kycReviewMonths ?? 12));
      await prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { kycStatus: "approved", kycReviewDueAt: dueAt } });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id,
          action: "CLIENT_KYC_REVIEW_COMPLETED", entityType: "client", entityId: id,
          summary: `KYC review completed for ${client.fullName}`,
          reason: reason || "Required KYC documents reviewed and approved",
          previousValue: JSON.stringify({ kycStatus: client.kycStatus, kycReviewDueAt: client.kycReviewDueAt }),
          newValue: JSON.stringify({ kycStatus: "approved", kycReviewDueAt: dueAt.toISOString() }),
        } });
      });
      return Response.json({ ok: true, kycStatus: "approved", kycReviewDueAt: dueAt.toISOString() });
    }

    if (payload.action === "restrict" || payload.action === "restore") {
      const client = await prisma.client.findFirst({ where: { id, brokerId: actor.brokerId }, include: { accounts: true } });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      const restrictionCategory = String(payload.restrictionCategory ?? "").trim();
      const restrictionNote = String(payload.restrictionNote ?? "").trim();
      if (payload.action === "restrict" && !restrictionCategories.has(restrictionCategory)) {
        return Response.json({ error: "Choose a restriction reason." }, { status: 400 });
      }
      if (payload.action === "restrict" && restrictionCategory === "other" && restrictionNote.length < 5) {
        return Response.json({ error: "Add a note explaining the other restriction reason." }, { status: 400 });
      }
      const categoryLabel = restrictionCategory.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const recordedReason = payload.action === "restrict" ? `${categoryLabel}${restrictionNote ? ` — ${restrictionNote}` : ""}` : reason;
      const nextStatus = payload.action === "restrict" ? "restricted" : "active";
      await prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { status: nextStatus } });
        await tx.account.updateMany({
          where: { clientId: id, status: { not: "closed" } },
          data: payload.action === "restrict"
            ? { status: "restricted", restrictionReason: recordedReason, restrictedAt: new Date() }
            : { status: "active", restrictionReason: null, restrictedAt: null },
        });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: payload.action === "restrict" ? "CLIENT_ACCOUNT_RESTRICTED" : "CLIENT_ACCOUNT_RESTORED",
          entityType: "client",
          entityId: id,
          summary: `${client.fullName} ${payload.action === "restrict" ? "restricted" : "restored"}`,
          reason: recordedReason || null,
          previousValue: JSON.stringify({ clientStatus: client.status, accountStatuses: client.accounts.map((account) => account.status) }),
          newValue: JSON.stringify({ status: nextStatus, restrictionCategory: payload.action === "restrict" ? restrictionCategory : null, restrictionNote: payload.action === "restrict" ? restrictionNote || null : null }),
        } });
      });
      return Response.json({ ok: true, status: nextStatus });
    }

    const requestId = String(payload.requestId ?? "").trim();
    if (!requestId) return Response.json({ error: "A service request ID is required." }, { status: 400 });
    const serviceRequest = await prisma.clientServiceRequest.findFirst({
      where: { id: requestId, clientId: id, brokerId: actor.brokerId },
      include: {
        client: true,
        account: { include: { holdings: true, orders: true } },
      },
    });
    if (!serviceRequest) return Response.json({ error: "Service request not found." }, { status: 404 });
    if (!["open", "under_review"].includes(serviceRequest.status)) {
      return Response.json({ error: "This request has already been completed." }, { status: 409 });
    }

    if (payload.action === "approve_closure") {
      if (serviceRequest.requestType !== "account_closure" || !serviceRequest.account) {
        return Response.json({ error: "This is not an account closure request." }, { status: 400 });
      }
      const account = serviceRequest.account;
      const activeOrders = account.orders.filter((order) => !["rejected", "cancelled", "settled", "failed", "validation_failed"].includes(order.status));
      const hasCash = !account.totalCash.eq(ZERO) || !account.blockedCash.eq(ZERO) || !account.unsettledCash.eq(ZERO);
      const hasSecurities = account.holdings.some((holding) => !holding.totalQuantity.eq(ZERO) || !holding.blockedQuantity.eq(ZERO) || !holding.unsettledQuantity.eq(ZERO));
      if (activeOrders.length || hasCash || hasSecurities) {
        return Response.json({
          error: "The account cannot close until open orders are completed and all cash, blocked amounts, unsettled balances, and holdings are cleared.",
        }, { status: 409 });
      }
    }

    const status = payload.action === "reject_request" ? "rejected" : payload.action === "approve_closure" ? "approved" : "resolved";
    await prisma.$transaction(async (tx) => {
      await tx.clientServiceRequest.update({
        where: { id: serviceRequest.id },
        data: {
          status,
          resolutionNotes: reason || (status === "approved" ? "Closure controls passed." : "Reviewed by broker."),
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (payload.action === "approve_closure" && serviceRequest.accountId) {
        await tx.account.update({
          where: { id: serviceRequest.accountId },
          data: { status: "closed", closedAt: new Date(), restrictionReason: "Closed following approved client request" },
        });
        await tx.client.update({ where: { id }, data: { status: "closed" } });
      }
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(),
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: payload.action === "approve_closure" ? "CLIENT_ACCOUNT_CLOSED" : payload.action === "reject_request" ? "CLIENT_REQUEST_REJECTED" : "CLIENT_REQUEST_RESOLVED",
        entityType: "client_service_request",
        entityId: serviceRequest.id,
        summary: `${serviceRequest.subject} ${status} for ${serviceRequest.client.fullName}`,
        reason: reason || null,
        previousValue: JSON.stringify({ status: serviceRequest.status }),
        newValue: JSON.stringify({ status }),
      } });
    });
    return Response.json({ ok: true, requestId: serviceRequest.id, status });
  } catch (error) {
    return apiError(error);
  }
}
