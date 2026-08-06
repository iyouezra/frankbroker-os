import { apiError } from "../../../../../../../lib/api";
import { prisma } from "../../../../../../../lib/prisma";
import { requirePermission } from "../../../../../../../lib/server-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const payload = await request.json() as { action?: string; reason?: string };
    const action = payload.action === "approve" ? "approve" : payload.action === "reject" ? "reject" : null;
    if (!action) return Response.json({ error: "Choose approve or reject." }, { status: 400 });
    const actor = await requirePermission(request, action);
    const { id, documentId } = await context.params;
    const reason = String(payload.reason ?? "").trim();
    if (action === "reject" && reason.length < 5) {
      return Response.json({ error: "Enter a clear reason for not approving the document." }, { status: 400 });
    }
    const document = await prisma.clientDocument.findFirst({
      where: { id: documentId, clientId: id, brokerId: actor.brokerId },
      include: { client: true },
    });
    if (!document) return Response.json({ error: "Document not found for this client." }, { status: 404 });
    const status = action === "approve" ? "approved" : "rejected";
    await prisma.$transaction(async (tx) => {
      await tx.clientDocument.update({
        where: { id: document.id },
        data: { status, reviewedBy: actor.id, reviewedAt: new Date(), rejectionReason: action === "reject" ? reason : null },
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: action === "approve" ? "CLIENT_DOCUMENT_APPROVED" : "CLIENT_DOCUMENT_REJECTED",
          entityType: "client_document",
          entityId: document.id,
          summary: `${document.documentType.replaceAll("_", " ")} ${status} for ${document.client.fullName}`,
          reason: action === "reject" ? reason : null,
          newValue: JSON.stringify({ clientId: id, documentType: document.documentType, status }),
        },
      });
    });
    return Response.json({ ok: true, status });
  } catch (error) {
    return apiError(error);
  }
}
