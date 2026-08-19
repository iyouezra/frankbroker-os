import { apiError } from "../../../lib/api";
import {
  getEndOfDayReadiness,
  normalizeReconciliationRows,
  processReconciliationBatch,
  reconciliationFeed,
  serializeReconciliationBatch,
} from "../../../lib/reconciliation-service";
import { prisma } from "../../../lib/prisma";
import { requireTenantModule } from "../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const [batches, endOfDay] = await Promise.all([
      prisma.reconciliationBatch.findMany({
        where: { brokerId: actor.brokerId },
        include: { reviewedByUser: { select: { fullName: true } }, exceptions: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      getEndOfDayReadiness(prisma, actor.brokerId),
    ]);
    return Response.json({ batches: batches.map(serializeReconciliationBatch), endOfDay });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    const payload = (await request.json()) as { fileName?: string; feedType?: string; rows?: unknown };
    const fileName = String(payload.fileName ?? "").trim();
    if (!fileName || fileName.length > 255) return Response.json({ error: "Provide a valid source file name." }, { status: 400 });
    const feedType = reconciliationFeed(payload.feedType ?? "esx_executions");
    const rows = normalizeReconciliationRows(feedType, payload.rows);
    const created = await processReconciliationBatch({ db: prisma, brokerId: actor.brokerId, actorId: actor.id, fileName, feedType, rows });
    const batch = await prisma.reconciliationBatch.findUniqueOrThrow({
      where: { id: created.id },
      include: { reviewedByUser: { select: { fullName: true } }, exceptions: { orderBy: { createdAt: "asc" } } },
    });
    return Response.json({ batch: serializeReconciliationBatch(batch), matchRate: Math.round((created.matchedRecords / created.totalRecords) * 1_000) / 10 }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
