import { Prisma } from "../app/generated/prisma/client";
import { addisDateOnly } from "./addis-date";
import { lockPool, lockPosition, persistClientMoneyMutation } from "./client-money-service";
import { D, money, toNum, ZERO } from "./money";
import { writeAudit } from "./oms/audit-service";
import { creditCorporateActionCash, creditCorporateActionSecurities, debitRedeemedSecurities } from "./oms/ledger-service";
import { writeNotification } from "./oms/notification-service";
import { lockAccount, lockHolding, persistCashMutation, persistSecuritiesMutation } from "./oms/persistence";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";
import { recordCorporateActionRealization } from "./tax-lot-service";
import { platformTaxSnapshot, resolveActivePlatformTaxRule, taxAmount } from "./platform-tax-service";
import { corporateActionCashReceived } from "./gl/journal-rules";
import { postJournalEntry } from "./gl/posting-service";

const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const CASH_ACTIONS = new Set(["cash_dividend", "coupon", "maturity", "redemption"]);
// Splits and rights need open-order adjustment and, for rights, a separate
// distribution instrument. Do not route them through stock-dividend posting.
const SECURITY_ACTIONS = new Set(["stock_dividend"]);
const ACTION_TYPES = new Set([...CASH_ACTIONS, ...SECURITY_ACTIONS]);
const COUPON_FREQUENCIES: Record<string, { paymentsPerYear: number; months: number }> = {
  annual: { paymentsPerYear: 1, months: 12 },
  semi_annual: { paymentsPerYear: 2, months: 6 },
  quarterly: { paymentsPerYear: 4, months: 3 },
};

const dateOnly = (value: unknown, label: string, required = true) => {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Response(`${label} must be a calendar date.`, { status: 400 });
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Response(`${label} is invalid.`, { status: 400 });
  return date;
};

function incomeType(actionType: string) {
  return actionType === "cash_dividend" || actionType === "stock_dividend" ? "dividend" : actionType === "coupon" ? "interest" : "redemption";
}

function cashSnapshot(account: { totalCash: Prisma.Decimal; availableCash: Prisma.Decimal; blockedCash: Prisma.Decimal; unsettledCash: Prisma.Decimal }) {
  return { total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash };
}

function securitySnapshot(holding: { totalQuantity: Prisma.Decimal; availableQuantity: Prisma.Decimal; blockedQuantity: Prisma.Decimal; unsettledQuantity: Prisma.Decimal }) {
  return { total: holding.totalQuantity, available: holding.availableQuantity, blocked: holding.blockedQuantity, unsettled: holding.unsettledQuantity };
}

async function calculatedValues(tx: Prisma.TransactionClient, action: { brokerId: string; actionType: string; instrument: { assetClass: string }; paymentDate: Date; cashRatePerUnit: Prisma.Decimal | null; securityRatioNumerator: Prisma.Decimal | null; securityRatioDenominator: Prisma.Decimal | null; taxTreatment: string }, quantity: Prisma.Decimal) {
  const gross = action.cashRatePerUnit === null ? null : money(quantity.times(action.cashRatePerUnit));
  const securities = action.securityRatioNumerator && action.securityRatioDenominator
    ? quantity.times(action.securityRatioNumerator).div(action.securityRatioDenominator).floor()
    : null;
  if (gross === null) return { gross, withholding: null, net: null, withholdingStatus: "not_applicable", withholdingAgent: null, taxLiabilityParty: null, securities, policy: null };
  // Maturity and redemption cash is principal. Any taxable gain is calculated
  // separately from tax lots; it is never treated as gross interest income.
  if (["maturity", "redemption"].includes(action.actionType)) return { gross, withholding: ZERO, net: gross, withholdingStatus: "principal_not_withheld", withholdingAgent: null, taxLiabilityParty: "investor", securities, policy: null };
  if (action.taxTreatment === "no_withholding_confirmed") return { gross, withholding: ZERO, net: gross, withholdingStatus: "issuer_confirmed_zero", withholdingAgent: "issuer", taxLiabilityParty: "investor", securities, policy: null };
  const policy = await resolveActivePlatformTaxRule(tx, incomeType(action.actionType), action.instrument.assetClass, action.paymentDate);
  if (!policy) return { gross, withholding: null, net: null, withholdingStatus: "unconfigured", withholdingAgent: null, taxLiabilityParty: "investor", securities, policy: null };
  if (policy.collectionMethod !== "issuer_withheld") throw new Response("The active platform income-tax rule must identify the issuer as withholding agent.", { status: 409 });
  const tax = taxAmount(gross, policy.ratePct);
  return { gross, withholding: tax, net: money(gross.minus(tax)), withholdingStatus: "issuer_withheld_expected", withholdingAgent: "issuer", taxLiabilityParty: "investor", securities, policy: { ...policy, tax } };
}

