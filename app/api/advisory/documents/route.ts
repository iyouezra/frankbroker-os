import { apiError } from "../../../../lib/api";
import { ADVISORY_PERMISSIONS } from "../../../../lib/frank";
import { prisma } from "../../../../lib/prisma";
import { requireTenantModule } from "../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "issuer_advisory", ADVISORY_PERMISSIONS.documentManage);
    const form = await request.formData();
    const dealId = String(form.get("dealId") ?? "");
    const deal = await prisma.advisoryDeal.findFirst({ where: { id: dealId, tenantId: actor.brokerId } });
    if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
    const existingId = String(form.get("documentId") ?? "");
    const existing = existingId ? await prisma.dealDocument.findFirst({ where: { id: existingId, tenantId: actor.brokerId, dealId } }) : null;
    if (existingId && !existing) return Response.json({ error: "Document not found." }, { status: 404 });
    const file = form.get("file");
    const externalUrl = String(form.get("externalUrl") ?? "").trim();
    if (!(file instanceof File) && !externalUrl) return Response.json({ error: "Upload a file or provide an external data-room link." }, { status: 400 });
    if (file instanceof File && (!ALLOWED.has(file.type) || file.size > MAX_BYTES)) return Response.json({ error: "Use PDF, DOCX, XLSX, PNG or JPEG files up to 12 MB." }, { status: 400 });
    const title = String(form.get("title") ?? existing?.title ?? "").trim();
    if (!title) return Response.json({ error: "Document title is required." }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const document = existing ?? await tx.dealDocument.create({ data: {
        id: crypto.randomUUID(), tenantId: actor.brokerId, dealId, title,
        documentType: String(form.get("documentType") ?? "supporting_evidence"),
        checklistItemId: String(form.get("checklistItemId") ?? "").trim() || null,
        ownerUserId: actor.id, status: file instanceof File ? "received" : "linked", externalUrl: externalUrl || null,
      } });
      if (!(file instanceof File)) {
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "ADVISORY_DOCUMENT_LINKED", entityType: "advisory_deal", entityId: dealId, summary: `${title} linked from an external data room` } });
        return document;
      }
      const last = await tx.dealDocumentVersion.findFirst({ where: { documentId: document.id }, orderBy: { versionNo: "desc" } });
      const version = await tx.dealDocumentVersion.create({ data: { id: crypto.randomUUID(), documentId: document.id, versionNo: (last?.versionNo ?? 0) + 1, originalName: file.name, mimeType: file.type, sizeBytes: file.size, uploadedBy: actor.id } });
      await tx.dealDocumentContent.create({ data: { versionId: version.id, bytes: new Uint8Array(await file.arrayBuffer()) } });
      await tx.dealDocument.update({ where: { id: document.id }, data: { title, status: "received", externalUrl: externalUrl || document.externalUrl, currentVersionId: version.id } });
      await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "ADVISORY_DOCUMENT_UPLOADED", entityType: "advisory_deal", entityId: dealId, summary: `${title} version ${version.versionNo} uploaded` } });
      return document;
    });
    return Response.json({ document: result }, { status: 201 });
  } catch (error) { return apiError(error); }
}
