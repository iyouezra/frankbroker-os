import { Prisma } from "../app/generated/prisma/client";
import { D, money, toNum, ZERO } from "./money";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";
import { writeAudit } from "./oms/audit-service";
import { resolveActiveTaxPolicy } from "./tax-lot-service";

const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const POLICY_TYPES = new Set(["capital_gain", "dividend", "interest", "redemption"]);

function calendarDate(value: unknown, label: string, required = true) {
  if (!required && (value === null || value === undefined || value === "")) return null;
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Response(`${label} must be a calendar date.`, { status: 400 });
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Response(`${label} is invalid.`, { status: 400 });
  return date;
}

type RealizationSource = { id: string; realizedGain: Prisma.Decimal | null; saleTrade: { tradeDate: Date; order: { account: { client: { brokerId: string } }; instrument: { assetClass: string } } } | null; corporateActionEntitlement: { corporateAction: { brokerId: string; paymentDate: Date; instrument: { assetClass: string } } } | null };

async function appendRealizedTax(tx: Prisma.TransactionClient, allocation: RealizationSource, policyOverride?: { id: string; version: string; ratePct: Prisma.Decimal; legalReference: string }) {
  if (allocation.realizedGain === null) return false;
  const source = allocation.saleTrade
    ? { brokerId: allocation.saleTrade.order.account.client.brokerId, assetClass: allocation.saleTrade.order.instrument.assetClass, date: allocation.saleTrade.tradeDate }
    : allocation.corporateActionEntitlement
      ? { brokerId: allocation.corporateActionEntitlement.corporateAction.brokerId, assetClass: allocation.corporateActionEntitlement.corporateAction.instrument.assetClass, date: allocation.corporateActionEntitlement.corporateAction.paymentDate }
      : null;
  if (!source) throw new Error("Realized allocation has no disposition source.");
  const policy = policyOverride ?? await resolveActiveTaxPolicy(tx, source.brokerId, "capital_gain", source.assetClass, source.date);
  if (!policy) return false;
  const latest = await tx.taxCalculation.findFirst({ where: { realizedGainAllocationId: allocation.id, taxPolicyVersionId: policy.id }, orderBy: { revision: "desc" } });
  const taxable = money(Prisma.Decimal.max(ZERO, allocation.realizedGain));
  await tx.taxCalculation.create({ data: { id: crypto.randomUUID(), realizedGainAllocationId: allocation.id, taxPolicyVersionId: policy.id, revision: (latest?.revision ?? 0) + 1, taxableAmount: taxable, ratePct: policy.ratePct, taxAmount: money(taxable.times(policy.ratePct).div(100)), status: "estimate", supersedesId: latest?.id ?? null, calculationSnapshot: { policyVersion: policy.version, legalReference: policy.legalReference, method: "fifo", negativeGainFlooredForEstimate: true } } });
  return true;
}

async function recalculatePolicy(tx: Prisma.TransactionClient, policy: { id: string; brokerId: string; appliesTo: string; assetClass: string | null; version: string; ratePct: Prisma.Decimal; legalReference: string; withholdingRequired: boolean; effectiveFrom: Date; effectiveTo: Date | null; retrospectiveFrom: Date | null }) {
  const from = policy.retrospectiveFrom ?? policy.effectiveFrom;
  let calculations = 0;
  if (policy.appliesTo === "capital_gain") {
    const dateRange = { gte: from, ...(policy.effectiveTo ? { lte: policy.effectiveTo } : {}) };
    const allocations = await tx.realizedGainAllocation.findMany({ where: { OR: [{ saleTrade: { tradeDate: dateRange, order: { account: { client: { brokerId: policy.brokerId } }, ...(policy.assetClass ? { instrument: { assetClass: policy.assetClass } } : {}) } } }, { corporateActionEntitlement: { corporateAction: { brokerId: policy.brokerId, paymentDate: dateRange, ...(policy.assetClass ? { instrument: { assetClass: policy.assetClass } } : {}) } } }] }, include: { saleTrade: { include: { order: { include: { account: { include: { client: true } }, instrument: true } } } }, corporateActionEntitlement: { include: { corporateAction: { include: { instrument: true } } } } } });
    for (const allocation of allocations) if (await appendRealizedTax(tx, allocation, policy)) calculations += 1;
  } else {
    const entitlements = await tx.corporateActionEntitlement.findMany({ where: { corporateAction: { brokerId: policy.brokerId, paymentDate: { gte: from, ...(policy.effectiveTo ? { lte: policy.effectiveTo } : {}) }, ...(policy.assetClass ? { instrument: { assetClass: policy.assetClass } } : {}), actionType: policy.appliesTo === "dividend" ? { in: ["cash_dividend", "stock_dividend"] } : policy.appliesTo === "interest" ? "coupon" : { in: ["maturity", "redemption"] } }, grossCash: { not: null } }, include: { corporateAction: true, taxCalculations: { where: { taxPolicyVersionId: policy.id }, orderBy: { revision: "desc" }, take: 1 } } });
    for (const entitlement of entitlements) {
      const gross = entitlement.grossCash!;
      const latest = entitlement.taxCalculations[0];
      const tax = money(gross.times(policy.ratePct).div(100));
      await tx.taxCalculation.create({ data: { id: crypto.randomUUID(), corporateActionEntitlementId: entitlement.id, taxPolicyVersionId: policy.id, revision: (latest?.revision ?? 0) + 1, taxableAmount: gross, ratePct: policy.ratePct, taxAmount: tax, status: "estimate", supersedesId: latest?.id ?? null, calculationSnapshot: { policyVersion: policy.version, legalReference: policy.legalReference, retrospective: policy.retrospectiveFrom !== null } } });
      if (!["paid", "declined", "awaiting_reinvestment"].includes(entitlement.status)) {
        const withholding = policy.withholdingRequired ? tax : ZERO;
        await tx.corporateActionEntitlement.update({ where: { id: entitlement.id }, data: { withholdingAmount: withholding, netCash: money(gross.minus(withholding)), withholdingStatus: policy.withholdingRequired ? "calculated" : "report_only" } });
      }
      calculations += 1;
    }
  }
  return calculations;
}