async function appendEntitlementTax(tx: Prisma.TransactionClient, entitlementId: string, values: Awaited<ReturnType<typeof calculatedValues>>) {
  if (!values.policy || values.gross === null) return;
  const latest = await tx.taxCalculation.findFirst({ where: { corporateActionEntitlementId: entitlementId, platformTaxRuleId: values.policy.id }, orderBy: { revision: "desc" } });
  await tx.taxCalculation.create({ data: { id: crypto.randomUUID(), corporateActionEntitlementId: entitlementId, platformTaxRuleId: values.policy.id, revision: (latest?.revision ?? 0) + 1, taxableAmount: values.gross, ratePct: values.policy.ratePct, taxAmount: values.policy.tax, status: "expected_issuer_withholding", supersedesId: latest?.id ?? null, calculationSnapshot: platformTaxSnapshot(values.policy, { withholdingAgent: "issuer", grossIncome: values.gross.toString() }) } });
}

export async function createCorporateAction(actor: Actor, payload: Record<string, unknown>) {
  const actionType = String(payload.actionType ?? "");
  if (!ACTION_TYPES.has(actionType)) throw new Response("Choose a supported corporate-action type.", { status: 400 });
  const recordDate = dateOnly(payload.recordDate, "Record date")!;
  const paymentDate = dateOnly(payload.paymentDate, "Payment date")!;
  const exDate = dateOnly(payload.exDate, "Ex-date", false);
  const announcementDate = dateOnly(payload.announcementDate, "Announcement date", false);
  const electionDeadline = dateOnly(payload.electionDeadline, "Election deadline", false);
  if (exDate && exDate.getTime() > recordDate.getTime()) throw new Response("Ex-date cannot be after the record date.", { status: 400 });
  if (paymentDate.getTime() < recordDate.getTime()) throw new Response("Payment date cannot be before the record date.", { status: 400 });
  if (electionDeadline && electionDeadline.getTime() > paymentDate.getTime()) throw new Response("Election deadline cannot be after payment date.", { status: 400 });
  const cashRate = payload.cashRatePerUnit === null || payload.cashRatePerUnit === undefined || payload.cashRatePerUnit === "" ? null : D(String(payload.cashRatePerUnit));
  const numerator = payload.securityRatioNumerator === null || payload.securityRatioNumerator === undefined || payload.securityRatioNumerator === "" ? null : D(String(payload.securityRatioNumerator));
  const denominator = payload.securityRatioDenominator === null || payload.securityRatioDenominator === undefined || payload.securityRatioDenominator === "" ? null : D(String(payload.securityRatioDenominator));
  if (CASH_ACTIONS.has(actionType) && (!cashRate || cashRate.lte(0))) throw new Response("Cash actions require a positive cash amount per eligible unit.", { status: 400 });
  if (SECURITY_ACTIONS.has(actionType) && (!numerator || !denominator || numerator.lte(0) || denominator.lte(0))) throw new Response("Security actions require a positive entitlement ratio.", { status: 400 });
  const sourceReference = String(payload.sourceReference ?? "").trim();
  if (sourceReference.length < 3) throw new Response("Source announcement or schedule reference is required.", { status: 400 });
  const instrument = await prisma.brokerInstrument.findUnique({ where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId: String(payload.instrumentId ?? "") } }, include: { instrument: true } });
  if (!instrument) throw new Response("Instrument is not enabled for this tenant.", { status: 404 });
  const taxTreatment = payload.taxTreatment === "no_withholding_confirmed" ? "no_withholding_confirmed" : "policy";
  if (taxTreatment === "no_withholding_confirmed" && !String(payload.taxEvidence ?? "").trim()) throw new Response("Evidence is required to confirm zero withholding.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const id = `CA-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
    const action = await tx.corporateAction.create({ data: { id, brokerId: actor.brokerId, instrumentId: instrument.instrumentId, actionType, status: "announced", announcementDate, exDate, recordDate, electionDeadline, paymentDate, currency: String(payload.currency ?? instrument.instrument.currency), cashRatePerUnit: cashRate, securityRatioNumerator: numerator, securityRatioDenominator: denominator, defaultElection: CASH_ACTIONS.has(actionType) ? "cash" : "securities", supportsReinvestment: payload.supportsReinvestment === true, taxTreatment, sourceReference, sourceEvidence: { announcement: sourceReference, taxEvidence: String(payload.taxEvidence ?? "") }, termsSnapshot: { instrument: instrument.instrument.symbol, faceValue: instrument.instrument.faceValue?.toString() ?? null, couponRate: instrument.instrument.couponRate?.toString() ?? null, couponFrequency: instrument.instrument.couponFrequency }, createdBy: actor.id } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_RECORDED", entityType: "corporate_action", entityId: id, summary: `${actionType} recorded for ${instrument.instrument.symbol}`, newValue: { recordDate, paymentDate, sourceReference, taxTreatment } });
    return action;
  }, txOptions);
}

