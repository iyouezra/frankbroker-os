import { prisma } from "../../../../../lib/prisma";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";
import { apiError } from "../../../../../lib/api";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    const { id } = await context.params;
    const payload = (await request.json()) as { notes?: string };
    const exception = await prisma.reconciliationException.findUnique({ where: { id }, include: { batch: true } });
    if (!exception) return Response.json({ error: "Reconciliation exception not found." }, { status: 404 });
    if (exception.batch.brokerId !== actor.brokerId) return Response.json({ error: "Reconciliation exception not found for this tenant." }, { status: 404 });
    if (exception.batch.status === "superseded") return Response.json({ error: "A superseded reconciliation batch cannot be changed." }, { status: 409 });
    const day = await prisma.businessDayControl.findUnique({ where: { brokerId_businessDate: { brokerId: actor.brokerId, businessDate: exception.batch.batchDate } } });
    if (day?.status === "closed") return Response.json({ error: "This business day is closed. Reopen it before resolving exceptions." }, { status: 409 });
    if (exception.status === "resolved") return Response.json({ ok: true, status: "resolved" });
    const notes = String(payload.notes ?? "").trim();
    if (notes.length < 10 || notes.length > 1_000) return Response.json({ error: "Record resolution evidence of 10–1,000 characters." }, { status: 400 });

    await prisma.$transaction([
      prisma.reconciliationException.update({
        where: { id },
        data: {
          status: "resolved",
          resolutionNotes: notes,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "RECONCILIATION_EXCEPTION_RESOLVED",
          entityType: "reconciliation_exception",
          entityId: id,
          summary: `Exception ${id} resolved by ${actor.email}`,
          reason: notes,
        },
      }),
    ]);
    return Response.json({ ok: true, status: "resolved" });
  } catch (error) {
    return apiError(error);
  }
}