export async function createTaxPolicy(actor: Actor, payload: Record<string, unknown>) {
  const appliesTo = String(payload.appliesTo ?? "");
  if (!POLICY_TYPES.has(appliesTo)) throw new Response("Choose capital gain, dividend, interest, or redemption.", { status: 400 });
  const ratePct = D(String(payload.ratePct ?? ""));
  if (!ratePct.isFinite() || ratePct.lt(0) || ratePct.gt(100)) throw new Response("Tax rate must be between 0% and 100%.", { status: 400 });
  const legalReference = String(payload.legalReference ?? "").trim();
  const evidenceReference = String(payload.evidenceReference ?? "").trim();
  if (legalReference.length < 3 || evidenceReference.length < 3) throw new Response("Legal and source-evidence references are required, including for a 0% policy.", { status: 400 });
  const effectiveFrom = calendarDate(payload.effectiveFrom, "Effective-from date")!;
  const effectiveTo = calendarDate(payload.effectiveTo, "Effective-to date", false);
  const retrospectiveFrom = calendarDate(payload.retrospectiveFrom, "Retrospective-from date", false);
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) throw new Response("Effective-to cannot precede effective-from.", { status: 400 });
  if (retrospectiveFrom && retrospectiveFrom.getTime() > effectiveFrom.getTime()) throw new Response("Retrospective-from cannot be after effective-from.", { status: 400 });
  const version = String(payload.version ?? "").trim();
  if (!version) throw new Response("A policy version is required.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const policy = await tx.taxPolicyVersion.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, name: String(payload.name ?? `${appliesTo.replaceAll("_", " ")} policy`).trim(), version, appliesTo, assetClass: String(payload.assetClass ?? "").trim() || null, ratePct, calculationBasis: appliesTo === "capital_gain" ? "gain" : "gross", withholdingRequired: payload.withholdingRequired === true, status: "draft", effectiveFrom, effectiveTo, retrospectiveFrom, legalReference, sourceEvidence: { evidenceReference, recordedAt: new Date().toISOString() }, createdBy: actor.id } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "TAX_POLICY_DRAFTED", entityType: "tax_policy", entityId: policy.id, summary: `${policy.name} ${version} drafted at ${ratePct.toString()}%`, newValue: { appliesTo, assetClass: policy.assetClass, effectiveFrom, effectiveTo, retrospectiveFrom, legalReference, evidenceReference } });
    return policy;
  }, txOptions);
}

