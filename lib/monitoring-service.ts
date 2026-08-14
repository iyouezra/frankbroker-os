import { Prisma } from "../app/generated/prisma/client";
import { clientIdentityReference } from "./client-identity";
import {
  MONITORING_RULES,
  addisBusinessDate,
  appliesHighRiskMultiplier,
  historicalDeviation,
  fragmentationTriggered,
  validDepositFundingSource,
  closedLoopWithdrawalRisk,
  personalClearanceCovers,
  cancellationPatternTriggered,
  isAttestationOverdue,
  isImmediateEmployeeConductRule,
  isMonitoringEnabled,
  normalizeVerifiedPhone,
  raiseSeverity,
  requiresEmployeePreclearance,
  type MonitoringRuleCode,
  type MonitoringSeverity,
} from "./monitoring";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";

type Db = Prisma.TransactionClient | typeof prisma;

function fail(message: string, status = 409): never {
  throw new Response(message, { status });
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function writeMonitoringAudit(db: Db, input: { brokerId: string; actorUserId?: string | null; action: string; entityType: string; entityId: string; summary: string; restrictedData?: Record<string, unknown> }) {
  return db.monitoringAuditEvent.create({ data: {
    id: crypto.randomUUID(), brokerId: input.brokerId, actorUserId: input.actorUserId ?? null,
    action: input.action, entityType: input.entityType, entityId: input.entityId,
    summary: input.summary, restrictedData: input.restrictedData ? input.restrictedData as Prisma.InputJsonValue : undefined,
  } });
}

export async function monitoringEnabled(db: Db, brokerId: string) {
  const settings = await db.brokerSettings.findUnique({ where: { brokerId }, select: { features: true } });
  return isMonitoringEnabled(settings?.features);
}

export async function resolveRule(db: Db, brokerId: string, ruleCode: MonitoringRuleCode) {
  const stored = await db.monitoringRuleVersion.findFirst({
    where: { brokerId, ruleCode, enabled: true, effectiveFrom: { lte: new Date() }, effectiveTo: null },
    orderBy: { version: "desc" },
  });
  const fallback = MONITORING_RULES[ruleCode];
  const configuration: Record<string, unknown> = { ...fallback.configuration, ...jsonObject(stored?.configuration) };
  return {
    version: stored?.version ?? 1,
    enabled: stored?.enabled ?? true,
    configuration,
    category: fallback.category,
    title: fallback.title,
    severity: fallback.severity as MonitoringSeverity,
  };
}

export async function createMonitoringAlert(db: Db, input: {
  brokerId: string;
  ruleCode: MonitoringRuleCode;
  fingerprint: string;
  severity?: MonitoringSeverity;
  clientId?: string | null;
  cashMovementId?: string | null;
  orderId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
  forceClearance?: boolean;
  actorUserId?: string | null;
}) {
  const rule = await resolveRule(db, input.brokerId, input.ruleCode);
  if (!rule.enabled) return null;
  const severity = input.severity ?? rule.severity;
  const clearanceStatus = input.forceClearance || severity === "high" || severity === "critical" ? "required" : "not_required";
  const existing = await db.monitoringAlert.findUnique({ where: { brokerId_fingerprint: { brokerId: input.brokerId, fingerprint: input.fingerprint } }, select: { id: true } });
  const alert = await db.monitoringAlert.upsert({
    where: { brokerId_fingerprint: { brokerId: input.brokerId, fingerprint: input.fingerprint } },
    create: {
      id: `ALT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
      brokerId: input.brokerId,
      category: rule.category,
      ruleCode: input.ruleCode,
      ruleVersion: rule.version,
      fingerprint: input.fingerprint,
      severity,
      clearanceStatus,
      title: rule.title,
      summary: input.summary,
      details: (input.details ?? {}) as Prisma.InputJsonValue,
      clientId: input.clientId ?? null,
      cashMovementId: input.cashMovementId ?? null,
      orderId: input.orderId ?? null,
    },
    update: {
      severity,
      summary: input.summary,
      details: (input.details ?? {}) as Prisma.InputJsonValue,
      clearanceStatus,
      updatedAt: new Date(),
    },
  });
  if (!existing) {
    await writeMonitoringAudit(db, { brokerId: input.brokerId, actorUserId: input.actorUserId, action: "ALERT_CREATED", entityType: "monitoring_alert", entityId: alert.id, summary: `${rule.title} alert created`, restrictedData: { ruleCode: input.ruleCode, severity, clientId: input.clientId, cashMovementId: input.cashMovementId, orderId: input.orderId } });
    if (input.actorUserId && isImmediateEmployeeConductRule(input.ruleCode)) {
      const escalation = await db.complianceEscalation.findFirst({ where: { brokerId: input.brokerId, linkedEntityType: "monitoring_alert", linkedEntityId: alert.id } });
      if (!escalation) {
        const awarenessAt = new Date();
        await db.complianceEscalation.create({ data: {
          id: `ESC-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
          brokerId: input.brokerId,
          eventType: "market_conduct",
          subject: `Immediate conduct review · ${rule.title}`,
          summary: input.summary,
          linkedEntityType: "monitoring_alert",
          linkedEntityId: alert.id,
          awarenessAt,
          dueAt: awarenessAt,
          createdBy: input.actorUserId,
        } });
        await writeMonitoringAudit(db, { brokerId: input.brokerId, actorUserId: input.actorUserId, action: "IMMEDIATE_ESCALATION_CREATED", entityType: "monitoring_alert", entityId: alert.id, summary: "Immediate employee-conduct escalation opened", restrictedData: { ruleCode: input.ruleCode } });
      }
    }
  }
  return alert;
}

async function cashSeverity(db: Db, movement: { client: { pepStatus: string; riskRating: string; kycStatus: string } }, base: MonitoringSeverity) {
  return appliesHighRiskMultiplier(movement.client) ? raiseSeverity(base) : base;
}

