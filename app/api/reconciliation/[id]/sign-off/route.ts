import { apiError } from "../../../../../lib/api";
import { COMPLIANCE_PERMISSIONS } from "../../../../../lib/frank";
import { writeAudit } from "../../../../../lib/oms/audit-service";
import { prisma } from "../../../../../lib/prisma";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", COMPLIANCE_PERMISSIONS.reconciliationSignoff);
    const { id } = await context.params;
    const payload = await request.json() as { evidenceReference?: string };
    const evidenceReference = String(payload.evidenceReference ?? "").trim();
    if (evidenceReference.length < 3 || evidenceReference.length > 160) return Response.json({ error: "Enter the bank, CSD or custody evidence reference." }, { status: 400 });
    const batch = await prisma.reconciliationBatch.findFirst({ where: { id, brokerId: actor.brokerId }, include: { exceptions: true } });
    if (!batch) return Response.json({ error: "Reconciliation batch not found for this tenant." }, { status: 404 });
    if (batch.status === "signed_off") return Response.json({ ok: true, status: batch.status });
    if (batch.status === "superseded") return Response.json({ error: "A superseded reconciliation batch cannot be signed off." }, { status: 409 });
    const day = await prisma.businessDayControl.findUnique({ where: { brokerId_businessDate: { brokerId: actor.brokerId, businessDate: batch.batchDate } } });
    if (day?.status === "closed") return Response.json({ error: "This business day is closed. Reopen it before changing reconciliation evidence." }, { status: 409 });
    if (batch.uploadedBy === actor.id) return Response.json({ error: "Four-eyes control: the importer cannot sign off the same reconciliation." }, { status: 409 });
    if (batch.exceptions.some((item) => item.status !== "resolved")) return Response.json({ error: "Resolve every reconciliation exception before sign-off." }, { status: 409 });
    const reviewedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.reconciliationBatch.update({ where: { id }, data: { status: "signed_off", reviewedBy: actor.id, reviewedAt, evidenceReference } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "RECONCILIATION_SIGNED_OFF", entityType: "reconciliation_batch", entityId: id, summary: `${id} independently reviewed and signed off`, newValue: { status: "signed_off", evidenceReference, reviewedAt } });
    });
    return Response.json({ ok: true, status: "signed_off", reviewedAt: reviewedAt.toISOString(), evidenceReference });
  } catch (error) {
    return apiError(error);
  }
}
