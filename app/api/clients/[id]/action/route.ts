import { apiError } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";
import { approveClient, rejectClient } from "../../../../../lib/client-service";
import { expectedDocumentTypes } from "../../../../../lib/onboarding-evidence";
import { completeServiceRequest } from "../../../../../lib/crm/service-request-service";
import {
  evaluateRestorationControls,
  inferRestrictionCategory,
  restrictionCategories,
  restrictionCategoryLabels,
  type RestrictionCategory,
} from "../../../../../lib/restriction-resolution";

export const runtime = "nodejs";

type ClientAction = "approve_client" | "reject_client" | "restrict" | "restore" | "record_terms_acceptance" | "complete_kyc_review" | "resolve_request" | "approve_closure" | "reject_request" | "add_note";
const restrictionCategorySet = new Set<string>(restrictionCategories);

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
      resolutionEvidence?: string;
      resolutionConfirmed?: boolean;
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
        include: { documents: true, screenings: { orderBy: { screenedAt: "desc" }, take: 1 }, broker: { include: { settings: true } } },
      });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      const expected = expectedDocumentTypes(client.clientType);
      const incomplete = expected.filter((type) => !client.documents.some((document) => document.documentType === type && document.status === "approved"));
      if (incomplete.length) return Response.json({ error: `Approve all required KYC documents first: ${incomplete.join(", ")}.` }, { status: 409 });
      if (client.screenings[0]?.result !== "clear") return Response.json({ error: "Record a clear sanctions and PEP screening result first." }, { status: 409 });
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
      const client = await prisma.client.findFirst({
        where: { id, brokerId: actor.brokerId },
        include: {
          accounts: true,
          documents: true,
          screenings: { orderBy: { screenedAt: "desc" }, take: 1 },
          consents: true,
          broker: {
            include: {
              legalDocuments: {
                where: { documentType: "brokerage_terms", status: "published" },
                orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
                take: 1,
              },
            },
          },
        },
      });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      const restrictionCategory = String(payload.restrictionCategory ?? "").trim();
      const restrictionNote = String(payload.restrictionNote ?? "").trim();
      if (payload.action === "restrict" && !restrictionCategorySet.has(restrictionCategory)) {
        return Response.json({ error: "Choose a restriction reason." }, { status: 400 });
      }
      if (payload.action === "restrict" && restrictionCategory === "other" && restrictionNote.length < 5) {
        return Response.json({ error: "Add a note explaining the other restriction reason." }, { status: 400 });
      }
      const originalRestriction = client.accounts.find((account) => account.restrictionReason)?.restrictionReason ?? null;
      const originalRestrictedAt = client.accounts.find((account) => account.restrictedAt)?.restrictedAt ?? null;
      const resolvedCategory = payload.action === "restrict"
        ? restrictionCategory as RestrictionCategory
        : inferRestrictionCategory(originalRestriction);
      const categoryLabel = restrictionCategoryLabels[resolvedCategory];
      const recordedReason = payload.action === "restrict" ? `${categoryLabel}${restrictionNote ? ` — ${restrictionNote}` : ""}` : reason;
      const nextStatus = payload.action === "restrict" ? "restricted" : "active";

      let resolutionEvidence = "";
      if (payload.action === "restore") {
        if (client.status !== "restricted" || !client.accounts.some((account) => account.status === "restricted")) {
          return Response.json({ error: "Only a currently restricted account can be restored." }, { status: 409 });
        }
        if (reason.length < 10) {
          return Response.json({ error: "Describe how the underlying restriction was resolved." }, { status: 400 });
        }
        resolutionEvidence = String(payload.resolutionEvidence ?? "").trim();
        if (resolutionEvidence.length < 5 || resolutionEvidence.length > 1_000) {
          return Response.json({ error: "Add a case, document, instruction or approval reference for the resolution." }, { status: 400 });
        }
        if (payload.resolutionConfirmed !== true) {
          return Response.json({ error: "Confirm that the restriction reason has been resolved before restoration." }, { status: 400 });
        }
        const currentLegal = client.broker.legalDocuments[0] ?? null;
        const consentReady = !currentLegal || client.consents.some((consent) => (
          consent.legalDocumentId === currentLegal.id && consent.accepted && !consent.withdrawnAt
        ));
        const restoration = evaluateRestorationControls({
          kycStatus: client.kycStatus,
          screeningStatus: client.screenings[0]?.result ?? null,
          expectedDocuments: expectedDocumentTypes(client.clientType),
          approvedDocuments: client.documents.filter((document) => document.status === "approved").map((document) => document.documentType),
          consentReady,
        });
        if (!restoration.ready) {
          return Response.json({
            error: "Resolve the outstanding account controls before restoration.",
            blockers: restoration.blockers,
          }, { status: 409 });
        }
      }

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
          previousValue: JSON.stringify({
            clientStatus: client.status,
            accounts: client.accounts.map((account) => ({ id: account.id, status: account.status, restrictionReason: account.restrictionReason, restrictedAt: account.restrictedAt })),
            restrictionCategory: payload.action === "restore" ? resolvedCategory : null,
            restrictionReason: originalRestriction,
            restrictedAt: originalRestrictedAt,
          }),
          newValue: JSON.stringify(payload.action === "restrict"
            ? { status: nextStatus, restrictionCategory: resolvedCategory, restrictionNote: restrictionNote || null }
            : {
                status: nextStatus,
                restrictionCategory: resolvedCategory,
                resolution: { outcome: reason, evidenceReference: resolutionEvidence, confirmed: true },
              }),
        } });
      });
      return Response.json({ ok: true, status: nextStatus });
    }

    const requestId = String(payload.requestId ?? "").trim();
    if (!requestId) return Response.json({ error: "A service request ID is required." }, { status: 400 });
    const decision = payload.action === "reject_request" ? "reject" : payload.action === "approve_closure" ? "approve_closure" : "resolve";
    const completed = await completeServiceRequest(actor, {
      requestId,
      clientId: id,
      decision,
      outcomeSummary: reason,
    });
    return Response.json({ ok: true, ...completed });
  } catch (error) {
    return apiError(error);
  }
}
