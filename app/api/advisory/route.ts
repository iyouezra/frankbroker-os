import { ADVISORY_PERMISSIONS } from "../../../lib/frank";
import { apiError } from "../../../lib/api";
import { createDeal, createIssuer, listAdvisoryPortfolio } from "../../../lib/advisory-service";
import { prisma } from "../../../lib/prisma";
import { requireTenantModule } from "../../../lib/tenant-capabilities";

export const runtime = "nodejs";

async function auditWrite(actor: { brokerId: string; id: string }, dealId: string, action: string, summary: string) {
  await prisma.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action, entityType: "advisory_deal", entityId: dealId, summary } });
}

export async function GET(request: Request) {
  try {
    const { actor, context } = await requireTenantModule(request, "issuer_advisory", ADVISORY_PERMISSIONS.view);
    return Response.json({ tenant: context, ...(await listAdvisoryPortfolio(actor.brokerId)) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const entity = String(body.entity ?? "");
    const permission = entity === "issuer" ? ADVISORY_PERMISSIONS.issuerManage : entity === "deal" || entity === "party" ? ADVISORY_PERMISSIONS.dealManage : entity === "task" ? ADVISORY_PERMISSIONS.taskManage : ADVISORY_PERMISSIONS.submissionManage;
    const { actor } = await requireTenantModule(request, "issuer_advisory", permission);
    if (entity === "issuer") return Response.json({ issuer: await createIssuer(actor, body) }, { status: 201 });
    if (entity === "deal") return Response.json({ deal: await createDeal(actor, body) }, { status: 201 });
    const deal = await prisma.advisoryDeal.findFirst({ where: { id: String(body.dealId ?? ""), tenantId: actor.brokerId } });
    if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
    if (entity === "task") {
      const title = String(body.title ?? "").trim();
      if (!title) return Response.json({ error: "Task title is required." }, { status: 400 });
      const task = await prisma.dealTask.create({ data: { id: crypto.randomUUID(), tenantId: actor.brokerId, dealId: deal.id, title, description: String(body.description ?? "").trim() || null, assignedToUserId: String(body.assignedToUserId ?? "").trim() || null, createdByUserId: actor.id, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate ?? "")) ? new Date(`${String(body.dueDate)}T00:00:00.000Z`) : null, priority: String(body.priority ?? "normal") } });
      await auditWrite(actor, deal.id, "ADVISORY_TASK_CREATED", `${title} added to the deal work queue`);
      return Response.json({ task }, { status: 201 });
    }
    if (entity === "party") {
      const organization = String(body.organization ?? "").trim();
      if (!organization) return Response.json({ error: "Organization is required." }, { status: 400 });
      const party = await prisma.dealParty.create({ data: { id: crypto.randomUUID(), tenantId: actor.brokerId, dealId: deal.id, partyRole: String(body.partyRole ?? "other"), organization, contactName: String(body.contactName ?? "").trim() || null, email: String(body.email ?? "").trim() || null, phone: String(body.phone ?? "").trim() || null } });
      await auditWrite(actor, deal.id, "ADVISORY_PARTY_CREATED", `${organization} added to the deal team`);
      return Response.json({ party }, { status: 201 });
    }
    if (entity === "submission") {
      const submission = await prisma.dealSubmission.create({ data: { id: crypto.randomUUID(), tenantId: actor.brokerId, dealId: deal.id, authority: String(body.authority ?? "ECMA"), submissionType: String(body.submissionType ?? "registration_statement"), reference: String(body.reference ?? "").trim() || null, notes: String(body.notes ?? "").trim() || null, responseDueAt: /^\d{4}-\d{2}-\d{2}$/.test(String(body.responseDueAt ?? "")) ? new Date(`${String(body.responseDueAt)}T00:00:00.000Z`) : null } });
      await auditWrite(actor, deal.id, "ADVISORY_SUBMISSION_CREATED", `${submission.authority} ${submission.submissionType.replaceAll("_", " ")} recorded`);
      return Response.json({ submission }, { status: 201 });
    }
    if (entity === "query") {
      const question = String(body.question ?? "").trim();
      if (!question) return Response.json({ error: "Query or question is required." }, { status: 400 });
      const submission = await prisma.dealSubmission.findFirst({ where: { id: String(body.submissionId ?? ""), dealId: deal.id, tenantId: actor.brokerId } });
      if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });
      const query = await prisma.regulatoryQuery.create({ data: { id: crypto.randomUUID(), tenantId: actor.brokerId, submissionId: submission.id, question, reference: String(body.reference ?? "").trim() || null, ownerUserId: String(body.ownerUserId ?? "").trim() || null, receivedAt: new Date(), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate ?? "")) ? new Date(`${String(body.dueDate)}T00:00:00.000Z`) : null } });
      await auditWrite(actor, deal.id, "ADVISORY_REGULATORY_QUERY_CREATED", `${query.reference ?? "Regulatory query"} recorded against ${submission.authority}`);
      return Response.json({ query }, { status: 201 });
    }
    return Response.json({ error: "Unsupported advisory entity." }, { status: 400 });
  } catch (error) { return apiError(error); }
}
