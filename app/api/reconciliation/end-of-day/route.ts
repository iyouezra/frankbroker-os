import { addisDateOnly } from "../../../../lib/addis-date";
import { apiError } from "../../../../lib/api";
import { COMPLIANCE_PERMISSIONS } from "../../../../lib/frank";
import { writeAudit } from "../../../../lib/oms/audit-service";
import { runOrderExpirySweep } from "../../../../lib/oms/order-expiry-service";
import { prisma } from "../../../../lib/prisma";
import { getEndOfDayReadiness } from "../../../../lib/reconciliation-service";
import { requireTenantModule } from "../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    await runOrderExpirySweep({ brokerId: actor.brokerId });
    return Response.json({ endOfDay: await getEndOfDayReadiness(prisma, actor.brokerId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", COMPLIANCE_PERMISSIONS.reconciliationSignoff);
    const payload = await request.json() as { action?: "close" | "reopen"; evidence?: string; reason?: string; version?: number };
    const businessDate = addisDateOnly();
    const current = await prisma.businessDayControl.findUnique({ where: { brokerId_businessDate: { brokerId: actor.brokerId, businessDate } } });
    const suppliedVersion = Number(payload.version ?? 0);
    if (!Number.isInteger(suppliedVersion) || suppliedVersion !== (current?.version ?? 0)) {
      return Response.json({ error: "The end-of-day control changed. Refresh before continuing." }, { status: 409 });
    }

    if (payload.action === "close") {
      const expiry = await runOrderExpirySweep({ brokerId: actor.brokerId });
      if (expiry.errors.length) return Response.json({ error: "End-of-day close is blocked because one or more expired orders could not release their reservations.", expiry }, { status: 409 });
      if (current?.status === "closed") return Response.json({ endOfDay: await getEndOfDayReadiness(prisma, actor.brokerId, businessDate) });
      const evidence = String(payload.evidence ?? "").trim();
      if (evidence.length < 3 || evidence.length > 160) return Response.json({ error: "Record the end-of-day evidence or control-pack reference." }, { status: 400 });
      const readiness = await getEndOfDayReadiness(prisma, actor.brokerId, businessDate);
      if (!readiness.ready) return Response.json({ error: "End-of-day close is blocked until every control passes.", checks: readiness.checks }, { status: 409 });
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        if (current) {
          const updated = await tx.businessDayControl.updateMany({
            where: { id: current.id, version: suppliedVersion, status: { not: "closed" } },
            data: { status: "closed", cutoffAt: now, closeEvidence: evidence, closedBy: actor.id, closedAt: now, version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new Response("The end-of-day control changed. Refresh before continuing.", { status: 409 });
        } else {
          await tx.businessDayControl.create({
            data: { id: crypto.randomUUID(), brokerId: actor.brokerId, businessDate, status: "closed", cutoffAt: now, closeEvidence: evidence, closedBy: actor.id, closedAt: now, version: 1 },
          });
        }
        await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "BUSINESS_DAY_CLOSED", entityType: "business_day", entityId: businessDate.toISOString().slice(0, 10), summary: `Business day ${businessDate.toISOString().slice(0, 10)} closed at cut-off`, newValue: { evidence, cutoffAt: now } });
      });
    } else if (payload.action === "reopen") {
      if (actor.role !== "broker_admin") return Response.json({ error: "Only a broker administrator may authorize reopening a closed business day." }, { status: 403 });
      if (!current || current.status !== "closed") return Response.json({ error: "Only a closed business day can be reopened." }, { status: 409 });
      if (current.closedBy === actor.id) return Response.json({ error: "Four-eyes control: the closer cannot authorize reopening the same business day." }, { status: 409 });
      const reason = String(payload.reason ?? "").trim();
      if (reason.length < 10 || reason.length > 500) return Response.json({ error: "Record a reopening reason of 10–500 characters." }, { status: 400 });
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        const updated = await tx.businessDayControl.updateMany({
          where: { id: current.id, version: suppliedVersion, status: "closed" },
          data: { status: "reopened", reopenReason: reason, reopenedBy: actor.id, reopenedAt: now, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new Response("The end-of-day control changed. Refresh before continuing.", { status: 409 });
        await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "BUSINESS_DAY_REOPENED", entityType: "business_day", entityId: businessDate.toISOString().slice(0, 10), summary: `Business day ${businessDate.toISOString().slice(0, 10)} reopened under four-eyes control`, reason, previousValue: { status: "closed", closedAt: current.closedAt }, newValue: { status: "reopened", reopenedAt: now } });
      });
    } else {
      return Response.json({ error: "Choose close or reopen." }, { status: 400 });
    }

    return Response.json({ endOfDay: await getEndOfDayReadiness(prisma, actor.brokerId, businessDate) });
  } catch (error) {
    return apiError(error);
  }
}
