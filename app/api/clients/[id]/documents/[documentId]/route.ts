import { apiError } from "../../../../../../lib/api";
import { prisma } from "../../../../../../lib/prisma";
import { requirePermission } from "../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const actor = await requirePermission(request, "report");
    const { id, documentId } = await context.params;
    const document = await prisma.clientDocument.findFirst({
      where: { id: documentId, clientId: id, brokerId: actor.brokerId },
      include: { content: true },
    });
    if (!document) return Response.json({ error: "Document not found for this client." }, { status: 404 });
    if (!document.content || document.sizeBytes <= 0) {
      return Response.json({ error: "This legacy record does not contain a file." }, { status: 404 });
    }
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const safeName = document.originalName.replace(/[\r\n"]/g, "_");
    return new Response(document.content.bytes, {
      headers: {
        "content-type": document.mimeType,
        "content-length": String(document.sizeBytes),
        "content-disposition": `${disposition}; filename="${safeName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
