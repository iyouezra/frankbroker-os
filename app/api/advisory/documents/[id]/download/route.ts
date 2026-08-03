import { apiError } from "../../../../../../lib/api";
import { ADVISORY_PERMISSIONS } from "../../../../../../lib/frank";
import { prisma } from "../../../../../../lib/prisma";
import { requireTenantModule } from "../../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "issuer_advisory", ADVISORY_PERMISSIONS.view);
    const { id } = await context.params;
    const version = await prisma.dealDocumentVersion.findFirst({ where: { id, document: { tenantId: actor.brokerId } }, include: { content: true } });
    if (!version?.content) return Response.json({ error: "Document version not found." }, { status: 404 });
    return new Response(version.content.bytes, { headers: { "content-type": version.mimeType, "content-disposition": `attachment; filename="${version.originalName.replaceAll('"', "")}"`, "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