export async function publishTaxPolicy(actor: Actor, policyId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tax_policy_versions" WHERE "id" = ${policyId} FOR UPDATE`);
    const policy = await tx.taxPolicyVersion.findFirst({ where: { id: policyId, brokerId: actor.brokerId } });
    if (!policy) throw new Response("Tax policy not found.", { status: 404 });
    if (policy.status !== "draft") throw new Response("Only a draft policy can be published.", { status: 409 });
    if (policy.createdBy === actor.id) throw new Response("Four-eyes control: the policy author cannot publish it.", { status: 409 });
    await tx.taxPolicyVersion.update({ where: { id: policy.id }, data: { status: "published", approvedBy: actor.id, approvedAt: new Date() } });
    const calculations = await recalculatePolicy(tx, policy);
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "TAX_POLICY_PUBLISHED", entityType: "tax_policy", entityId: policy.id, summary: `${policy.name} ${policy.version} published; ${calculations} estimate revision(s) appended`, newValue: { ratePct: policy.ratePct, effectiveFrom: policy.effectiveFrom, retrospectiveFrom: policy.retrospectiveFrom, calculations } });
    return { policyId, calculations };
  }, txOptions);
}

export async function documentTaxLotBasis(actor: Actor, lotId: string, payload: Record<string, unknown>) {
  const totalBasis = D(String(payload.costBasis ?? ""));
  if (!totalBasis.isFinite() || totalBasis.lt(0)) throw new Response("Documented cost basis must be zero or greater.", { status: 400 });
  const evidenceReference = String(payload.evidenceReference ?? "").trim();
  if (evidenceReference.length < 3) throw new Response("Cost-basis evidence is required.", { status: 400 });
  const acquisitionDate = calendarDate(payload.acquisitionDate, "Acquisition date", false);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "tax_lots" WHERE "id" = ${lotId} FOR UPDATE`);
    const lot = await tx.taxLot.findFirst({ where: { id: lotId, account: { client: { brokerId: actor.brokerId } } }, include: { dispositions: { include: { saleTrade: { include: { order: { include: { account: { include: { client: true } }, instrument: true } } } }, corporateActionEntitlement: { include: { corporateAction: { include: { instrument: true } } } } } } } });
    if (!lot) throw new Response("Tax lot not found.", { status: 404 });
    const unitCost = totalBasis.div(lot.originalQuantity);
    await tx.taxLot.update({ where: { id: lot.id }, data: { costBasis: totalBasis, unitCost, basisStatus: "known", basisSource: String(payload.basisSource ?? "documentary_evidence"), evidenceReference, acquisitionDate: acquisitionDate ?? lot.acquisitionDate, verifiedBy: actor.id, verifiedAt: new Date(), notes: String(payload.notes ?? "").trim() || lot.notes, version: { increment: 1 } } });
    let recalculated = 0;
    for (const allocation of lot.dispositions) {
      const costBasis = money(unitCost.times(allocation.quantity));
      const realizedGain = money(allocation.netProceeds.minus(costBasis));
      await tx.realizedGainAllocation.update({ where: { id: allocation.id }, data: { costBasis, realizedGain, basisStatus: "known", status: "provisional", calculationSnapshot: { method: "fifo", basisEvidence: evidenceReference, lotVersion: lot.version + 1 } } });
      if (await appendRealizedTax(tx, { ...allocation, realizedGain })) recalculated += 1;
    }
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "TAX_LOT_BASIS_DOCUMENTED", entityType: "tax_lot", entityId: lot.id, summary: `Cost basis evidence recorded; ${recalculated} tax estimate(s) revised`, previousValue: { costBasis: lot.costBasis, basisStatus: lot.basisStatus, evidenceReference: lot.evidenceReference }, newValue: { costBasis: totalBasis, evidenceReference, acquisitionDate, recalculated } });
    return { lotId, recalculated };
  }, txOptions);
}

export async function getTaxReporting(actor: Actor) {
  const [policies, lots, allocations, income] = await Promise.all([
    prisma.taxPolicyVersion.findMany({ where: { brokerId: actor.brokerId }, orderBy: [{ appliesTo: "asc" }, { effectiveFrom: "desc" }] }),
    prisma.taxLot.findMany({ where: { account: { client: { brokerId: actor.brokerId } } }, include: { account: { include: { client: true } }, instrument: true }, orderBy: [{ basisStatus: "desc" }, { createdAt: "desc" }], take: 500 }),
    prisma.realizedGainAllocation.findMany({ where: { OR: [{ saleTrade: { order: { account: { client: { brokerId: actor.brokerId } } } } }, { corporateActionEntitlement: { corporateAction: { brokerId: actor.brokerId } } }] }, include: { taxLot: true, saleTrade: { include: { order: { include: { account: { include: { client: true } }, instrument: true } } } }, corporateActionEntitlement: { include: { account: { include: { client: true } }, corporateAction: { include: { instrument: true } } } }, taxCalculations: { orderBy: [{ calculatedAt: "desc" }, { revision: "desc" }] } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.corporateActionEntitlement.findMany({ where: { corporateAction: { brokerId: actor.brokerId } }, include: { corporateAction: { include: { instrument: true } }, account: { include: { client: true } }, taxCalculations: { orderBy: [{ calculatedAt: "desc" }, { revision: "desc" }] } }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const known = allocations.filter((item) => item.realizedGain !== null);
  const latestTax = [...allocations.flatMap((item) => item.taxCalculations.slice(0, 1)), ...income.flatMap((item) => item.taxCalculations.slice(0, 1))];
  return {
    summary: { openLots: lots.filter((item) => item.remainingQuantity.gt(0)).length, unknownBasisLots: lots.filter((item) => item.basisStatus === "unknown").length, realizedGain: toNum(known.reduce((sum, item) => sum.plus(item.realizedGain!), ZERO)), dispositionsNeedingBasis: allocations.filter((item) => item.realizedGain === null).length, estimatedTax: toNum(latestTax.reduce((sum, item) => sum.plus(item.taxAmount), ZERO)), policyCoverage: { capitalGain: policies.some((item) => item.appliesTo === "capital_gain" && item.status === "published"), dividend: policies.some((item) => item.appliesTo === "dividend" && item.status === "published"), interest: policies.some((item) => item.appliesTo === "interest" && item.status === "published"), redemption: policies.some((item) => item.appliesTo === "redemption" && item.status === "published") } },
    policies: policies.map((item) => ({ ...item, ratePct: toNum(item.ratePct), effectiveFrom: item.effectiveFrom.toISOString().slice(0, 10), effectiveTo: item.effectiveTo?.toISOString().slice(0, 10) ?? null, retrospectiveFrom: item.retrospectiveFrom?.toISOString().slice(0, 10) ?? null })),
    lots: lots.map((item) => ({ id: item.id, accountId: item.accountId, clientCode: item.account.client.clientCode, clientName: item.account.client.fullName, instrument: item.instrument.symbol, acquisitionDate: item.acquisitionDate?.toISOString().slice(0, 10) ?? null, originalQuantity: toNum(item.originalQuantity), remainingQuantity: toNum(item.remainingQuantity), costBasis: item.costBasis === null ? null : toNum(item.costBasis), unitCost: item.unitCost === null ? null : toNum(item.unitCost), basisStatus: item.basisStatus, basisSource: item.basisSource, evidenceReference: item.evidenceReference, version: item.version })),
    realizations: allocations.map((item) => { const source = item.saleTrade ? { reference: item.saleTradeId!, date: item.saleTrade.tradeDate, accountId: item.saleTrade.order.accountId, client: item.saleTrade.order.account.client, instrument: item.saleTrade.order.instrument, dispositionType: "sale" } : { reference: item.corporateActionEntitlement!.corporateActionId, date: item.corporateActionEntitlement!.corporateAction.paymentDate, accountId: item.corporateActionEntitlement!.accountId, client: item.corporateActionEntitlement!.account.client, instrument: item.corporateActionEntitlement!.corporateAction.instrument, dispositionType: "redemption" }; return { id: item.id, tradeId: source.reference, tradeDate: source.date.toISOString().slice(0, 10), accountId: source.accountId, clientCode: source.client.clientCode, clientName: source.client.fullName, instrument: source.instrument.symbol, dispositionType: source.dispositionType, quantity: toNum(item.quantity), netProceeds: toNum(item.netProceeds), costBasis: item.costBasis === null ? null : toNum(item.costBasis), realizedGain: item.realizedGain === null ? null : toNum(item.realizedGain), basisStatus: item.basisStatus, status: item.status, latestTax: item.taxCalculations[0] ? { amount: toNum(item.taxCalculations[0].taxAmount), ratePct: toNum(item.taxCalculations[0].ratePct), status: item.taxCalculations[0].status, revision: item.taxCalculations[0].revision } : null }; }),
    income: income.map((item) => ({ id: item.id, actionId: item.corporateActionId, paymentDate: item.corporateAction.paymentDate.toISOString().slice(0, 10), clientCode: item.account.client.clientCode, clientName: item.account.client.fullName, instrument: item.corporateAction.instrument.symbol, type: item.corporateAction.actionType, grossCash: item.grossCash === null ? null : toNum(item.grossCash), withholdingAmount: item.withholdingAmount === null ? null : toNum(item.withholdingAmount), netCash: item.netCash === null ? null : toNum(item.netCash), withholdingStatus: item.withholdingStatus, latestTax: item.taxCalculations[0] ? { amount: toNum(item.taxCalculations[0].taxAmount), ratePct: toNum(item.taxCalculations[0].ratePct), status: item.taxCalculations[0].status, revision: item.taxCalculations[0].revision } : null })),
  };
}