function shiftUtcDays(value: Date, days: number) {
  const shifted = new Date(value);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function shiftUtcMonths(value: Date, months: number) {
  const day = value.getUTCDate();
  const shifted = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

/**
 * Creates future coupon and principal events from an explicitly supplied issuer
 * schedule reference. The record-date offset is also explicit: the service does
 * not guess exchange holidays, cutoff dates, or stub-period interest.
 */
export async function generateFixedIncomeSchedule(actor: Actor, payload: Record<string, unknown>) {
  const instrumentId = String(payload.instrumentId ?? "");
  const firstPaymentDate = dateOnly(payload.firstPaymentDate, "First payment date")!;
  const sourceReference = String(payload.sourceReference ?? "").trim();
  const recordDateDaysBefore = Number(payload.recordDateDaysBefore);
  if (sourceReference.length < 3) throw new Response("Issuer or offering-document schedule evidence is required.", { status: 400 });
  if (!Number.isInteger(recordDateDaysBefore) || recordDateDaysBefore < 0 || recordDateDaysBefore > 365) throw new Response("Record-date offset must be an explicit whole number from 0 to 365 days.", { status: 400 });
  const enabled = await prisma.brokerInstrument.findUnique({ where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId } }, include: { instrument: true } });
  const instrument = enabled?.instrument;
  if (!instrument || instrument.assetClass !== "bond" || !instrument.faceValue || instrument.couponRate === null || !instrument.maturityDate || !instrument.couponFrequency) throw new Response("The enabled bond must have face value, coupon rate, frequency, and maturity configured.", { status: 409 });
  const frequency = COUPON_FREQUENCIES[instrument.couponFrequency];
  if (!frequency) throw new Response("The bond coupon frequency is not supported.", { status: 409 });
  const faceValue = instrument.faceValue;
  const couponRate = instrument.couponRate;
  const maturityDate = instrument.maturityDate;
  const couponFrequency = instrument.couponFrequency;
  if (firstPaymentDate.getTime() > maturityDate.getTime()) throw new Response("First payment date cannot be after maturity.", { status: 400 });
  const dates: Date[] = [];
  for (let date = firstPaymentDate; date.getTime() <= maturityDate.getTime(); date = shiftUtcMonths(date, frequency.months)) {
    dates.push(date);
    if (dates.length > 500) throw new Response("The generated schedule is unexpectedly long.", { status: 400 });
  }
  const couponPerUnit = money(faceValue.times(couponRate).div(100).div(frequency.paymentsPerYear));
  return prisma.$transaction(async (tx) => {
    const existing = await tx.corporateAction.findMany({ where: { brokerId: actor.brokerId, sourceReference: { startsWith: `${sourceReference}:` } }, select: { sourceReference: true } });
    const existingRefs = new Set(existing.map((item) => item.sourceReference));
    const created: string[] = [];
    for (const paymentDate of dates) {
      const dateKey = paymentDate.toISOString().slice(0, 10);
      const reference = `${sourceReference}:coupon:${dateKey}`;
      if (existingRefs.has(reference)) continue;
      const id = `CA-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
      await tx.corporateAction.create({ data: { id, brokerId: actor.brokerId, instrumentId, actionType: "coupon", status: "announced", recordDate: shiftUtcDays(paymentDate, -recordDateDaysBefore), paymentDate, currency: instrument.currency, cashRatePerUnit: couponPerUnit, defaultElection: "cash", taxTreatment: "policy", sourceReference: reference, sourceEvidence: { schedule: sourceReference, recordDateRule: `${recordDateDaysBefore} calendar day(s) before payment`, generatedAt: new Date().toISOString() }, termsSnapshot: { faceValue: faceValue.toString(), annualCouponRatePct: couponRate.toString(), frequency: couponFrequency, paymentDate: dateKey }, createdBy: actor.id } });
      created.push(id);
    }
    const maturityKey = maturityDate.toISOString().slice(0, 10);
    const maturityReference = `${sourceReference}:maturity:${maturityKey}`;
    if (!existingRefs.has(maturityReference)) {
      const id = `CA-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
      await tx.corporateAction.create({ data: { id, brokerId: actor.brokerId, instrumentId, actionType: "maturity", status: "announced", recordDate: shiftUtcDays(maturityDate, -recordDateDaysBefore), paymentDate: maturityDate, currency: instrument.currency, cashRatePerUnit: faceValue, defaultElection: "cash", taxTreatment: "policy", sourceReference: maturityReference, sourceEvidence: { schedule: sourceReference, recordDateRule: `${recordDateDaysBefore} calendar day(s) before payment`, generatedAt: new Date().toISOString() }, termsSnapshot: { faceValue: faceValue.toString(), maturityDate: maturityKey }, createdBy: actor.id } });
      created.push(id);
    }
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "FIXED_INCOME_SCHEDULE_RECORDED", entityType: "instrument", entityId: instrumentId, summary: `${created.length} servicing event(s) recorded for ${instrument.symbol}`, newValue: { firstPaymentDate, maturityDate, couponPerUnit, recordDateDaysBefore, sourceReference, actionIds: created } });
    return { created: created.length, actionIds: created };
  }, txOptions);
}