export async function evaluateCashMovement(db: Db, brokerId: string, cashMovementId: string) {
  if (!(await monitoringEnabled(db, brokerId))) return [];
  const movement = await db.cashMovement.findFirst({
    where: { id: cashMovementId, brokerId },
    include: { client: { include: { linkedBankAccounts: true, beneficialOwnerRecords: true } }, sourceLinkedBankAccount: true, linkedBankAccount: true },
  });
  if (!movement) fail("Cash movement not found.", 404);
  const alerts = [];

  if (movement.movementType === "deposit") {
    const sourceValid = validDepositFundingSource({ sourceBankStatus: movement.sourceLinkedBankAccount?.status, sourceBankClientId: movement.sourceLinkedBankAccount?.clientId, movementClientId: movement.clientId });
    if (!sourceValid) alerts.push(await createMonitoringAlert(db, {
      brokerId, ruleCode: "AML_P1", fingerprint: `AML_P1:${movement.id}`, severity: await cashSeverity(db, movement, "high"),
      clientId: movement.clientId, cashMovementId: movement.id, forceClearance: true,
      summary: "The deposit source is missing, unapproved, or not linked to this client.",
      details: { sourceLinkedBankAccountId: movement.sourceLinkedBankAccountId },
    }));

    const p4 = await resolveRule(db, brokerId, "AML_P4");
    const count = Number(p4.configuration.count ?? 3);
    const windowDays = Number(p4.configuration.windowDays ?? 7);
    const since = new Date(movement.submittedAt.getTime() - windowDays * 86_400_000);
    const recent = await db.cashMovement.findMany({
      where: { brokerId, clientId: movement.clientId, movementType: "deposit", status: { notIn: ["rejected", "failed"] }, submittedAt: { gte: since, lte: movement.submittedAt } },
      select: { id: true }, orderBy: { submittedAt: "asc" },
    });
    if (fragmentationTriggered(recent.length, count)) alerts.push(await createMonitoringAlert(db, {
      brokerId, ruleCode: "AML_P4", fingerprint: `AML_P4:${movement.clientId}:${recent[0].id}`, severity: await cashSeverity(db, movement, "medium"),
      clientId: movement.clientId, cashMovementId: movement.id,
      summary: `${recent.length} non-rejected deposits were submitted within ${windowDays} days.`,
      details: { count: recent.length, windowDays, movementIds: recent.map((item) => item.id) },
    }));

    const p5 = await resolveRule(db, brokerId, "AML_P5");
    const lookbackDays = Number(p5.configuration.lookbackDays ?? 365);
    const baselineSince = new Date(movement.submittedAt.getTime() - lookbackDays * 86_400_000);
    const completed = await db.cashMovement.findMany({
      where: { brokerId, clientId: movement.clientId, status: "completed", completedAt: { lt: movement.submittedAt } },
      select: { movementType: true, amount: true, completedAt: true }, orderBy: { completedAt: "asc" },
    });
    const sameDirection = completed.filter((item) => item.movementType === movement.movementType && item.completedAt && item.completedAt >= baselineSince).map((item) => Number(item.amount));
    const deviation = historicalDeviation({
      amount: Number(movement.amount), completedMovementCount: completed.length, sameDirectionAmounts: sameDirection,
      clientCreatedAt: movement.client.createdAt,
      clientAgeDays: Number(p5.configuration.clientAgeDays ?? 180), minimumMovements: Number(p5.configuration.minimumMovements ?? 10),
      minimumDirectionObservations: Number(p5.configuration.minimumDirectionObservations ?? 5), multiplier: Number(p5.configuration.multiplier ?? 5), now: movement.submittedAt,
    });
    if (deviation) alerts.push(await createMonitoringAlert(db, {
      brokerId, ruleCode: "AML_P5", fingerprint: `AML_P5:${movement.id}`, severity: await cashSeverity(db, movement, "medium"),
      clientId: movement.clientId, cashMovementId: movement.id,
      summary: `This deposit is ${deviation.multiple.toFixed(1)}× the trailing same-direction median.`,
      details: { baseline: deviation.baseline, multiple: deviation.multiple, observations: sameDirection.length },
    }));
  }

  if (movement.movementType === "withdrawal") {
    const destinationId = movement.linkedBankAccountId;
    const funded = destinationId ? await db.cashMovement.findFirst({
      where: { brokerId, clientId: movement.clientId, movementType: "deposit", status: "completed", sourceLinkedBankAccountId: destinationId, completedAt: { lt: movement.submittedAt } },
      select: { id: true, completedAt: true }, orderBy: { completedAt: "asc" },
    }) : null;
    const priorWithdrawal = await db.cashMovement.findFirst({ where: { brokerId, clientId: movement.clientId, movementType: "withdrawal", id: { not: movement.id }, submittedAt: { lt: movement.submittedAt } }, select: { id: true } });
    const clientAgeDays = (movement.submittedAt.getTime() - movement.client.createdAt.getTime()) / 86_400_000;
    const closedLoopRisk = closedLoopWithdrawalRisk({ destinationFunded: Boolean(funded), hasPriorWithdrawal: Boolean(priorWithdrawal), clientAgeDays });
    if (closedLoopRisk.unfundedDestination) alerts.push(await createMonitoringAlert(db, {
      brokerId, ruleCode: "AML_P9_UNFUNDED_DESTINATION", fingerprint: `AML_P9_UNFUNDED:${movement.id}`, severity: await cashSeverity(db, movement, "high"),
      clientId: movement.clientId, cashMovementId: movement.id, forceClearance: true,
      summary: "The withdrawal destination has not previously funded this client account after monitoring activation.",
      details: { linkedBankAccountId: destinationId },
    }));
    if (closedLoopRisk.rapidFirstWithdrawal) alerts.push(await createMonitoringAlert(db, {
      brokerId, ruleCode: "AML_P9_FIRST_WITHDRAWAL", fingerprint: `AML_P9_FIRST:${movement.clientId}`, severity: await cashSeverity(db, movement, "medium"),
      clientId: movement.clientId, cashMovementId: movement.id,
      summary: "The client's first withdrawal was submitted within seven days of account creation.", details: { clientAgeDays },
    }));
  }
  return alerts.filter(Boolean);
}

export async function assertCashMonitoringClearance(db: Db, brokerId: string, cashMovementId: string) {
  if (!(await monitoringEnabled(db, brokerId))) return;
  const [alerts, exception, unfundedAlert] = await Promise.all([
    db.monitoringAlert.findMany({
    where: { brokerId, cashMovementId, status: "open", severity: { in: ["high", "critical"] }, clearanceStatus: { not: "cleared" } },
    select: { id: true, ruleCode: true },
    }),
    db.withdrawalDestinationException.findUnique({ where: { cashMovementId }, select: { status: true } }),
    db.monitoringAlert.findFirst({ where: { brokerId, cashMovementId, status: "open", ruleCode: "AML_P9_UNFUNDED_DESTINATION" }, select: { id: true } }),
  ]);
  if (unfundedAlert && exception?.status !== "approved") fail("A different-user withdrawal-destination exception is required before this instruction can proceed.");
  const blocking = alerts.find((alert) => !(alert.ruleCode === "AML_P9_UNFUNDED_DESTINATION" && exception?.status === "approved"));
  if (blocking) fail("Compliance clearance is required before this cash instruction can proceed.");
}

