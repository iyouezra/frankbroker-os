import { prisma } from "./prisma";
import type { Actor } from "./server-auth";

const DEAL_STAGES = ["draft", "readiness", "due_diligence", "filing_preparation", "submitted", "regulatory_review", "approved_admitted", "closed"] as const;
const SATISFIED = new Set(["satisfied", "not_applicable"]);

const dateOnly = (value: unknown) => {
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
};

const readiness = (items: Array<{ required: boolean; status: string }>) => {
  const required = items.filter((item) => item.required);
  const complete = required.filter((item) => SATISFIED.has(item.status)).length;
  return { percent: required.length ? Math.round(complete / required.length * 100) : 100, complete, total: required.length };
};

export async function listAdvisoryPortfolio(tenantId: string) {
  const [deals, issuers, pendingApprovals, openQueries, overdueTasks] = await Promise.all([
    prisma.advisoryDeal.findMany({
      where: { tenantId },
      include: { issuer: true, checklistItems: { select: { required: true, status: true } }, tasks: { where: { status: { not: "completed" } }, select: { dueDate: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.issuer.findMany({ where: { tenantId }, orderBy: { legalName: "asc" } }),
    prisma.dealChecklistItem.count({ where: { tenantId, status: "pending_approval" } }),
    prisma.regulatoryQuery.count({ where: { tenantId, status: { in: ["open", "draft_response"] } } }),
    prisma.dealTask.count({ where: { tenantId, status: { not: "completed" }, dueDate: { lt: new Date() } } }),
  ]);
  return {
    metrics: { activeDeals: deals.filter((deal) => deal.status === "active").length, pendingApprovals, openQueries, overdueTasks },
    deals: deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      issuer: { id: deal.issuer.id, name: deal.issuer.tradingName ?? deal.issuer.legalName },
      transactionType: deal.transactionType,
      marketSegment: deal.marketSegment,
      stage: deal.stage,
      status: deal.status,
      targetDate: deal.targetDate?.toISOString().slice(0, 10) ?? null,
      leadUserId: deal.leadUserId,
      readiness: readiness(deal.checklistItems),
      blockedItems: deal.checklistItems.filter((item) => item.status === "blocked").length,
      nextDeadline: deal.tasks.map((task) => task.dueDate).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0]?.toISOString().slice(0, 10) ?? null,
    })),
    issuers: issuers.map((issuer) => ({
      id: issuer.id, legalName: issuer.legalName, tradingName: issuer.tradingName, entityType: issuer.entityType,
      registrationNumber: issuer.registrationNumber, sector: issuer.sector, contactName: issuer.contactName,
      contactEmail: issuer.contactEmail, status: issuer.status,
    })),
  };
}

export async function getAdvisoryDeal(tenantId: string, id: string) {
  const deal = await prisma.advisoryDeal.findFirst({
    where: { id, tenantId },
    include: {
      issuer: true,
      checklistTemplate: true,
      checklistItems: { include: { documents: { include: { currentVersion: true } } }, orderBy: [{ section: "asc" }, { sortOrder: "asc" }] },
      documents: { include: { currentVersion: true, versions: { orderBy: { versionNo: "desc" }, select: { id: true, versionNo: true, originalName: true, mimeType: true, sizeBytes: true, uploadedBy: true, uploadedAt: true } } }, orderBy: { updatedAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      parties: { orderBy: { partyRole: "asc" } },
      submissions: { include: { regulatoryQueries: { orderBy: { receivedAt: "desc" } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) throw new Response("Deal not found.", { status: 404 });
  const audit = await prisma.auditLog.findMany({ where: { brokerId: tenantId, entityId: id }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return {
    ...deal,
    targetDate: deal.targetDate?.toISOString().slice(0, 10) ?? null,
    readiness: readiness(deal.checklistItems),
    checklistTemplate: { id: deal.checklistTemplate.id, code: deal.checklistTemplate.code, version: deal.checklistTemplate.version, title: deal.checklistTemplate.title, sourceSet: deal.checklistTemplate.sourceSet },
    activity: audit.map((item) => ({ id: item.id, action: item.action, summary: item.summary, actor: item.actor?.fullName ?? "System", at: item.createdAt.toISOString() })),
  };
}

export async function createIssuer(actor: Actor, input: Record<string, unknown>) {
  const legalName = String(input.legalName ?? "").trim();
  if (!legalName) throw new Response("Legal name is required.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const issuer = await tx.issuer.create({ data: {
      id: crypto.randomUUID(), tenantId: actor.brokerId, legalName,
      tradingName: String(input.tradingName ?? "").trim() || null,
      entityType: String(input.entityType ?? "share_company"),
      registrationNumber: String(input.registrationNumber ?? "").trim() || null,
      tinReference: String(input.tinReference ?? "").trim() || null,
      sector: String(input.sector ?? "").trim() || null,
      contactName: String(input.contactName ?? "").trim() || null,
      contactEmail: String(input.contactEmail ?? "").trim() || null,
      contactPhone: String(input.contactPhone ?? "").trim() || null,
    } });
    await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "ADVISORY_ISSUER_CREATED", entityType: "issuer", entityId: issuer.id, summary: `${legalName} added to the issuer directory` } });
    return issuer;
  });
}

export async function createDeal(actor: Actor, input: Record<string, unknown>) {
  const transactionType = String(input.transactionType ?? "");
  const marketSegment = String(input.marketSegment ?? "");
  if (!(["ipo", "otc_admission"].includes(transactionType)) || !(["main", "growth", "otc"].includes(marketSegment))) throw new Response("Choose a supported transaction type and market segment.", { status: 400 });
  if ((transactionType === "ipo" && marketSegment === "otc") || (transactionType === "otc_admission" && marketSegment !== "otc")) throw new Response("The checklist segment does not match the transaction type.", { status: 400 });
  const template = await prisma.tenantChecklistPack.findFirst({ where: { tenantId: actor.brokerId, enabled: true, template: { transactionType, marketSegment, status: "published" } }, include: { template: { include: { items: { orderBy: { sortOrder: "asc" } } } } } });
  if (!template) throw new Response("No published checklist pack is enabled for this transaction.", { status: 409 });
  const issuer = await prisma.issuer.findFirst({ where: { id: String(input.issuerId ?? ""), tenantId: actor.brokerId } });
  if (!issuer) throw new Response("Issuer not found.", { status: 404 });
  const name = String(input.name ?? "").trim();
  if (!name) throw new Response("Deal name is required.", { status: 400 });

  return prisma.$transaction(async (tx) => {
    const deal = await tx.advisoryDeal.create({ data: {
      id: crypto.randomUUID(), tenantId: actor.brokerId, issuerId: issuer.id, checklistTemplateId: template.template.id,
      name, transactionType, marketSegment, mandateReference: String(input.mandateReference ?? "").trim() || null,
      leadUserId: String(input.leadUserId ?? "").trim() || actor.id, targetDate: dateOnly(input.targetDate), createdByUserId: actor.id,
    } });
    await tx.dealChecklistItem.createMany({ data: template.template.items.map((item) => ({
      id: crypto.randomUUID(), tenantId: actor.brokerId, dealId: deal.id, templateItemId: item.id, itemCode: item.itemCode,
      section: item.section, title: item.title, guidance: item.guidance, expectedEvidence: item.expectedEvidence,
      required: item.required, sortOrder: item.sortOrder, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sourceReference: item.sourceReference,
    })) });
    await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "ADVISORY_DEAL_CREATED", entityType: "advisory_deal", entityId: deal.id, summary: `${name} created from checklist ${template.template.code} v${template.template.version}` } });
    return deal;
  });
}

