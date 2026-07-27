import { apiError } from "../../../../../lib/api";
import {
  expectedDocumentTypes,
  prepareDocument,
  saveOnboardingEvidence,
  type ClientDocumentType,
} from "../../../../../lib/onboarding-evidence";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, "adjust");
    const { id } = await context.params;
    const formData = await request.formData();
    const documentType = String(formData.get("documentType") ?? "") as ClientDocumentType;
    const file = formData.get("file");
    const client = await prisma.client.findFirst({ where: { id, brokerId: actor.brokerId } });
    if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
    if (!expectedDocumentTypes(client.clientType).includes(documentType)) {
      return Response.json({ error: "That document type does not apply to this client." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: "Choose a PDF, PNG, or JPG document to upload." }, { status: 400 });
    }
    const document = await prepareDocument(documentType, file);
    await prisma.$transaction(async (tx) => {
      await saveOnboardingEvidence(tx, {
        brokerId: actor.brokerId,
        clientId: client.id,
        source: "broker_desk",
        legalName: client.fullName,
        clientType: client.clientType,
        documents: [document],
        banks: [],
      });
      if (documentType === "proof_of_address") {
        await tx.client.update({ where: { id: client.id }, data: { proofOfAddressStatus: "received" } });
      }
      const saved = await tx.clientDocument.findUniqueOrThrow({
        where: { clientId_documentType: { clientId: client.id, documentType } },
      });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(),
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "BROKER_KYC_DOCUMENT_UPLOADED",
        entityType: "client_document",
        entityId: saved.id,
        summary: `${actor.email} uploaded ${documentType.replaceAll("_", " ")} for ${client.fullName}`,
        newValue: JSON.stringify({ clientId: client.id, documentType, fileName: document.originalName, source: "broker_desk" }),
      } });
    });
    return Response.json({ ok: true, documentType }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
