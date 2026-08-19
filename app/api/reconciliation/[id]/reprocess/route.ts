import { apiError } from "../../../../../lib/api";
import { normalizeReconciliationRows, processReconciliationBatch, reconciliationFeed, serializeReconciliationBatch } from "../../../../../lib/reconciliation-service";
import { prisma } from "../../../../../lib/prisma";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    const { id } = await context.params;
    const payload = await request.json() as { reason?: string };
    const reason = String(payload.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 500) return Response.json({ error: "Record a reprocessing reason of 10–500 characters." }, { status: 400 });
    const prior = await prisma.reconciliationBatch.findFirst({ where: { id, brokerId: actor.brokerId } });
    if (!prior) return Response.json({ error: "Reconciliation batch not found for this tenant." }, { status: 404 });
    if (!prior.inputRows) return Response.json({ error: "This legacy batch has no retained source rows and cannot be reprocessed." }, { status: 409 });
    const feedType = reconciliationFeed(prior.feedType);
    const rows = normalizeReconciliationRows(feedType, prior.inputRows);
    const created = await processReconciliationBatch({
      db: prisma,
      brokerId: actor.brokerId,
      actorId: actor.id,
      fileName: prior.fileName ?? `${prior.id}.csv`,
      feedType,
      rows,
      businessDate: prior.batchDate,
      supersedesBatchId: prior.id,
      attemptNumber: prior.attemptNumber + 1,
      reprocessReason: reason,
    });
    const batch = await prisma.reconciliationBatch.findUniqueOrThrow({
      where: { id: created.id },
      include: { reviewedByUser: { select: { fullName: true } }, exceptions: { orderBy: { createdAt: "asc" } } },
    });
    return Response.json({ batch: serializeReconciliationBatch(batch) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