export async function advanceDealStage(actor: Actor, dealId: string, input: Record<string, unknown>) {
  const stage = String(input.stage ?? "");
  if (!(DEAL_STAGES as readonly string[]).includes(stage)) throw new Response("Invalid deal stage.", { status: 400 });
  const deal = await prisma.advisoryDeal.findFirst({ where: { id: dealId, tenantId: actor.brokerId }, include: { checklistItems: { select: { required: true, status: true } } } });
  if (!deal) throw new Response("Deal not found.", { status: 404 });
  const state = readiness(deal.checklistItems);
  const reason = String(input.overrideReason ?? "").trim();
  if (state.percent < 100 && !reason) throw new Response("Provide an override reason while mandatory checklist items remain incomplete.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.advisoryDeal.update({ where: { id: deal.id }, data: { stage, stageOverrideReason: state.percent < 100 ? reason : null, version: { increment: 1 } } });
    await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "ADVISORY_DEAL_STAGE_CHANGED", entityType: "advisory_deal", entityId: deal.id, summary: `${deal.name} moved to ${stage.replaceAll("_", " ")}`, reason: state.percent < 100 ? reason : null, previousValue: JSON.stringify({ stage: deal.stage }), newValue: JSON.stringify({ stage, readiness: state.percent }) } });
    return updated;
  });
}

export async function actOnChecklistItem(actor: Actor, itemId: string, input: Record<string, unknown>) {
  const item = await prisma.dealChecklistItem.findFirst({ where: { id: itemId, tenantId: actor.brokerId }, include: { deal: true } });
  if (!item) throw new Response("Checklist item not found.", { status: 404 });
  if (Number(input.version) !== item.version) throw new Response("This checklist item changed. Refresh and try again.", { status: 409 });
  const action = String(input.action ?? "");
  const note = String(input.note ?? "").trim();
  const now = new Date();
  let data: Record<string, unknown>;
  if (action === "save") {
    data = { status: item.status === "satisfied" || item.status === "not_applicable" ? "in_progress" : String(input.status ?? "in_progress"), notes: note, ownerUserId: String(input.ownerUserId ?? "").trim() || null, dueDate: dateOnly(input.dueDate), reviewedByUserId: null, reviewedAt: null, reviewNote: null, version: { increment: 1 } };
  } else if (action === "submit") {
    data = { status: "pending_approval", notes: note || item.notes, preparedByUserId: actor.id, preparedAt: now, reviewedByUserId: null, reviewedAt: null, reviewNote: null, version: { increment: 1 } };
  } else if (["approve", "return", "not_applicable"].includes(action)) {
    if (item.status !== "pending_approval") throw new Response("Only submitted items can be reviewed.", { status: 409 });
    if (item.preparedByUserId === actor.id) throw new Response("Maker-checker requires a different reviewer.", { status: 409 });
    if ((action === "return" || action === "not_applicable") && !note) throw new Response("A review reason is required.", { status: 400 });
    data = { status: action === "approve" ? "satisfied" : action === "return" ? "returned" : "not_applicable", reviewedByUserId: actor.id, reviewedAt: now, reviewNote: note || null, notApplicableReason: action === "not_applicable" ? note : null, version: { increment: 1 } };
  } else throw new Response("Unsupported checklist action.", { status: 400 });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.dealChecklistItem.update({ where: { id: item.id }, data });
    await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: `ADVISORY_CHECKLIST_${action.toUpperCase()}`, entityType: "advisory_deal", entityId: item.dealId, summary: `${item.title}: ${String(updated.status).replaceAll("_", " ")}`, reason: note || null, previousValue: JSON.stringify({ status: item.status, version: item.version }), newValue: JSON.stringify({ status: updated.status, version: updated.version }) } });
    return updated;
  });
}