export async function enrollEmployeeConductProfile(actor: Actor, input: { userId: string; faydaId: string; sensitiveMarketAccess?: boolean }) {
  const digits = input.faydaId.replace(/\D/g, "");
  if (digits.length < 7) fail("Enter a valid Fayda FAN.", 400);
  const identityReference = clientIdentityReference({ clientType: "individual", faydaId: digits });
  const [user, client] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.userId, brokerId: actor.brokerId } }),
    prisma.client.findFirst({ where: { brokerId: actor.brokerId, identityReference }, include: { accounts: { where: { status: "active" }, orderBy: { createdAt: "asc" }, take: 1 } } }),
  ]);
  if (!user) fail("Employee not found for this tenant.", 404);
  return prisma.employeeConductProfile.upsert({
    where: { userId: user.id },
    create: {
      id: `ECP-${crypto.randomUUID().slice(0, 10).toUpperCase()}`, brokerId: actor.brokerId, userId: user.id,
      identityReference, faydaLast7: digits.slice(-7), linkedClientId: client?.id ?? null, linkedAccountId: client?.accounts[0]?.id ?? null,
      sensitiveMarketAccess: input.sensitiveMarketAccess ?? false, designatedByUserId: actor.id,
    },
    update: {
      identityReference, faydaLast7: digits.slice(-7), linkedClientId: client?.id ?? null, linkedAccountId: client?.accounts[0]?.id ?? null,
      sensitiveMarketAccess: input.sensitiveMarketAccess ?? false, designatedByUserId: actor.id, designatedAt: new Date(),
    },
    include: { user: { select: { fullName: true, role: true } }, linkedClient: { select: { clientCode: true } }, linkedAccount: { select: { accountNumber: true } } },
  });
}

export async function evaluateEmployeeOrder(db: Db, input: { brokerId: string; accountId: string; instrumentId: string; side: string; quantity: Prisma.Decimal; value: Prisma.Decimal; actorId: string | null }) {
  if (!(await monitoringEnabled(db, input.brokerId))) return { employeeProfile: null, clearance: null, failures: [] as Array<{ code: MonitoringRuleCode; message: string; severity: MonitoringSeverity }> };
  const profile = await db.employeeConductProfile.findFirst({ where: { brokerId: input.brokerId, linkedAccountId: input.accountId, status: "active" }, include: { user: { select: { role: true } } } });
  if (!profile) return { employeeProfile: null, clearance: null, failures: [] as Array<{ code: MonitoringRuleCode; message: string; severity: MonitoringSeverity }> };
  const failures: Array<{ code: MonitoringRuleCode; message: string; severity: MonitoringSeverity }> = [];
  if (input.actorId === profile.userId) failures.push({ code: "EC_MISSING_CLEARANCE", severity: "high", message: "Employees cannot create broker-desk orders for their own account." });
  const now = new Date();
  const restriction = await db.restrictedSecurity.findFirst({ where: { brokerId: input.brokerId, instrumentId: input.instrumentId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }, orderBy: { effectiveFrom: "desc" } });
  if (restriction?.classification === "restricted") failures.push({ code: "EC_RESTRICTED_SECURITY", severity: "critical", message: "This instrument is restricted for employee personal dealing." });
  const inside = await db.sensitiveInformationAccess.findFirst({ where: { brokerId: input.brokerId, employeeProfileId: profile.id, instrumentId: input.instrumentId, receivedAt: { lte: now }, OR: [{ releasedAt: null }, { releasedAt: { gt: now } }] } });
  if (inside) failures.push({ code: "EC_INSIDE_INFORMATION", severity: "critical", message: "The employee is recorded as holding relevant price-sensitive information." });
  const businessDate = new Date(`${addisBusinessDate(now)}T00:00:00.000Z`);
  const clearance = requiresEmployeePreclearance(profile.user.role, profile.sensitiveMarketAccess) ? await db.personalTradeClearance.findFirst({
    where: { brokerId: input.brokerId, employeeProfileId: profile.id, instrumentId: input.instrumentId, side: input.side, businessDate, status: "approved", expiresAt: { gt: now } },
    orderBy: { decidedAt: "desc" },
  }) : null;
  if (requiresEmployeePreclearance(profile.user.role, profile.sensitiveMarketAccess) && !personalClearanceCovers({ present: Boolean(clearance), quantity: Number(input.quantity), value: Number(input.value), maxQuantity: clearance?.maxQuantity ? Number(clearance.maxQuantity) : null, maxValue: clearance?.maxValue ? Number(clearance.maxValue) : null })) {
    failures.push({ code: "EC_MISSING_CLEARANCE", severity: "high", message: "A valid same-day personal-trade clearance covering this side and size is required." });
  }
  return { employeeProfile: profile, clearance, failures };
}

export async function assertNoEmployeeSelfProcessing(db: Db, brokerId: string, orderId: string, actorId: string) {
  if (!(await monitoringEnabled(db, brokerId))) return;
  const order = await db.order.findFirst({ where: { id: orderId, brokerId }, select: { accountId: true } });
  if (!order) fail("Order not found.", 404);
  const profile = await db.employeeConductProfile.findFirst({ where: { brokerId, linkedAccountId: order.accountId, status: "active" } });
  if (profile?.userId === actorId) fail("Employees cannot approve, assign, execute, or capture their own account's order.");
}

export async function monitoringOverview(actor: Actor, sensitive: boolean) {
  const base = { brokerId: actor.brokerId };
  const [byCategory, heldCash, heldOrders, cases, deadlines] = await Promise.all([
    prisma.monitoringAlert.groupBy({ by: ["category", "severity"], where: { ...base, status: "open" }, _count: true }),
    prisma.monitoringAlert.count({ where: { ...base, status: "open", cashMovementId: { not: null }, severity: { in: ["high", "critical"] }, clearanceStatus: { not: "cleared" } } }),
    prisma.monitoringAlert.count({ where: { ...base, status: "open", orderId: { not: null }, severity: { in: ["high", "critical"] }, clearanceStatus: { not: "cleared" } } }),
    prisma.monitoringCase.count({ where: { ...base, status: { notIn: ["closed", "resolved"] } } }),
    prisma.monitoringCase.count({ where: { ...base, status: { notIn: ["closed", "resolved"] }, dueAt: { lte: new Date(Date.now() + 7 * 86_400_000) } } }),
  ]);
  return { aggregates: byCategory, heldCash, heldOrders, openCases: cases, upcomingDeadlines: deadlines, sensitive };
}

export async function listMonitoringAlerts(actor: Actor, input: { category?: string; status?: string } = {}) {
  const alerts = await prisma.monitoringAlert.findMany({
    where: { brokerId: actor.brokerId, ...(input.category ? { category: input.category } : {}), ...(input.status ? { status: input.status } : {}) },
    include: {
      client: { select: { clientCode: true, fullName: true } },
      case: { select: { referenceNumber: true, status: true } },
    },
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: 250,
  });
  return alerts.map((alert) => ({
    ...alert,
    detectedAt: alert.detectedAt.toISOString(), reviewedAt: alert.reviewedAt?.toISOString() ?? null,
    clearedAt: alert.clearedAt?.toISOString() ?? null, createdAt: alert.createdAt.toISOString(), updatedAt: alert.updatedAt.toISOString(),
  }));
}

