import { prisma } from "../prisma";
import { toNum } from "../money";
import { createNotificationOnce, SETTLEMENT, COMPLIANCE } from "./notification-service";
import { isMonitoringEnabled } from "../monitoring";
import { runMonitoringSweeps } from "../monitoring-service";
import { addisBusinessDate, addisDateOnly } from "../addis-date";

/**
 * Daily-cadence (time-driven) notifications - run once a day by the cron route.
 * Unlike lifecycle notifications, these fire from date conditions: settlements
 * that have reached their value date without confirmation, and periodic KYC
 * reviews coming due. Every reminder carries a dedupe key so re-running the job
 * (or running it more than once a day) never produces duplicates.
 */

function dateOnly(value = new Date()) {
  return addisDateOnly(value);
}

export async function runDailyNotificationSweep(now = new Date()) {
  const today = dateOnly(now);
  const dayKey = addisBusinessDate(now);
  let settlementReminders = 0;
  let kycReminders = 0;
  let monitoringAlerts = 0;

  // 1. Settlements at or past their value date that have not been confirmed.
  const dueSettlements = await prisma.settlement.findMany({
    where: { status: { not: "settled" }, settlementDate: { lte: today } },
    include: { trade: { include: { order: { include: { instrument: true, account: true } } } } },
  });
  for (const settlement of dueSettlements) {
    const order = settlement.trade?.order;
    if (!order) continue;
    const overdue = settlement.settlementDate.getTime() < today.getTime();
    // Broker settlement team is nudged every day the item stays open.
    const created = await createNotificationOnce({
      dedupeKey: `settle-due:${settlement.id}:${dayKey}`,
      scope: "broker",
      brokerId: order.brokerId,
      roles: SETTLEMENT,
      category: "settlement",
      severity: overdue ? "critical" : "warning",
      title: `Settlement ${overdue ? "overdue" : "due today"} · ${order.instrument.symbol}`,
      body: `${settlement.trade.id} for order ${order.id} (${toNum(settlement.trade.netAmount)} ETB) is ${overdue ? "overdue for settlement" : "due for settlement today"}.`,
      entityType: "order",
      entityId: order.id,
    });
    if (created) settlementReminders += 1;
    // The investor is told once (no day in the key), avoiding a daily nudge.
    await createNotificationOnce({
      dedupeKey: `settle-due-inv:${settlement.id}`,
      scope: "investor",
      brokerId: order.brokerId,
      clientId: order.account.clientId,
      category: "settlement",
      severity: "info",
      title: overdue ? "Settlement delayed" : "Settlement due today",
      body: `Your ${order.side} of ${order.instrument.symbol} is ${overdue ? "awaiting delayed settlement" : "settling today"}.`,
      entityType: "order",
      entityId: order.id,
    });
  }

  // 2. Periodic KYC reviews within the next 7 days (or overdue) for active clients.
  const horizon = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueKyc = await prisma.client.findMany({
    where: { kycStatus: "approved", status: "active", kycReviewDueAt: { not: null, lte: horizon } },
  });
  for (const client of dueKyc) {
    const due = client.kycReviewDueAt;
    if (!due) continue;
    const overdue = due.getTime() < today.getTime();
    // Once per review cycle: the key is tied to the due date, not the run date.
    const created = await createNotificationOnce({
      dedupeKey: `kyc-review:${client.id}:${due.toISOString().slice(0, 10)}`,
      scope: "broker",
      brokerId: client.brokerId,
      roles: COMPLIANCE,
      category: "kyc",
      severity: overdue ? "warning" : "info",
      title: `KYC review ${overdue ? "overdue" : "due soon"} · ${client.fullName}`,
      body: `Periodic KYC review for ${client.clientCode} is ${overdue ? "overdue" : `due ${due.toISOString().slice(0, 10)}`}.`,
      entityType: "client",
      entityId: client.id,
    });
    if (created) kycReminders += 1;
  }

  // 3. Tenant-isolated AML and employee-conduct sweep. Disabled tenants are skipped;
  // alert fingerprints make the sweep safe to rerun.
  const monitoringTenants = await prisma.brokerSettings.findMany({ select: { brokerId: true, features: true } });
  for (const tenant of monitoringTenants) {
    if (!isMonitoringEnabled(tenant.features)) continue;
    monitoringAlerts += (await runMonitoringSweeps(tenant.brokerId)).alerts;
  }

  return { settlementReminders, kycReminders, monitoringAlerts, total: settlementReminders + kycReminders + monitoringAlerts };
}
