import { prisma } from "../../../lib/prisma";
import { resolveActor, resolveBrokerId } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError } from "../../../lib/api";
import { resolveTenantContext } from "../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const brokerId = resolveBrokerId(request);
    const [broker, regulatoryFeeSchedule, tenantContext] = await Promise.all([prisma.broker.findUnique({
      where: { id: brokerId },
      include: {
        settings: true,
        instrumentAccess: { where: { enabled: true }, include: { instrument: true } },
        feeSchedules: {
          where: { status: "published", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
          include: { rules: true },
          orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    }), prisma.platformFeeSchedule.findFirst({
      where: { status: "published", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
      include: { rules: true },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    }), resolveTenantContext(brokerId)]);
    if (!broker) return Response.json({ error: "Tenant not found." }, { status: 404 });

    return Response.json({
      tenant: {
        id: broker.id,
        name: broker.name,
        licenseNumber: broker.licenseNumber,
        tradingName: broker.settings?.tradingName ?? broker.name,
        primaryColor: broker.settings?.primaryColor ?? "#0C8189",
        welcomeMessage: broker.settings?.welcomeMessage ?? "Access Ethiopian shares and government bonds through one simple platform.",
        supportEmail: broker.settings?.supportEmail,
        features: broker.settings?.features ?? {},
        profile: tenantContext ? { businessType: tenantContext.businessType } : null,
        licenses: tenantContext?.licenses ?? [],
        entitlements: tenantContext?.entitlements ?? [],
        modules: tenantContext?.modules ?? { dealer_operations: true, investor_servicing: true, issuer_advisory: false },
        checklistPacks: tenantContext?.checklistPacks ?? [],
        availableRoles: tenantContext?.availableRoles ?? [],
        controls: {
          brokerageFeePct: broker.settings ? toNum(broker.settings.brokerageFeePct) : 0.5,
          minimumFee: broker.settings ? toNum(broker.settings.minimumFee) : 0,
          allowedOrderTypes: broker.settings?.allowedOrderTypes ?? ["Limit"],
          settlementCycle: broker.settings?.settlementCycle ?? "T+2",
          makerChecker: broker.settings?.makerChecker ?? true,
          approvalThreshold: broker.settings ? toNum(broker.settings.approvalThreshold) : 0,
          clientDailyLimit: broker.settings ? toNum(broker.settings.clientDailyLimit) : 0,
          feeRules: (broker.feeSchedules[0]?.rules ?? []).map((rule) => ({
            assetClass: rule.assetClass,
            marketSegment: rule.marketSegment,
            brokeragePct: toNum(rule.brokeragePct),
            regulatorPct: toNum(regulatoryFeeSchedule?.rules.find((item) => item.assetClass === rule.assetClass && item.marketSegment === rule.marketSegment)?.regulatorPct ?? rule.regulatorPct),
            exchangePct: toNum(regulatoryFeeSchedule?.rules.find((item) => item.assetClass === rule.assetClass && item.marketSegment === rule.marketSegment)?.exchangePct ?? rule.exchangePct),
            csdPct: toNum(regulatoryFeeSchedule?.rules.find((item) => item.assetClass === rule.assetClass && item.marketSegment === rule.marketSegment)?.csdPct ?? rule.csdPct),
            minimumFee: toNum(rule.minimumFee),
            maximumFee: rule.maximumFee ? toNum(rule.maximumFee) : null,
          })),
          feeScheduleVersion: broker.feeSchedules[0]?.version ?? "legacy",
          feeScheduleEffectiveFrom: broker.feeSchedules[0]?.effectiveFrom.toISOString().slice(0, 10) ?? null,
          regulatoryFeeScheduleVersion: regulatoryFeeSchedule?.version ?? "legacy",
        },
      },
      instruments: broker.instrumentAccess.map(({ instrument }) => ({
        id: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        assetClass: instrument.assetClass,
        issuer: instrument.issuer,
        status: instrument.tradingStatus,
        currency: instrument.currency,
        price: toNum(instrument.lastPrice),
        lotSize: instrument.lotSize,
        tickSize: toNum(instrument.tickSize),
        settlementCycle: instrument.settlementCycle,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = resolveActor(request);
    if (actor.role !== "broker_admin") return Response.json({ error: "Broker administrator access is required." }, { status: 403 });
    const payload = await request.json() as { action?: string; version?: string; effectiveFrom?: string; rules?: Array<Record<string, unknown>> };
    if (payload.action !== "brokerage_fee_schedule") return Response.json({ error: "Unsupported tenant configuration action." }, { status: 400 });
    const version = String(payload.version ?? "").trim();
    const effectiveFrom = String(payload.effectiveFrom ?? "");
    const rules = Array.isArray(payload.rules) ? payload.rules : [];
    if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !rules.length) {
      return Response.json({ error: "Version, effective date, and brokerage rules are required." }, { status: 400 });
    }
    const normalized = rules.map((rule) => ({
      assetClass: String(rule.assetClass ?? ""),
      marketSegment: String(rule.marketSegment ?? "main"),
      brokeragePct: Number(rule.brokeragePct),
      minimumFee: Number(rule.minimumFee),
      maximumFee: rule.maximumFee === null || rule.maximumFee === "" || rule.maximumFee === undefined ? null : Number(rule.maximumFee),
    }));
    if (normalized.some((rule) => !["equity", "bond"].includes(rule.assetClass) || !Number.isFinite(rule.brokeragePct) || rule.brokeragePct < 0 || !Number.isFinite(rule.minimumFee) || rule.minimumFee < 0 || (rule.maximumFee !== null && (!Number.isFinite(rule.maximumFee) || rule.maximumFee < rule.minimumFee)))) {
      return Response.json({ error: "Enter valid non-negative brokerage rates and fee limits." }, { status: 400 });
    }
    const existing = await prisma.feeSchedule.findUnique({ where: { brokerId_version: { brokerId: actor.brokerId, version } } });
    if (existing && existing.effectiveFrom.toISOString().slice(0, 10) !== effectiveFrom) {
      return Response.json({ error: "Use a new brokerage fee version when changing the effective date." }, { status: 409 });
    }
    const id = existing?.id ?? `fees_${actor.brokerId}_${version.replaceAll(".", "_")}`;
    const effectiveDate = new Date(`${effectiveFrom}T00:00:00.000Z`);
    const priorEffectiveTo = new Date(effectiveDate.getTime() - 24 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.feeSchedule.updateMany({ where: { brokerId: actor.brokerId, status: "published", id: { not: id }, effectiveFrom: { lt: effectiveDate } }, data: { effectiveTo: priorEffectiveTo } });
      await tx.feeSchedule.updateMany({ where: { brokerId: actor.brokerId, status: "published", id: { not: id }, effectiveFrom: { gte: effectiveDate } }, data: { status: "archived" } });
      await tx.feeSchedule.upsert({
        where: { id },
        update: { name: "Brokerage commission schedule", version, status: "published", effectiveFrom: effectiveDate, effectiveTo: null },
        create: { id, brokerId: actor.brokerId, name: "Brokerage commission schedule", version, status: "published", effectiveFrom: effectiveDate },
      });
      await tx.feeRule.deleteMany({ where: { feeScheduleId: id } });
      await tx.feeRule.createMany({ data: normalized.map((rule) => ({ id: crypto.randomUUID(), feeScheduleId: id, ...rule, regulatorPct: 0, exchangePct: 0, csdPct: 0 })) });
      const primary = normalized.find((rule) => rule.assetClass === "equity") ?? normalized[0];
      await tx.brokerSettings.update({ where: { brokerId: actor.brokerId }, data: { brokerageFeePct: primary.brokeragePct, minimumFee: primary.minimumFee } });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(), brokerId: actor.brokerId, actorId: actor.id, action: "BROKERAGE_FEE_SCHEDULE_PUBLISHED",
        entityType: "fee_schedule", entityId: id, summary: `Brokerage commission schedule version ${version} published by the tenant`,
        newValue: JSON.stringify({ version, effectiveFrom, rules: normalized }),
      } });
    });
    return Response.json({ feeSchedule: { id, version, effectiveFrom } });
  } catch (error) {
    return apiError(error);
  }
}
