import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, "adjust");
    const { id } = await context.params;
    const payload = (await request.json()) as { notes?: string };
    const exception = await prisma.reconciliationException.findUnique({ where: { id } });
    if (!exception) return Response.json({ error: "Reconciliation exception not found." }, { status: 404 });
    if (exception.status === "resolved") return Response.json({ ok: true, status: "resolved" });

    await prisma.$transaction([
      prisma.reconciliationException.update({
        where: { id },
        data: {
          status: "resolved",
          resolutionNotes: payload.notes?.trim() || "Reviewed and accepted for the demonstration batch",
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
        },
      }),
    ]);
    return Response.json({ ok: true, status: "resolved" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve exception." }, { status: 500 });
  }
}