export async function actOnMonitoringAlert(actor: Actor, alertId: string, input: { action: string; rationale?: string; caseId?: string }) {
  const rationale = input.rationale?.trim();
  return prisma.$transaction(async (tx) => {
    const alert = await tx.monitoringAlert.findFirst({ where: { id: alertId, brokerId: actor.brokerId } });
    if (!alert) fail("Alert not found for this tenant.", 404);
    const now = new Date();
    if (["clear", "block", "close_false_positive"].includes(input.action) && !rationale) fail("A compliance rationale is required.", 400);
    if (input.action === "clear") {
      const updated = await tx.monitoringAlert.update({
      where: { id: alert.id }, data: { clearanceStatus: "cleared", clearanceDecision: "cleared", clearanceRationale: rationale, clearedByUserId: actor.id, clearedAt: now, investigationStatus: "reviewed" },
      });
      await writeMonitoringAudit(tx, { brokerId: actor.brokerId, actorUserId: actor.id, action: "ALERT_CLEARED", entityType: "monitoring_alert", entityId: alert.id, summary: "Compliance clearance recorded", restrictedData: { rationale } });
      return updated;
    }
    if (input.action === "block") {
      const updated = await tx.monitoringAlert.update({
      where: { id: alert.id }, data: { clearanceStatus: "blocked", clearanceDecision: "blocked", clearanceRationale: rationale, clearedByUserId: actor.id, clearedAt: now, investigationStatus: "reviewed" },
      });
      await writeMonitoringAudit(tx, { brokerId: actor.brokerId, actorUserId: actor.id, action: "ALERT_BLOCKED", entityType: "monitoring_alert", entityId: alert.id, summary: "Compliance blocking decision recorded", restrictedData: { rationale } });
      return updated;
    }
    if (input.action === "close_false_positive") {
      const updated = await tx.monitoringAlert.update({
      where: { id: alert.id }, data: { status: "closed", investigationStatus: "false_positive", clearanceStatus: alert.clearanceStatus === "required" ? "cleared" : alert.clearanceStatus, clearanceDecision: "false_positive", clearanceRationale: rationale, reviewedByUserId: actor.id, reviewedAt: now, clearedByUserId: actor.id, clearedAt: now },
      });
      await writeMonitoringAudit(tx, { brokerId: actor.brokerId, actorUserId: actor.id, action: "ALERT_FALSE_POSITIVE", entityType: "monitoring_alert", entityId: alert.id, summary: "Alert closed as false positive", restrictedData: { rationale } });
      return updated;
    }
    if (input.action === "review") return tx.monitoringAlert.update({ where: { id: alert.id }, data: { investigationStatus: "in_review", reviewedByUserId: actor.id, reviewedAt: now } });
    if (input.action === "attach_case") {
      const caseRow = await tx.monitoringCase.findFirst({ where: { id: input.caseId, brokerId: actor.brokerId } });
      if (!caseRow) fail("Case not found for this tenant.", 404);
      return tx.monitoringAlert.update({ where: { id: alert.id }, data: { caseId: caseRow.id, investigationStatus: "in_review" } });
    }
    fail("Unsupported alert action.", 400);
  });
}