export async function calculateEntitlements(actor: Actor, actionId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "corporate_actions" WHERE "id" = ${actionId} FOR UPDATE`);
    const action = await tx.corporateAction.findFirst({ where: { id: actionId, brokerId: actor.brokerId }, include: { instrument: true, entitlements: true } });
    if (!action) throw new Response("Corporate action not found.", { status: 404 });
    if (!["announced", "entitlements_calculated"].includes(action.status)) throw new Response("Only an announced action can calculate entitlements.", { status: 409 });
    if (action.entitlements.some((item) => item.externalQuantity !== null || item.reconciliationStatus !== "unverified")) throw new Response("A reconciled position file already exists. Record a correcting action instead of replacing the evidence.", { status: 409 });
    const [holdings, ledgerPositions] = await Promise.all([
      tx.holding.findMany({ where: { instrumentId: action.instrumentId, account: { client: { brokerId: actor.brokerId } }, totalQuantity: { gt: 0 } }, include: { account: true } }),
      tx.securitiesLedgerEntry.groupBy({ by: ["accountId"], where: { instrumentId: action.instrumentId, valueDate: { lte: action.recordDate }, account: { client: { brokerId: actor.brokerId } } }, _sum: { totalImpact: true }, _count: true }),
    ]);
    await tx.corporateActionEntitlement.deleteMany({ where: { corporateActionId: action.id } });
    let calculated = 0;
    const currentByAccount = new Map(holdings.map((holding) => [holding.accountId, holding]));
    const quantityByAccount = new Map(ledgerPositions.map((position) => [position.accountId, { quantity: position._sum.totalImpact ?? ZERO, hasLedger: position._count > 0 }]));
    for (const holding of holdings) if (!quantityByAccount.has(holding.accountId)) quantityByAccount.set(holding.accountId, { quantity: holding.totalQuantity, hasLedger: false });
    for (const [accountId, position] of quantityByAccount) {
      const hasLedger = position.hasLedger;
      const quantity = position.quantity;
      if (quantity.lte(0)) continue;
      const values = await calculatedValues(tx, action, quantity);
      const id = crypto.randomUUID();
      await tx.corporateActionEntitlement.create({ data: { id, corporateActionId: action.id, accountId, ledgerQuantity: quantity, eligibleQuantity: quantity, positionSource: hasLedger ? "internal_ledger_as_of_record_date" : "current_holding_fallback", reconciliationStatus: "unverified", grossCash: values.gross, withholdingAmount: values.withholding, netCash: values.net, withholdingStatus: values.withholdingStatus, withholdingAgent: values.withholdingAgent, taxLiabilityParty: values.taxLiabilityParty, securityQuantity: values.securities, election: action.defaultElection, status: action.recordDate.getTime() > addisDateOnly().getTime() ? "projected" : "calculated", calculationSnapshot: { recordDate: action.recordDate.toISOString().slice(0, 10), quantitySource: hasLedger ? "ledger" : "fallback", platformTaxRuleId: values.policy?.id ?? null, currentHoldingPresent: currentByAccount.has(accountId) } } });
      await appendEntitlementTax(tx, id, values);
      calculated += 1;
    }
    await tx.corporateAction.update({ where: { id: action.id }, data: { status: "entitlements_calculated", version: { increment: 1 } } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_ENTITLEMENTS_CALCULATED", entityType: "corporate_action", entityId: action.id, summary: `${calculated} internal positions snapshotted for ${action.instrument.symbol}`, newValue: { recordDate: action.recordDate, requiresCsdReconciliation: true } });
    return { calculated };
  }, txOptions);
}

export async function reconcileEntitlements(actor: Actor, actionId: string, positions: Array<{ accountId: string; quantity: number | string }>, evidenceReference: string) {
  if (evidenceReference.trim().length < 3) throw new Response("CSD or issuer position-file evidence is required.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "corporate_actions" WHERE "id" = ${actionId} FOR UPDATE`);
    const action = await tx.corporateAction.findFirst({ where: { id: actionId, brokerId: actor.brokerId }, include: { instrument: true, entitlements: true } });
    if (!action || action.status !== "entitlements_calculated") throw new Response("Calculate entitlements before reconciling the record-date file.", { status: 409 });
    const supplied = new Map(positions.map((position) => [position.accountId, D(position.quantity)]));
    const internalAccounts = new Set(action.entitlements.map((item) => item.accountId));
    const unexplained = [...supplied.keys()].filter((accountId) => !internalAccounts.has(accountId));
    if (unexplained.length) throw new Response(`The external position file contains ${unexplained.length} account(s) absent from the internal snapshot. Reconcile those holdings before processing the action.`, { status: 409 });
    if (action.entitlements.some((item) => !supplied.has(item.accountId))) throw new Response("The external position file must include every internally eligible account, including explicit zero quantities.", { status: 400 });
    let breaks = 0;
    for (const entitlement of action.entitlements) {
      const external = supplied.get(entitlement.accountId)!;
      if (external.lt(0)) throw new Response("External quantities cannot be negative.", { status: 400 });
      const matched = external.eq(entitlement.ledgerQuantity);
      if (!matched) breaks += 1;
      const values = await calculatedValues(tx, action, external);
      await tx.corporateActionEntitlement.update({ where: { id: entitlement.id }, data: { externalQuantity: external, eligibleQuantity: external, reconciliationStatus: matched ? "matched" : "break", grossCash: values.gross, withholdingAmount: values.withholding, netCash: values.net, withholdingStatus: values.withholdingStatus, withholdingAgent: values.withholdingAgent, taxLiabilityParty: values.taxLiabilityParty, securityQuantity: values.securities, status: matched ? "reconciled" : "exception", exceptionReason: matched ? null : `Internal ${entitlement.ledgerQuantity.toString()} vs external ${external.toString()}`, calculationSnapshot: { evidenceReference, ledgerQuantity: entitlement.ledgerQuantity.toString(), externalQuantity: external.toString(), platformTaxRuleId: values.policy?.id ?? null } } });
      await appendEntitlementTax(tx, entitlement.id, values);
    }
    await tx.corporateAction.update({ where: { id: action.id }, data: { status: breaks ? "entitlements_calculated" : "reconciled", sourceEvidence: { ...(action.sourceEvidence as Record<string, unknown> ?? {}), positionEvidence: evidenceReference }, version: { increment: 1 } } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_POSITIONS_RECONCILED", entityType: "corporate_action", entityId: action.id, summary: `${action.instrument.symbol} record-date positions reconciled with ${breaks} break(s)`, newValue: { evidenceReference, breaks } });
    return { breaks };
  }, txOptions);
}

