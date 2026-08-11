import { apiError } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const { id } = await context.params;
    const proof = await prisma.cashMovementProof.findFirst({
      where: { cashMovementId: id, cashMovement: { brokerId: actor.brokerId } },
    });
    if (!proof) return Response.json({ error: "Deposit receipt not found for this tenant." }, { status: 404 });
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const safeName = proof.originalName.replace(/[\r\n"]/g, "_");
    return new Response(proof.bytes, {
      headers: {
        "content-type": proof.mimeType,
        "content-length": String(proof.sizeBytes),
        "content-disposition": `${disposition}; filename="${safeName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