export async function listMonitoringCases(actor: Actor) {
  return prisma.monitoringCase.findMany({
    where: { brokerId: actor.brokerId },
    include: { _count: { select: { alerts: true, events: true, evidence: true } }, alerts: { select: { severity: true }, take: 20 } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function recordMonitoringEvidence(actor: Actor, caseId: string, input: { evidenceType: string; originalName: string; mimeType: string; sizeBytes: number; storageRef: string; sha256: string }) {
  const caseRow = await prisma.monitoringCase.findFirst({ where: { id: caseId, brokerId: actor.brokerId } });
  if (!caseRow) fail("Case not found for this tenant.", 404);
  if (!input.originalName?.trim() || !input.storageRef?.trim() || !/^[0-9a-f]{64}$/i.test(input.sha256) || !Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) fail("Complete evidence metadata and a SHA-256 digest are required.", 400);
  return prisma.$transaction(async (tx) => {
    const evidence = await tx.monitoringEvidence.create({ data: {
      id: crypto.randomUUID(), brokerId: actor.brokerId, caseId: caseRow.id, evidenceType: input.evidenceType.trim() || "document",
      originalName: input.originalName.trim().slice(0, 240), mimeType: input.mimeType.trim().slice(0, 120), sizeBytes: input.sizeBytes,
      storageRef: input.storageRef.trim().slice(0, 500), sha256: input.sha256.toLowerCase(), uploadedByUserId: actor.id,
    } });
    await tx.monitoringCaseEvent.create({ data: { id: crypto.randomUUID(), caseId: caseRow.id, eventType: "evidence_added", actorUserId: actor.id, note: input.originalName.trim().slice(0, 240) } });
    await writeMonitoringAudit(tx, { brokerId: actor.brokerId, actorUserId: actor.id, action: "CASE_EVIDENCE_ADDED", entityType: "monitoring_case", entityId: caseRow.id, summary: "Evidence added to monitoring case", restrictedData: { evidenceId: evidence.id, sha256: evidence.sha256 } });
    return evidence;
  });
}

export async function createMonitoringCase(actor: Actor, input: { category: string; title: string; priority?: string; dueAt?: string; alertIds?: string[] }) {
  const title = input.title?.trim();
  if (!title) fail("Case title is required.", 400);
  return prisma.$transaction(async (tx) => {
    const sequence = await tx.monitoringCase.count({ where: { brokerId: actor.brokerId } });
    const caseRow = await tx.monitoringCase.create({ data: {
      id: `MCASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, brokerId: actor.brokerId,
      referenceNumber: `RC-${new Date().getUTCFullYear()}-${String(sequence + 1).padStart(5, "0")}`,
      category: input.category === "employee_conduct" ? "employee_conduct" : "aml", title,
      priority: input.priority ?? "medium", dueAt: input.dueAt ? new Date(input.dueAt) : null, openedByUserId: actor.id,
      events: { create: { id: crypto.randomUUID(), eventType: "opened", actorUserId: actor.id, toStatus: "open", note: "Case opened" } },
    } });
    if (input.alertIds?.length) await tx.monitoringAlert.updateMany({ where: { id: { in: input.alertIds }, brokerId: actor.brokerId }, data: { caseId: caseRow.id, investigationStatus: "in_review" } });
    return caseRow;
  });
}

export async function updateMonitoringCase(actor: Actor, caseId: string, input: { status?: string; assignedToUserId?: string | null; note?: string; resolution?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.monitoringCase.findFirst({ where: { id: caseId, brokerId: actor.brokerId } });
    if (!current) fail("Case not found for this tenant.", 404);
    const status = input.status ?? current.status;
    const now = new Date();
    const updated = await tx.monitoringCase.update({ where: { id: current.id }, data: {
      status, assignedToUserId: input.assignedToUserId === undefined ? current.assignedToUserId : input.assignedToUserId,
      resolution: input.resolution?.trim() || current.resolution,
      resolvedAt: status === "resolved" ? now : current.resolvedAt,
      closedAt: status === "closed" ? now : current.closedAt,
    } });
    await tx.monitoringCaseEvent.create({ data: { id: crypto.randomUUID(), caseId: current.id, eventType: "updated", actorUserId: actor.id, fromStatus: current.status, toStatus: status, note: input.note?.trim() || null } });
    return updated;
  });
}

export async function listMonitoringRules(actor: Actor) {
  const versions = await prisma.monitoringRuleVersion.findMany({ where: { brokerId: actor.brokerId }, orderBy: [{ ruleCode: "asc" }, { version: "desc" }] });
  const latest = new Map(versions.map((row) => [row.ruleCode, row]));
  return Object.entries(MONITORING_RULES).map(([ruleCode, fallback]) => ({
    ruleCode, category: fallback.category, title: fallback.title,
    version: latest.get(ruleCode)?.version ?? 1, enabled: latest.get(ruleCode)?.enabled ?? true,
    configuration: latest.get(ruleCode)?.configuration ?? fallback.configuration,
    effectiveFrom: latest.get(ruleCode)?.effectiveFrom ?? null,
  }));
}

export async function updateMonitoringRule(actor: Actor, input: { ruleCode: string; enabled: boolean; configuration: Record<string, unknown>; reason: string }) {
  if (!(input.ruleCode in MONITORING_RULES)) fail("Unknown monitoring rule.", 400);
  if (!input.reason?.trim()) fail("A rule-change reason is required.", 400);
  return prisma.$transaction(async (tx) => {
    const current = await tx.monitoringRuleVersion.findFirst({ where: { brokerId: actor.brokerId, ruleCode: input.ruleCode, effectiveTo: null }, orderBy: { version: "desc" } });
    const now = new Date();
    if (current) await tx.monitoringRuleVersion.update({ where: { id: current.id }, data: { effectiveTo: now } });
    const fallback = MONITORING_RULES[input.ruleCode as MonitoringRuleCode];
    const created = await tx.monitoringRuleVersion.create({ data: {
      id: crypto.randomUUID(), brokerId: actor.brokerId, ruleCode: input.ruleCode, category: fallback.category,
      version: (current?.version ?? 0) + 1, enabled: input.enabled, configuration: input.configuration as Prisma.InputJsonValue,
      effectiveFrom: now, changedByUserId: actor.id, changeReason: input.reason.trim(),
    } });
    await writeMonitoringAudit(tx, { brokerId: actor.brokerId, actorUserId: actor.id, action: "MONITORING_RULE_CHANGED", entityType: "monitoring_rule", entityId: created.id, summary: `${input.ruleCode} changed to version ${created.version}`, restrictedData: { enabled: input.enabled, configuration: input.configuration, reason: input.reason } });
    return created;
  });
}

export async function listMonitoringAudit(actor: Actor) {
  return prisma.monitoringAuditEvent.findMany({ where: { brokerId: actor.brokerId }, orderBy: { createdAt: "desc" }, take: 250 });
}

export async function listEmployeePersonalDealing(brokerId: string, employeeProfileIds?: string[]) {
  const profiles = await prisma.employeeConductProfile.findMany({
    where: { brokerId, status: "active", linkedAccountId: { not: null }, ...(employeeProfileIds ? { id: { in: employeeProfileIds } } : {}) },
    select: { id: true, userId: true, linkedAccountId: true, user: { select: { fullName: true, role: true } } },
  });
  const byAccount = new Map(profiles.flatMap((profile) => profile.linkedAccountId ? [[profile.linkedAccountId, profile] as const] : []));
  if (!byAccount.size) return [];
  const orders = await prisma.order.findMany({
    where: { brokerId, accountId: { in: [...byAccount.keys()] } },
    include: {
      instrument: { select: { symbol: true, name: true } },
      trades: { select: { id: true, tradeDate: true, quantityFilled: true, executionPrice: true, grossAmount: true }, orderBy: { capturedAt: "asc" } },
      personalTradeClearance: { select: { id: true, status: true, businessDate: true, maxQuantity: true, maxValue: true } },
      monitoringAlerts: { where: { category: "employee_conduct" }, select: { id: true, ruleCode: true, severity: true, status: true, clearanceStatus: true } },
      events: { where: { toStatus: "cancelled" }, select: { createdAt: true, actorId: true, reason: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { submittedAt: "desc" },
    take: 250,
  });
  return orders.map((order) => ({ ...order, employeeProfile: byAccount.get(order.accountId) }));
}

export async function listEmployeeConduct(actor: Actor) {
  const [profiles, clearances, restrictions, disclosures, attestations, sensitiveAccess, users, instruments, dealingRegister] = await Promise.all([
    prisma.employeeConductProfile.findMany({ where: { brokerId: actor.brokerId }, include: { user: { select: { fullName: true, role: true, email: true } }, linkedClient: { select: { clientCode: true } }, linkedAccount: { select: { accountNumber: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.personalTradeClearance.findMany({ where: { brokerId: actor.brokerId }, include: { employeeProfile: { include: { user: { select: { fullName: true } } } }, instrument: { select: { symbol: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.restrictedSecurity.findMany({ where: { brokerId: actor.brokerId }, include: { instrument: { select: { symbol: true, name: true } } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.employeeDisclosure.findMany({ where: { brokerId: actor.brokerId }, include: { employeeProfile: { include: { user: { select: { fullName: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.conductAttestation.findMany({ where: { brokerId: actor.brokerId }, include: { employeeProfile: { include: { user: { select: { fullName: true } } } } }, orderBy: { attestationYear: "desc" }, take: 100 }),
    prisma.sensitiveInformationAccess.findMany({ where: { brokerId: actor.brokerId }, include: { employeeProfile: { include: { user: { select: { fullName: true } } } }, instrument: { select: { symbol: true, name: true } } }, orderBy: { receivedAt: "desc" }, take: 100 }),
    prisma.user.findMany({ where: { brokerId: actor.brokerId, status: { in: ["active", "invited"] } }, select: { id: true, fullName: true, email: true, role: true }, orderBy: { fullName: "asc" } }),
    prisma.brokerInstrument.findMany({ where: { brokerId: actor.brokerId, enabled: true }, include: { instrument: { select: { id: true, symbol: true, name: true } } }, orderBy: { instrument: { symbol: "asc" } } }),
    listEmployeePersonalDealing(actor.brokerId),
  ]);
  return { profiles, clearances, restrictions, disclosures, attestations, sensitiveAccess, users, instruments: instruments.map((row) => row.instrument), dealingRegister };
}

export async function getOwnEmployeeConduct(actor: Actor) {
  const profile = await prisma.employeeConductProfile.findFirst({ where: { brokerId: actor.brokerId, userId: actor.id, status: "active" }, include: { linkedAccount: { select: { accountNumber: true } } } });
  const instruments = await prisma.brokerInstrument.findMany({ where: { brokerId: actor.brokerId, enabled: true }, include: { instrument: { select: { id: true, symbol: true, name: true } } }, orderBy: { instrument: { symbol: "asc" } } });
  if (!profile) return { profile: null, dealingRegister: [], clearances: [], disclosures: [], attestations: [], instruments: instruments.map((row) => row.instrument) };
  const [dealingRegister, clearances, disclosures, attestations] = await Promise.all([
    listEmployeePersonalDealing(actor.brokerId, [profile.id]),
    prisma.personalTradeClearance.findMany({ where: { brokerId: actor.brokerId, employeeProfileId: profile.id }, include: { instrument: { select: { symbol: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.employeeDisclosure.findMany({ where: { brokerId: actor.brokerId, employeeProfileId: profile.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.conductAttestation.findMany({ where: { brokerId: actor.brokerId, employeeProfileId: profile.id }, orderBy: { attestationYear: "desc" }, take: 20 }),
  ]);
  const ownRegister = dealingRegister.map(({ monitoringAlerts, ...order }) => ({
    ...order,
    controlStatus: monitoringAlerts.some((alert) => alert.status === "open") ? "review_required" : "clear",
  }));
  return { profile, dealingRegister: ownRegister, clearances, disclosures, attestations, instruments: instruments.map((row) => row.instrument) };
}

async function ownEmployeeProfile(actor: Actor) {
  const profile = await prisma.employeeConductProfile.findFirst({ where: { brokerId: actor.brokerId, userId: actor.id, status: "active" } });
  if (!profile) fail("Compliance must enrol your employee conduct profile before this action is available.", 409);
  return profile;
}

export async function requestOwnPersonalTradeClearance(actor: Actor, input: { instrumentId: string; side: string; maxQuantity?: number; maxValue?: number }) {
  const profile = await ownEmployeeProfile(actor);
  return requestPersonalTradeClearance(actor, { ...input, employeeProfileId: profile.id });
}

export async function createOwnPersonalDealingDisclosure(actor: Actor, input: { title: string; details: Record<string, unknown> }) {
  const profile = await ownEmployeeProfile(actor);
  return createEmployeeDisclosure(actor, { employeeProfileId: profile.id, disclosureType: "personal_dealing", title: input.title, details: input.details });
}

export async function recordOwnConductAttestation(actor: Actor, input: { year: number; statementVersion: string; exceptions?: Record<string, unknown> }) {
  const profile = await ownEmployeeProfile(actor);
  return recordConductAttestation(actor, { ...input, employeeProfileId: profile.id });
}

export async function requestPersonalTradeClearance(actor: Actor, input: { employeeProfileId: string; instrumentId: string; side: string; maxQuantity?: number; maxValue?: number }) {
  const profile = await prisma.employeeConductProfile.findFirst({ where: { id: input.employeeProfileId, brokerId: actor.brokerId, status: "active" } });
  if (!profile) fail("Employee conduct profile not found.", 404);
  const date = addisBusinessDate();
  return prisma.personalTradeClearance.create({ data: {
    id: `CLR-${crypto.randomUUID().slice(0, 9).toUpperCase()}`, brokerId: actor.brokerId, employeeProfileId: profile.id,
    instrumentId: input.instrumentId, side: input.side === "sell" ? "sell" : "buy", businessDate: new Date(`${date}T00:00:00.000Z`),
    maxQuantity: input.maxQuantity ?? null, maxValue: input.maxValue ?? null, requestedByUserId: actor.id,
    expiresAt: new Date(`${date}T20:59:59.999Z`),
  } });
}

export async function decidePersonalTradeClearance(actor: Actor, clearanceId: string, input: { decision: string; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const clearance = await tx.personalTradeClearance.findFirst({ where: { id: clearanceId, brokerId: actor.brokerId }, include: { employeeProfile: true } });
    if (!clearance) fail("Clearance request not found.", 404);
    if (clearance.requestedByUserId === actor.id) fail("The requester cannot approve their own personal-trade clearance.");
    if (clearance.status !== "pending") fail("This clearance has already been decided.");
    const restriction = await tx.restrictedSecurity.findFirst({ where: { brokerId: actor.brokerId, instrumentId: clearance.instrumentId, classification: "restricted", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } });
    if (input.decision === "approved" && restriction) fail("A restricted security cannot be approved for employee dealing.");
    return tx.personalTradeClearance.update({ where: { id: clearance.id }, data: { status: input.decision === "approved" ? "approved" : "rejected", approvedByUserId: actor.id, decisionReason: input.reason?.trim() || null, decidedAt: new Date() } });
  });
}

export async function createEmployeeDisclosure(actor: Actor, input: { employeeProfileId: string; disclosureType: string; title: string; details: Record<string, unknown> }) {
  const allowed = ["conflict", "outside_business", "directorship", "gift_benefit", "personal_dealing"];
  if (!allowed.includes(input.disclosureType)) fail("Unsupported disclosure type.", 400);
  if (!input.title.trim()) fail("A disclosure title is required.", 400);
  const profile = await prisma.employeeConductProfile.findFirst({ where: { id: input.employeeProfileId, brokerId: actor.brokerId } });
  if (!profile) fail("Employee profile not found.", 404);
  return prisma.employeeDisclosure.create({ data: { id: crypto.randomUUID(), brokerId: actor.brokerId, employeeProfileId: profile.id, disclosureType: input.disclosureType, title: input.title.trim(), details: input.details as Prisma.InputJsonValue, submittedByUserId: actor.id } });
}

export async function addRestrictedSecurity(actor: Actor, input: { instrumentId: string; classification: string; reason: string; effectiveFrom?: string; effectiveTo?: string }) {
  const classification = input.classification === "restricted" ? "restricted" : "watch";
  return prisma.restrictedSecurity.create({ data: {
    id: crypto.randomUUID(), brokerId: actor.brokerId, instrumentId: input.instrumentId, classification, reason: input.reason.trim(),
    effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(), effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null, createdByUserId: actor.id,
  } });
}

export async function recordSensitiveInformationAccess(actor: Actor, input: { employeeProfileId: string; instrumentId: string; reason: string; receivedAt?: string }) {
  const profile = await prisma.employeeConductProfile.findFirst({ where: { id: input.employeeProfileId, brokerId: actor.brokerId } });
  if (!profile) fail("Employee profile not found.", 404);
  return prisma.sensitiveInformationAccess.create({ data: {
    id: crypto.randomUUID(), brokerId: actor.brokerId, employeeProfileId: profile.id, instrumentId: input.instrumentId,
    reason: input.reason.trim(), receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(), recordedByUserId: actor.id,
  } });
}

export async function releaseSensitiveInformationAccess(actor: Actor, accessId: string) {
  const access = await prisma.sensitiveInformationAccess.findFirst({ where: { id: accessId, brokerId: actor.brokerId } });
  if (!access) fail("Sensitive-information record not found.", 404);
  return prisma.sensitiveInformationAccess.update({ where: { id: access.id }, data: { releasedAt: new Date() } });
}

export async function recordConductAttestation(actor: Actor, input: { employeeProfileId: string; year: number; statementVersion: string; exceptions?: Record<string, unknown> }) {
  const profile = await prisma.employeeConductProfile.findFirst({ where: { id: input.employeeProfileId, brokerId: actor.brokerId } });
  if (!profile) fail("Employee profile not found.", 404);
  return prisma.conductAttestation.upsert({
    where: { employeeProfileId_attestationYear: { employeeProfileId: profile.id, attestationYear: input.year } },
    create: { id: crypto.randomUUID(), brokerId: actor.brokerId, employeeProfileId: profile.id, attestationYear: input.year, statementVersion: input.statementVersion, status: "attested", attestedAt: new Date(), exceptions: input.exceptions ? input.exceptions as Prisma.InputJsonValue : undefined },
    update: { statementVersion: input.statementVersion, status: "attested", attestedAt: new Date(), exceptions: input.exceptions ? input.exceptions as Prisma.InputJsonValue : undefined },
  });
}

export async function requestWithdrawalException(actor: Actor, cashMovementId: string, reason: string) {
  const movement = await prisma.cashMovement.findFirst({ where: { id: cashMovementId, brokerId: actor.brokerId, movementType: "withdrawal" } });
  if (!movement) fail("Withdrawal not found.", 404);
  return prisma.withdrawalDestinationException.upsert({ where: { cashMovementId }, create: { id: crypto.randomUUID(), brokerId: actor.brokerId, cashMovementId, reason: reason.trim(), requestedByUserId: actor.id }, update: { reason: reason.trim(), requestedByUserId: actor.id, approvedByUserId: null, status: "pending", decidedAt: null } });
}

export async function decideWithdrawalException(actor: Actor, cashMovementId: string, decision: string) {
  const exception = await prisma.withdrawalDestinationException.findFirst({ where: { cashMovementId, brokerId: actor.brokerId } });
  if (!exception) fail("Withdrawal exception not found.", 404);
  if (exception.requestedByUserId === actor.id) fail("A different compliance user must approve the withdrawal exception.");
  return prisma.withdrawalDestinationException.update({ where: { id: exception.id }, data: { status: decision === "approved" ? "approved" : "rejected", approvedByUserId: actor.id, decidedAt: new Date() } });
}

export async function runClientMonitoringSweep(brokerId: string) {
  if (!(await monitoringEnabled(prisma, brokerId))) return { alerts: 0 };
  const clients = await prisma.client.findMany({
    where: { brokerId, status: { not: "closed" } },
    include: { linkedBankAccounts: { where: { status: "approved" } }, beneficialOwnerRecords: { where: { verifiedAt: { not: null } } }, screenings: { orderBy: { screenedAt: "desc" }, take: 1 } },
  });
  let alerts = 0;
  const register = new Map<string, string[]>();
  const add = (key: string | null, clientId: string) => { if (key) register.set(key, [...(register.get(key) ?? []), clientId]); };
  for (const client of clients) {
    if (client.identityVerifiedAt) add(client.identityReference ? `identity:${client.identityReference}` : null, client.id);
    if (client.taxIdentityReference) add(`tin:${client.taxIdentityReference}`, client.id);
    if (client.phoneVerifiedAt) add(normalizeVerifiedPhone(client.phone) ? `phone:${normalizeVerifiedPhone(client.phone)}` : null, client.id);
    for (const bank of client.linkedBankAccounts) add(`bank:${bank.bankName.trim().toLowerCase()}:${bank.accountNumber.replace(/\s/g, "")}`, client.id);
    for (const owner of client.beneficialOwnerRecords) {
      add(owner.identityReference ? `owner-identity:${owner.identityReference}` : null, client.id);
      add(owner.taxReference ? `owner-tin:${owner.taxReference}` : null, client.id);
    }
    const now = new Date();
    const latest = client.screenings[0];
    if (client.kycReviewDueAt && client.kycReviewDueAt < now || !latest || now.getTime() - latest.screenedAt.getTime() > 365 * 86_400_000) {
      if (await createMonitoringAlert(prisma, { brokerId, ruleCode: "AML_P8_KYC", fingerprint: `AML_P8_KYC:${client.id}`, clientId: client.id, severity: "high", forceClearance: true, summary: "The client's KYC review or sanctions/PEP screening is overdue.", details: { kycReviewDueAt: client.kycReviewDueAt?.toISOString(), latestScreeningAt: latest?.screenedAt.toISOString() } })) alerts++;
    }
    if (latest && latest.result !== "clear") {
      if (await createMonitoringAlert(prisma, { brokerId, ruleCode: "AML_P8_SCREENING", fingerprint: `AML_P8_SCREENING:${client.id}:${latest.id}`, clientId: client.id, severity: latest.result.includes("match") ? "critical" : "high", forceClearance: true, summary: `Latest screening result requires review: ${latest.result}.`, details: { screeningId: latest.id, result: latest.result } })) alerts++;
    }
  }
  for (const [key, ids] of register) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2) continue;
    for (const clientId of uniqueIds) if (await createMonitoringAlert(prisma, { brokerId, ruleCode: "AML_P7", fingerprint: `AML_P7:${key}:${clientId}`, clientId, severity: "high", forceClearance: true, summary: "A verified identifier is shared with another client in this tenant.", details: { identifierType: key.split(":")[0], relatedClientIds: uniqueIds.filter((id) => id !== clientId) } })) alerts++;
  }
  return { alerts };
}

const EMPLOYEE_SWEEP_RULES: MonitoringRuleCode[] = ["EC_PROFILE_MISSING", "EC_ACCOUNT_UNLINKED", "EC_ATTESTATION_OVERDUE", "EC_CLEARANCE_EXCEPTION", "EC_CANCELLATION_PATTERN"];

export async function runEmployeeConductSweep(brokerId: string) {
  if (!(await monitoringEnabled(prisma, brokerId))) return { alerts: 0, resolved: 0 };
  const now = new Date();
  const [users, profiles, cancellationRule] = await Promise.all([
    prisma.user.findMany({ where: { brokerId, status: "active" }, select: { id: true, role: true, fullName: true } }),
    prisma.employeeConductProfile.findMany({
      where: { brokerId },
      include: {
        user: { select: { id: true, role: true, fullName: true, status: true } },
        attestations: { select: { attestationYear: true, status: true } },
        clearances: { where: { status: { in: ["pending", "approved"] }, expiresAt: { gt: now } }, select: { id: true, status: true, expiresAt: true } },
      },
    }),
    resolveRule(prisma, brokerId, "EC_CANCELLATION_PATTERN"),
  ]);
  let alerts = 0;
  let resolved = 0;
  const activeFingerprints = new Set<string>();
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const createSweepAlert = async (input: Parameters<typeof createMonitoringAlert>[1]) => {
    activeFingerprints.add(input.fingerprint);
    if (await createMonitoringAlert(prisma, input)) alerts++;
  };

  for (const user of users) {
    const profile = profileByUser.get(user.id);
    if (requiresEmployeePreclearance(user.role, profile?.sensitiveMarketAccess ?? false) && (!profile || profile.status !== "active")) {
      await createSweepAlert({ brokerId, ruleCode: "EC_PROFILE_MISSING", fingerprint: `EC_PROFILE_MISSING:${user.id}`, severity: "medium", summary: "An active employee in a pre-clearance role has no conduct profile.", details: { employeeUserId: user.id, role: user.role } });
    }
  }

  for (const profile of profiles) {
    const covered = requiresEmployeePreclearance(profile.user.role, profile.sensitiveMarketAccess);
    if (profile.status === "active" && covered && !profile.linkedAccountId) {
      await createSweepAlert({ brokerId, ruleCode: "EC_ACCOUNT_UNLINKED", fingerprint: `EC_ACCOUNT_UNLINKED:${profile.id}`, clientId: profile.linkedClientId, severity: "medium", summary: "An employee conduct profile is not linked to an in-house account; automatic dealing surveillance is incomplete.", details: { employeeProfileId: profile.id, employeeUserId: profile.userId } });
    }
    const attestedYears = profile.attestations.filter((item) => item.status === "attested").map((item) => item.attestationYear);
    const effectiveAttestationDueAt = profile.annualAttestationDueAt ?? new Date(Date.UTC(profile.designatedAt.getUTCFullYear() + 1, profile.designatedAt.getUTCMonth(), profile.designatedAt.getUTCDate()));
    if (profile.status === "active" && isAttestationOverdue({ dueAt: effectiveAttestationDueAt, attestedYears, now })) {
      const year = effectiveAttestationDueAt.getUTCFullYear();
      await createSweepAlert({ brokerId, ruleCode: "EC_ATTESTATION_OVERDUE", fingerprint: `EC_ATTESTATION_OVERDUE:${profile.id}:${year}`, clientId: profile.linkedClientId, severity: "medium", summary: `The employee's ${year} conduct attestation is overdue.`, details: { employeeProfileId: profile.id, employeeUserId: profile.userId, dueAt: effectiveAttestationDueAt.toISOString(), attestationYear: year } });
    }
    if (profile.user.status !== "active" && profile.clearances.length) {
      await createSweepAlert({ brokerId, ruleCode: "EC_CLEARANCE_EXCEPTION", fingerprint: `EC_CLEARANCE_EXCEPTION:${profile.id}:${profile.clearances.map((item) => item.id).sort().join(":")}`, clientId: profile.linkedClientId, severity: "high", summary: "An inactive employee still has a pending or unexpired personal-trade clearance.", details: { employeeProfileId: profile.id, employeeUserId: profile.userId, clearanceIds: profile.clearances.map((item) => item.id) } });
    }
  }

  const count = Math.max(1, Number(cancellationRule.configuration.count ?? 3));
  const windowDays = Math.max(1, Number(cancellationRule.configuration.windowDays ?? 7));
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const linkedProfiles = profiles.filter((profile) => profile.status === "active" && profile.linkedAccountId);
  const cancelledOrders = linkedProfiles.length ? await prisma.order.findMany({
    where: { brokerId, accountId: { in: linkedProfiles.map((profile) => profile.linkedAccountId!) }, status: "cancelled", submittedAt: { gte: since } },
    select: { id: true, accountId: true, instrumentId: true, submittedAt: true },
    orderBy: { submittedAt: "asc" },
  }) : [];
  for (const profile of linkedProfiles) {
    const rows = cancelledOrders.filter((order) => order.accountId === profile.linkedAccountId);
    if (!cancellationPatternTriggered(rows.length, count)) continue;
    await createSweepAlert({ brokerId, ruleCode: "EC_CANCELLATION_PATTERN", fingerprint: `EC_CANCELLATION_PATTERN:${profile.id}:${rows[0].id}`, clientId: profile.linkedClientId, severity: "medium", summary: `${rows.length} employee-account orders were cancelled within ${windowDays} days and require review.`, details: { employeeProfileId: profile.id, employeeUserId: profile.userId, count: rows.length, windowDays, orderIds: rows.map((row) => row.id), instrumentIds: [...new Set(rows.map((row) => row.instrumentId))] } });
  }

  const prior = await prisma.monitoringAlert.findMany({ where: { brokerId, status: "open", ruleCode: { in: EMPLOYEE_SWEEP_RULES } }, select: { id: true, fingerprint: true } });
  for (const alert of prior) {
    if (activeFingerprints.has(alert.fingerprint)) continue;
    await prisma.monitoringAlert.update({ where: { id: alert.id }, data: { status: "closed", investigationStatus: "resolved", clearanceStatus: "not_required", clearanceDecision: "control_resolved", clearanceRationale: "The automated coverage sweep no longer detects this exception." } });
    await writeMonitoringAudit(prisma, { brokerId, action: "CONTROL_EXCEPTION_RESOLVED", entityType: "monitoring_alert", entityId: alert.id, summary: "Automated employee-control exception resolved" });
    resolved++;
  }
  return { alerts, resolved };
}

export async function runMonitoringSweeps(brokerId: string) {
  const [client, employee] = await Promise.all([runClientMonitoringSweep(brokerId), runEmployeeConductSweep(brokerId)]);
  return { alerts: client.alerts + employee.alerts, clientAlerts: client.alerts, employeeAlerts: employee.alerts, resolvedEmployeeAlerts: employee.resolved };
}