export async function approveCorporateAction(actor: Actor, actionId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "corporate_actions" WHERE "id" = ${actionId} FOR UPDATE`);
    const action = await tx.corporateAction.findFirst({ where: { id: actionId, brokerId: actor.brokerId }, include: { entitlements: true, instrument: true } });
    if (!action || action.status !== "reconciled") throw new Response("Reconcile every record-date position before approval.", { status: 409 });
    if (action.createdBy === actor.id) throw new Response("Four-eyes control: the recorder cannot approve the same corporate action.", { status: 409 });
    if (action.entitlements.some((item) => item.reconciliationStatus !== "matched" || (item.grossCash !== null && item.netCash === null))) throw new Response("Resolve position or tax-treatment exceptions before approval.", { status: 409 });
    await tx.corporateAction.update({ where: { id: action.id }, data: { status: "approved", approvedBy: actor.id, approvedAt: new Date(), version: { increment: 1 } } });
    await tx.corporateActionEntitlement.updateMany({ where: { corporateActionId: action.id }, data: { status: "approved" } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_APPROVED", entityType: "corporate_action", entityId: action.id, summary: `${action.instrument.symbol} corporate action independently approved`, previousValue: { status: "reconciled" }, newValue: { status: "approved" } });
    return { status: "approved" };
  }, txOptions);
}

export async function recordEntitlementElection(actor: Actor, actionId: string, entitlementId: string, election: string, evidence: string) {
  if (!["cash", "reinvest", "securities", "decline"].includes(election)) throw new Response("Unsupported election.", { status: 400 });
  if (evidence.trim().length < 3) throw new Response("Client election evidence is required.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const item = await tx.corporateActionEntitlement.findFirst({ where: { id: entitlementId, corporateActionId: actionId, corporateAction: { brokerId: actor.brokerId } }, include: { corporateAction: true } });
    if (!item) throw new Response("Entitlement not found.", { status: 404 });
    if (!item.corporateAction.supportsReinvestment && election === "reinvest") throw new Response("This action does not offer reinvestment.", { status: 409 });
    if (item.corporateAction.electionDeadline && addisDateOnly().getTime() > item.corporateAction.electionDeadline.getTime()) throw new Response("The election deadline has passed.", { status: 409 });
    await tx.corporateActionEntitlement.update({ where: { id: item.id }, data: { election, electionEvidence: evidence.trim(), electionRecordedAt: new Date() } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_ELECTION_RECORDED", entityType: "corporate_action_entitlement", entityId: item.id, summary: `${election} election recorded`, previousValue: { election: item.election }, newValue: { election, evidence } });
    return { election };
  }, txOptions);
}

export async function payCorporateAction(actor: Actor, actionId: string, input: { pooledBankAccountId?: string; paymentReference: string }) {
  if (input.paymentReference.trim().length < 3) throw new Response("Bank, issuer, or depository payment evidence is required.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "corporate_actions" WHERE "id" = ${actionId} FOR UPDATE`);
    const action = await tx.corporateAction.findFirst({ where: { id: actionId, brokerId: actor.brokerId }, include: { instrument: true, entitlements: { include: { account: true } } } });
    if (!action || action.status !== "approved") throw new Response("Only an approved corporate action can be paid.", { status: 409 });
    if (addisDateOnly().getTime() < action.paymentDate.getTime()) throw new Response("Corporate action cannot be paid before its payment date.", { status: 409 });
    const cashItems = action.entitlements.filter((item) => item.election === "cash" && item.netCash?.gt(0));
    const poolId = input.pooledBankAccountId;
    if (cashItems.length && !poolId) throw new Response("Select the pooled client-money account that received the payment.", { status: 400 });
    if (poolId) {
      const pool = await tx.pooledBankAccount.findFirst({ where: { id: poolId, brokerId: actor.brokerId, status: "active", currency: action.currency } });
      if (!pool) throw new Response("Active pooled account not found for this payment currency.", { status: 404 });
      await lockPool(tx, pool.id);
    }
    let paid = 0; let awaitingReinvestment = 0;
    for (const entitlement of action.entitlements.sort((a, b) => a.accountId.localeCompare(b.accountId))) {
      if (entitlement.status === "paid") continue;
      if (entitlement.election === "decline") {
        await tx.corporateActionEntitlement.update({ where: { id: entitlement.id }, data: { status: "declined", paymentReference: input.paymentReference } });
        continue;
      }
      if (entitlement.election === "reinvest") {
        awaitingReinvestment += 1;
        await tx.corporateActionEntitlement.update({ where: { id: entitlement.id }, data: { status: "awaiting_reinvestment", paymentReference: input.paymentReference } });
        continue;
      }
      await lockAccount(tx, entitlement.accountId);
      const account = await tx.account.findUniqueOrThrow({ where: { id: entitlement.accountId } });
      if (entitlement.netCash?.gt(0)) {
        await persistCashMutation(tx, { accountId: account.id, pooledBankAccountId: poolId, actorId: actor.id, valueDate: action.paymentDate, reason: `${action.actionType} ${action.id}`, mutation: creditCorporateActionCash(cashSnapshot(account), entitlement.netCash, `${action.actionType.replaceAll("_", " ")} credited`) });
        let position = await tx.clientMoneyPosition.findUnique({ where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: poolId! } } });
        if (!position) position = await tx.clientMoneyPosition.create({ data: { id: crypto.randomUUID(), accountId: account.id, pooledBankAccountId: poolId! } });
        await lockPosition(tx, position.id);
        const [lockedPosition, lockedPool] = await Promise.all([tx.clientMoneyPosition.findUniqueOrThrow({ where: { id: position.id } }), tx.pooledBankAccount.findUniqueOrThrow({ where: { id: poolId! } })]);
        await persistClientMoneyMutation(tx, { position: lockedPosition, pool: lockedPool, accountId: account.id, entryType: "corporate_action_credit", impact: entitlement.netCash, statementImpact: entitlement.netCash, markReconciled: true, actorId: actor.id, bankReference: input.paymentReference, notes: `${action.id} ${action.actionType} entitlement` });
        await postJournalEntry(tx, { brokerId: actor.brokerId, actorId: actor.id, accountId: account.id, draft: corporateActionCashReceived({ entitlementId: entitlement.id, accountId: account.id, pooledBankAccountId: poolId!, amount: entitlement.netCash, valueDate: action.paymentDate, description: `${action.instrument.symbol} ${action.actionType.replaceAll("_", " ")} credited` }) });
      }
      if (entitlement.securityQuantity?.gt(0)) {
        await tx.holding.upsert({ where: { accountId_instrumentId: { accountId: account.id, instrumentId: action.instrumentId } }, update: {}, create: { id: crypto.randomUUID(), accountId: account.id, instrumentId: action.instrumentId } });
        await lockHolding(tx, account.id, action.instrumentId);
        const holding = await tx.holding.findUniqueOrThrow({ where: { accountId_instrumentId: { accountId: account.id, instrumentId: action.instrumentId } } });
        await persistSecuritiesMutation(tx, { holdingId: holding.id, accountId: account.id, instrumentId: action.instrumentId, actorId: actor.id, valueDate: action.paymentDate, reason: `${action.actionType} ${action.id}`, mutation: creditCorporateActionSecurities(securitySnapshot(holding), entitlement.securityQuantity, `${action.actionType.replaceAll("_", " ")} securities credited`) });
        await tx.taxLot.create({ data: { id: `lot_${entitlement.id}`, accountId: account.id, instrumentId: action.instrumentId, acquisitionDate: action.paymentDate, originalQuantity: entitlement.securityQuantity, remainingQuantity: entitlement.securityQuantity, basisStatus: "unknown", basisSource: "corporate_action", sourceReference: entitlement.id, notes: "Basis intentionally left unknown until the applicable allocation guidance and source evidence are recorded." } });
      }
      if (["maturity", "redemption"].includes(action.actionType) && entitlement.eligibleQuantity.gt(0)) {
        await recordCorporateActionRealization(tx, { brokerId: actor.brokerId, accountId: account.id, instrumentId: action.instrumentId, assetClass: action.instrument.assetClass, entitlementId: entitlement.id, paymentDate: action.paymentDate, quantity: entitlement.eligibleQuantity, gross: entitlement.grossCash! });
        await lockHolding(tx, account.id, action.instrumentId);
        const holding = await tx.holding.findUniqueOrThrow({ where: { accountId_instrumentId: { accountId: account.id, instrumentId: action.instrumentId } } });
        await persistSecuritiesMutation(tx, { holdingId: holding.id, accountId: account.id, instrumentId: action.instrumentId, actorId: actor.id, valueDate: action.paymentDate, reason: `${action.actionType} ${action.id}`, mutation: debitRedeemedSecurities(securitySnapshot(holding), entitlement.eligibleQuantity, `${action.actionType} principal redeemed`) });
      }
      await tx.corporateActionEntitlement.update({ where: { id: entitlement.id }, data: { status: "paid", paidAt: new Date(), paymentReference: input.paymentReference, withholdingEvidence: entitlement.withholdingAmount?.gt(0) ? input.paymentReference : null, withholdingStatus: entitlement.withholdingAmount?.gt(0) ? "issuer_withheld_confirmed" : entitlement.withholdingStatus } });
      await writeNotification(tx, { scope: "investor", brokerId: actor.brokerId, clientId: account.clientId, category: "account", severity: "success", title: `${action.instrument.symbol} ${action.actionType.replaceAll("_", " ")}`, body: entitlement.netCash ? `${toNum(entitlement.netCash)} ${action.currency} was credited to your account.` : "Your securities entitlement was credited.", entityType: "corporate_action", entityId: action.id, dedupeKey: `corporate-action:${entitlement.id}:paid` });
      paid += 1;
    }
    await tx.corporateAction.update({ where: { id: action.id }, data: { status: awaitingReinvestment ? "partially_paid" : "paid", version: { increment: 1 } } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CORPORATE_ACTION_PAID", entityType: "corporate_action", entityId: action.id, summary: `${action.instrument.symbol} action processed for ${paid} account(s); ${awaitingReinvestment} reinvestment election(s) remain`, newValue: { paymentReference: input.paymentReference, paid, awaitingReinvestment } });
    return { paid, awaitingReinvestment };
  }, txOptions);
}
