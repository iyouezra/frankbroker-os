import { Prisma } from "../../../../app/generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import { toNum } from "../../../../lib/money";
import { requirePlatformAdmin } from "../../../../lib/server-auth";
import { apiError as routeError } from "../../../../lib/api";
import { addisBusinessDate, addisDayStart } from "../../../../lib/addis-date";

export const runtime = "nodejs";

const roleToUi: Record<string, string> = {
  access_admin: "Access admin", broker_admin: "Broker admin", trader: "Trader", operations: "Operations", compliance: "Compliance",
  settlement: "Settlement", relationship_officer: "Relationship", service_officer: "Client service", advisory_lead: "Advisory lead", advisory_analyst: "Advisory analyst", management: "Read only",
};
const title = (value: string) => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const validDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateOnly(value).getTime()) && dateOnly(value).toISOString().slice(0, 10) === value;
const dayBefore = (value: Date) => new Date(value.getTime() - 24 * 60 * 60 * 1000);
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const businessTypes = ["securities_dealer", "investment_bank", "securities_investment_adviser"] as const;
const tenantModules = ["dealer_operations", "investor_servicing", "issuer_advisory"] as const;
const integrationDefaults = [
  { key: "fayda", name: "Fayda eKYC", description: "Identity and consent verification" },
  { key: "esx", name: "ESX order gateway", description: "Order routing and execution reports" },
  { key: "csd", name: "CSD settlement", description: "Holdings and settlement instructions" },
  { key: "bank", name: "Cash settlement bank", description: "Funding and cash confirmations" },
  { key: "notify", name: "SMS and email", description: "Investor alerts and confirmations" },
];

function audit(brokerId: string | null, action: string, entityType: string, entityId: string, summary: string, previousValue?: unknown, newValue?: unknown) {
  return prisma.auditLog.create({ data: {
    id: crypto.randomUUID(), brokerId, actorId: null, action, entityType, entityId, summary,
    previousValue: previousValue ? JSON.stringify(previousValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
  } });
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const start = addisDayStart();
    const [brokers, instruments, auditRows, platformFeeSchedule, platformTaxSchedule, checklistTemplates] = await Promise.all([
      prisma.broker.findMany({
        include: {
          settings: true,
          tenantProfile: true,
          tenantLicenses: { orderBy: { createdAt: "asc" } },
          tenantEntitlements: { where: { status: "active" } },
          tenantModules: true,
          tenantChecklistPacks: true,
          users: { orderBy: { fullName: "asc" } },
          clients: { include: { accounts: { include: { holdings: { include: { instrument: true } } } } } },
          orders: { where: { submittedAt: { gte: start } } },
          integrations: { orderBy: { name: "asc" } },
          legalDocuments: {
            where: { documentType: "brokerage_terms", status: "published" },
            orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
            take: 1,
          },
          feeSchedules: {
            where: { status: "published" },
            include: { rules: true },
            orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.instrument.findMany({ include: { brokerAccess: true }, orderBy: { symbol: "asc" } }),
      prisma.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.platformFeeSchedule.findFirst({
        where: { status: "published" },
        include: { rules: true },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      prisma.platformTaxSchedule.findFirst({
        where: { status: "published" },
        include: { rules: { orderBy: [{ appliesTo: "asc" }, { assetClass: "asc" }] } },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      prisma.checklistTemplate.findMany({ where: { status: "published" }, orderBy: [{ transactionType: "asc" }, { marketSegment: "asc" }] }),
    ]);

    const tenants = brokers.map((broker) => {
      const settings = broker.settings;
      const legalDocument = broker.legalDocuments[0];
      const feeSchedule = broker.feeSchedules[0];
      const aua = broker.clients.reduce((clientTotal, client) => clientTotal + client.accounts.reduce((accountTotal, account) => {
        const securities = account.holdings.reduce((total, holding) => total + toNum(holding.totalQuantity) * toNum(holding.instrument.lastPrice), 0);
        return accountTotal + toNum(account.totalCash) + securities;
      }, 0), 0);
      return {
        id: broker.id,
        name: broker.name,
        tradingName: settings?.tradingName ?? broker.name,
        initials: initials(settings?.tradingName ?? broker.name),
        licenseNumber: broker.licenseNumber,
        status: broker.status,
        plan: settings?.plan ?? "Pilot",
        domain: settings?.domain ?? "",
        supportEmail: settings?.supportEmail ?? "",
        primaryColor: settings?.primaryColor ?? "#0C8189",
        welcomeMessage: settings?.welcomeMessage ?? "",
        baseCurrency: broker.baseCurrency,
        timezone: settings?.timezone ?? "Africa/Addis_Ababa",
        businessDate: addisBusinessDate(),
        users: broker.users.length,
        clients: broker.clients.length,
        ordersToday: broker.orders.length,
        assetsUnderAdministration: aua,
        features: settings?.features ?? {},
        businessType: broker.tenantProfile?.businessType ?? "securities_dealer",
        licenses: broker.tenantLicenses.map((item) => ({ id: item.id, regulator: item.regulator, licenseType: item.licenseType, licenseNumber: item.licenseNumber, status: item.status, validFrom: item.validFrom?.toISOString().slice(0, 10) ?? null, validTo: item.validTo?.toISOString().slice(0, 10) ?? null })),
        entitlements: broker.tenantEntitlements.map((item) => item.activityKey),
        modules: Object.fromEntries(["dealer_operations", "investor_servicing", "issuer_advisory"].map((key) => [key, broker.tenantModules.find((item) => item.moduleKey === key)?.enabled ?? (key !== "issuer_advisory")])),
        checklistPacks: checklistTemplates.map((template) => ({ templateId: template.id, code: template.code, version: template.version, transactionType: template.transactionType, marketSegment: template.marketSegment, title: template.title, enabled: broker.tenantChecklistPacks.some((pack) => pack.templateId === template.id && pack.enabled) })),
        controls: {
          makerChecker: settings?.makerChecker ?? true,
          approvalThreshold: toNum(settings?.approvalThreshold),
          clientDailyLimit: toNum(settings?.clientDailyLimit),
          brokerageFeePct: toNum(settings?.brokerageFeePct),
          minimumFee: toNum(settings?.minimumFee),
          settlementCycle: settings?.settlementCycle ?? "T+2",
          allowedOrderTypes: settings?.allowedOrderTypes ?? ["Limit"],
          requireTermsAcceptance: settings?.requireTermsAcceptance ?? true,
          discrepancyWindowDays: settings?.discrepancyWindowDays ?? 10,
          kycReviewMonths: settings?.kycReviewMonths ?? 12,
        },
        legalDocument: legalDocument ? {
          id: legalDocument.id,
          title: legalDocument.title,
          version: legalDocument.version,
          language: legalDocument.language,
          summary: legalDocument.summary,
          content: legalDocument.content,
          status: legalDocument.status,
          effectiveAt: legalDocument.effectiveAt.toISOString().slice(0, 10),
          requiresReacceptance: legalDocument.requiresReacceptance,
        } : {
          title: `${settings?.tradingName ?? broker.name} Brokerage Account Terms`,
          version: "1.0",
          language: "en",
          summary: "Account operation, order handling, fees, confirmations, settlement, and closure terms.",
          content: "Add counsel-approved tenant brokerage terms before production.",
          status: "draft",
          effectiveAt: addisBusinessDate(),
          requiresReacceptance: true,
        },
        feeSchedule: feeSchedule ? {
          id: feeSchedule.id,
          name: feeSchedule.name,
          version: feeSchedule.version,
          status: feeSchedule.status,
          effectiveFrom: feeSchedule.effectiveFrom.toISOString().slice(0, 10),
          rules: feeSchedule.rules.map((rule) => ({
            assetClass: rule.assetClass,
            marketSegment: rule.marketSegment,
            brokeragePct: toNum(rule.brokeragePct),
            regulatorPct: toNum(rule.regulatorPct),
            exchangePct: toNum(rule.exchangePct),
            csdPct: toNum(rule.csdPct),
            minimumFee: toNum(rule.minimumFee),
            maximumFee: rule.maximumFee ? toNum(rule.maximumFee) : null,
          })),
        } : {
          name: "Standard ESX fee schedule",
          version: "1.0",
          status: "draft",
          effectiveFrom: addisBusinessDate(),
          rules: ["equity", "bond"].map((assetClass) => ({
            assetClass,
            marketSegment: "main",
            brokeragePct: toNum(settings?.brokerageFeePct),
            regulatorPct: 0,
            exchangePct: 0,
            csdPct: 0,
            minimumFee: toNum(settings?.minimumFee),
            maximumFee: null,
          })),
        },
      };
    });
    const users = brokers.flatMap((broker) => broker.users.map((user) => ({
      id: user.id, tenantId: broker.id, employeeId: user.employeeId ?? "—", name: user.fullName, email: user.email,
      jobTitle: user.jobTitle ?? "", department: user.department ?? "",
      role: roleToUi[user.role] ?? title(user.role), status: title(user.status), mfa: user.mfaEnabled,
      lastActive: user.lastLoginAt ? user.lastLoginAt.toISOString() : "Not yet",
    })));
    const integrations = brokers.flatMap((broker) => broker.integrations.map((item) => ({
      id: item.id, tenantId: broker.id, name: item.name, description: item.description,
      status: title(item.status), mode: title(item.mode),
    })));

    return Response.json({
      tenants,
      platformFeeSchedule: platformFeeSchedule ? {
        id: platformFeeSchedule.id,
        name: platformFeeSchedule.name,
        version: platformFeeSchedule.version,
        status: platformFeeSchedule.status,
        effectiveFrom: platformFeeSchedule.effectiveFrom.toISOString().slice(0, 10),
        rules: platformFeeSchedule.rules.map((rule) => ({
          assetClass: rule.assetClass,
          marketSegment: rule.marketSegment,
          regulatorPct: toNum(rule.regulatorPct),
          exchangePct: toNum(rule.exchangePct),
          csdPct: toNum(rule.csdPct),
        })),
      } : null,
      platformTaxSchedule: platformTaxSchedule ? {
        id: platformTaxSchedule.id,
        name: platformTaxSchedule.name,
        version: platformTaxSchedule.version,
        status: platformTaxSchedule.status,
        effectiveFrom: platformTaxSchedule.effectiveFrom.toISOString().slice(0, 10),
        legalReference: platformTaxSchedule.legalReference,
        evidenceReference: (platformTaxSchedule.sourceEvidence as { evidenceReference?: string } | null)?.evidenceReference ?? "",
        rules: platformTaxSchedule.rules.map((rule) => ({
          appliesTo: rule.appliesTo,
          assetClass: rule.assetClass,
          ratePct: toNum(rule.ratePct),
          calculationBasis: rule.calculationBasis,
          collectionMethod: rule.collectionMethod,
          inflationAdjustmentPct: toNum(rule.inflationAdjustmentPct),
        })),
      } : null,
      instruments: instruments.map((item) => ({
        id: item.id, symbol: item.symbol, name: item.name,
        assetClass: item.assetClass === "bond" ? "Government bond" : "Equity",
        status: title(item.tradingStatus), lotSize: item.lotSize, tickSize: toNum(item.tickSize),
        settlementCycle: item.settlementCycle,
        enabledTenantIds: item.brokerAccess.filter((access) => access.enabled).map((access) => access.brokerId),
      })),
      users,
      integrations,
      audit: auditRows.map((item) => ({
        id: item.id, tenantId: item.brokerId ?? "platform", time: item.createdAt.toISOString(),
        actor: item.actor?.fullName ?? "Platform admin", action: title(item.action), detail: item.summary,
      })),
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const payload = await request.json() as { entity?: string; id?: string; tenantId?: string; data?: Record<string, unknown> };
    if (!payload.entity || !payload.id || !payload.data) return Response.json({ error: "entity, id, and data are required." }, { status: 400 });

    if (payload.entity === "tenant") {
      const tenantId = payload.id;
      const current = await prisma.broker.findUnique({ where: { id: tenantId }, include: { settings: true } });
      if (!current) return Response.json({ error: "Tenant not found." }, { status: 404 });
      const data = payload.data;
      const controls = (data.controls ?? {}) as Record<string, unknown>;
      const modules = (data.modules ?? {}) as Record<string, unknown>;
      const entitlements = Array.isArray(data.entitlements) ? data.entitlements.map(String) : [];
      const businessType = String(data.businessType ?? "");
      const status = String(data.status ?? "");
      const businessDate = addisBusinessDate();
      const numericControls = {
        approvalThreshold: Number(controls.approvalThreshold),
        clientDailyLimit: Number(controls.clientDailyLimit),
        brokerageFeePct: Number(controls.brokerageFeePct),
        minimumFee: Number(controls.minimumFee),
        discrepancyWindowDays: Number(controls.discrepancyWindowDays),
        kycReviewMonths: Number(controls.kycReviewMonths),
      };
      const settlementCycle = String(controls.settlementCycle ?? "");
      const allowedOrderTypes = Array.isArray(controls.allowedOrderTypes) ? controls.allowedOrderTypes.map(String) : [];
      if (!businessTypes.includes(businessType as typeof businessTypes[number]) || !["active", "pilot", "suspended"].includes(status)) {
        return Response.json({ error: "Select a valid tenant profile and status." }, { status: 400 });
      }
      if (Object.values(numericControls).some((value) => !Number.isFinite(value) || value < 0)
        || !Number.isInteger(numericControls.discrepancyWindowDays) || numericControls.discrepancyWindowDays > 365
        || !Number.isInteger(numericControls.kycReviewMonths) || numericControls.kycReviewMonths < 1 || numericControls.kycReviewMonths > 120) {
        return Response.json({ error: "Tenant limits, fees, and review periods must be valid non-negative values." }, { status: 400 });
      }
      if (!['T+1', 'T+2', 'T+3'].includes(settlementCycle) || !allowedOrderTypes.length || allowedOrderTypes.some((item) => !['Market', 'Limit', 'Stop-loss'].includes(item))) {
        return Response.json({ error: "Select valid settlement and order-type controls." }, { status: 400 });
      }
      if ((modules.dealer_operations === true || modules.investor_servicing === true) && !entitlements.includes("securities_dealing")) return Response.json({ error: "Dealer operations and investor servicing require the securities dealing entitlement." }, { status: 400 });
      if (modules.issuer_advisory === true && !entitlements.includes("transaction_advisory")) return Response.json({ error: "Issuer advisory requires the transaction advisory entitlement." }, { status: 400 });
      await prisma.$transaction(async (tx) => {
        await tx.broker.update({ where: { id: tenantId }, data: {
          name: String(data.name), licenseNumber: String(data.licenseNumber), status, baseCurrency: "ETB",
        } });
        await tx.brokerSettings.upsert({ where: { brokerId: tenantId }, update: {
          tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""), supportEmail: String(data.supportEmail ?? ""),
          primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""), timezone: String(data.timezone), businessDate: dateOnly(businessDate),
          features: data.features as Prisma.InputJsonValue, makerChecker: Boolean(controls.makerChecker), approvalThreshold: numericControls.approvalThreshold,
          clientDailyLimit: numericControls.clientDailyLimit, brokerageFeePct: numericControls.brokerageFeePct, minimumFee: numericControls.minimumFee,
          settlementCycle, allowedOrderTypes: allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: numericControls.discrepancyWindowDays,
          kycReviewMonths: numericControls.kycReviewMonths,
        }, create: {
          id: `set_${tenantId}`, brokerId: tenantId, tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""),
          supportEmail: String(data.supportEmail ?? ""), primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""),
          timezone: String(data.timezone), businessDate: dateOnly(businessDate), features: data.features as Prisma.InputJsonValue,
          makerChecker: Boolean(controls.makerChecker), approvalThreshold: numericControls.approvalThreshold, clientDailyLimit: numericControls.clientDailyLimit,
          brokerageFeePct: numericControls.brokerageFeePct, minimumFee: numericControls.minimumFee, settlementCycle,
          allowedOrderTypes: allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: numericControls.discrepancyWindowDays,
          kycReviewMonths: numericControls.kycReviewMonths,
        } });
        await tx.tenantProfile.upsert({ where: { tenantId }, update: { businessType }, create: { tenantId, businessType } });
        await tx.tenantLicense.deleteMany({ where: { tenantId } });
        const licenses = Array.isArray(data.licenses) ? data.licenses as Array<Record<string, unknown>> : [];
        if (licenses.length) await tx.tenantLicense.createMany({ data: licenses.map((item) => ({ id: String(item.id ?? crypto.randomUUID()), tenantId, regulator: String(item.regulator ?? "ECMA"), licenseType: String(item.licenseType ?? ""), licenseNumber: String(item.licenseNumber ?? ""), status: String(item.status ?? "active"), validFrom: item.validFrom ? dateOnly(String(item.validFrom)) : null, validTo: item.validTo ? dateOnly(String(item.validTo)) : null })) });
        await tx.tenantEntitlement.deleteMany({ where: { tenantId } });
        if (entitlements.length) await tx.tenantEntitlement.createMany({ data: entitlements.map((activityKey) => ({ id: crypto.randomUUID(), tenantId, activityKey, basis: "Platform-admin configured", status: "active" })) });
        for (const moduleKey of ["dealer_operations", "investor_servicing", "issuer_advisory"]) await tx.tenantModule.upsert({ where: { tenantId_moduleKey: { tenantId, moduleKey } }, update: { enabled: modules[moduleKey] === true }, create: { id: crypto.randomUUID(), tenantId, moduleKey, enabled: modules[moduleKey] === true } });
        const packs = Array.isArray(data.checklistPacks) ? data.checklistPacks as Array<Record<string, unknown>> : [];
        for (const pack of packs) await tx.tenantChecklistPack.upsert({ where: { tenantId_templateId: { tenantId, templateId: String(pack.templateId) } }, update: { enabled: pack.enabled === true }, create: { id: crypto.randomUUID(), tenantId, templateId: String(pack.templateId), enabled: pack.enabled === true } });
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: tenantId, actorId: null, action: "TENANT_CONFIGURATION_UPDATED", entityType: "broker", entityId: tenantId, summary: `${String(data.tradingName)} configuration updated`, previousValue: JSON.stringify(current), newValue: JSON.stringify(data) } });
      });
      return Response.json({ ok: true });
    }

    if (payload.entity === "instrument") {
      if (typeof payload.data.status === "string") {
        const tradingStatus = payload.data.status.toLowerCase();
        if (!["tradable", "halted", "disabled"].includes(tradingStatus)) return Response.json({ error: "Select a valid instrument status." }, { status: 400 });
        await prisma.instrument.update({ where: { id: payload.id }, data: { tradingStatus } });
      }
      if (payload.tenantId && typeof payload.data.enabled === "boolean") {
        await prisma.brokerInstrument.upsert({
          where: { brokerId_instrumentId: { brokerId: payload.tenantId, instrumentId: payload.id } },
          update: { enabled: payload.data.enabled },
          create: { id: `bri_${payload.tenantId}_${payload.id}`, brokerId: payload.tenantId, instrumentId: payload.id, enabled: payload.data.enabled },
        });
      }
      await audit(payload.tenantId ?? null, "INSTRUMENT_ACCESS_UPDATED", "instrument", payload.id, `${payload.id} availability updated`, null, payload.data);
      return Response.json({ ok: true });
    }

    if (payload.entity === "user") {
      const current = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!current) return Response.json({ error: "User not found." }, { status: 404 });
      const action = String(payload.data.action ?? "");
      const reason = String(payload.data.reason ?? "").trim();
      if (action !== "emergency_suspend" || reason.length < 5) return Response.json({ error: "Platform users may only perform a reasoned emergency suspension. Routine access is broker-managed." }, { status: 403 });
      const user = await prisma.user.update({ where: { id: payload.id }, data: { status: "suspended", deactivatedAt: new Date() } });
      await prisma.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: user.brokerId, actorId: null, action: "PLATFORM_EMERGENCY_USER_SUSPENSION", entityType: "user", entityId: user.id, summary: `${user.fullName} access emergency-suspended by Frank`, reason } });
      return Response.json({ ok: true });
    }

    if (payload.entity === "integration") {
      const integration = await prisma.tenantIntegration.update({ where: { id: payload.id }, data: {
        status: String(payload.data.status ?? "Not connected").toLowerCase().replaceAll(" ", "_"),
        mode: String(payload.data.mode ?? "Manual").toLowerCase(),
      } });
      await audit(integration.brokerId, "INTEGRATION_UPDATED", "integration", integration.id, `${integration.name} configuration updated`, null, payload.data);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unsupported entity." }, { status: 400 });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const payload = await request.json() as { entity?: string; data?: Record<string, unknown> };
    if (!payload.data) return Response.json({ error: "Configuration data is required." }, { status: 400 });
    const data = payload.data;
    if (payload.entity === "tenant") {
      const tenantCode = String(data.tenantCode ?? "").trim().toLowerCase();
      const brokerId = `brk_${tenantCode}`;
      const name = String(data.name ?? "").trim();
      const tradingName = String(data.tradingName ?? "").trim();
      const licenseNumber = String(data.licenseNumber ?? "").trim().toUpperCase();
      const businessType = String(data.businessType ?? "");
      const licenseValidFrom = String(data.licenseValidFrom ?? "");
      const supportEmail = String(data.supportEmail ?? "").trim().toLowerCase();
      const domain = String(data.domain ?? "").trim().toLowerCase();
      const plan = String(data.plan ?? "Pilot");
      const entitlements = Array.isArray(data.entitlements) ? [...new Set(data.entitlements.map(String))] : [];
      const modules = (data.modules ?? {}) as Record<string, unknown>;
      const features = (data.features ?? {}) as Record<string, unknown>;
      const controls = (data.controls ?? {}) as Record<string, unknown>;
      if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(tenantCode)) return Response.json({ error: "Tenant code must be 3–30 lowercase letters, numbers, or underscores." }, { status: 400 });
      if (name.length < 3 || tradingName.length < 2 || licenseNumber.length < 4) return Response.json({ error: "Legal name, trading name, and primary licence number are required." }, { status: 400 });
      if (!businessTypes.includes(businessType as typeof businessTypes[number])) return Response.json({ error: "Select a supported regulated business profile." }, { status: 400 });
      if (!validDateOnly(licenseValidFrom)) return Response.json({ error: "Enter the licence valid-from date." }, { status: 400 });
      if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return Response.json({ error: "Enter a valid support email." }, { status: 400 });
      if (domain && !/^[a-z0-9.-]+$/.test(domain)) return Response.json({ error: "Enter a valid portal domain without a protocol or path." }, { status: 400 });
      if (!["Enterprise", "Growth", "Pilot"].includes(plan)) return Response.json({ error: "Select a supported tenant plan." }, { status: 400 });
      if ((modules.dealer_operations === true || modules.investor_servicing === true) && !entitlements.includes("securities_dealing")) return Response.json({ error: "Dealer operations and investor servicing require the securities dealing entitlement." }, { status: 400 });
      if (modules.issuer_advisory === true && !entitlements.includes("transaction_advisory")) return Response.json({ error: "Issuer advisory requires the transaction advisory entitlement." }, { status: 400 });
      if (businessType === "securities_investment_adviser" && (modules.dealer_operations === true || modules.investor_servicing === true)) return Response.json({ error: "An investment-adviser licence cannot enable dealer operations or investor servicing." }, { status: 400 });
      const numericControls = {
        approvalThreshold: Number(controls.approvalThreshold ?? 250000),
        clientDailyLimit: Number(controls.clientDailyLimit ?? 2500000),
        brokerageFeePct: Number(controls.brokerageFeePct ?? .5),
        minimumFee: Number(controls.minimumFee ?? 25),
      };
      const settlementCycle = String(controls.settlementCycle ?? "T+2");
      const allowedOrderTypes = Array.isArray(controls.allowedOrderTypes) ? controls.allowedOrderTypes.map(String) : ["Limit"];
      if (Object.values(numericControls).some((value) => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Tenant limits and brokerage defaults must be valid non-negative numbers." }, { status: 400 });
      if (!['T+1', 'T+2', 'T+3'].includes(settlementCycle) || !allowedOrderTypes.length || allowedOrderTypes.some((item) => !['Market', 'Limit', 'Stop-loss'].includes(item))) return Response.json({ error: "Select valid settlement and order-type defaults." }, { status: 400 });
      const duplicate = await prisma.broker.findFirst({ where: { OR: [{ id: brokerId }, { licenseNumber }] }, select: { id: true, licenseNumber: true } });
      if (duplicate) return Response.json({ error: duplicate.id === brokerId ? "That tenant code is already in use." : "That primary licence number is already assigned to a tenant." }, { status: 409 });
      if (domain) {
        const duplicateDomain = await prisma.brokerSettings.findFirst({ where: { domain }, select: { brokerId: true } });
        if (duplicateDomain) return Response.json({ error: "That investor portal domain is already assigned to a tenant." }, { status: 409 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.broker.create({ data: { id: brokerId, name, licenseNumber, status: "pilot", baseCurrency: "ETB" } });
        await tx.brokerSettings.create({ data: {
          id: `set_${brokerId}`, brokerId, tradingName, plan, domain: domain || null, supportEmail: supportEmail || null,
          primaryColor: String(data.primaryColor ?? "#0C8189"), welcomeMessage: String(data.welcomeMessage ?? ""), timezone: "Africa/Addis_Ababa",
          businessDate: dateOnly(addisBusinessDate()), features: features as Prisma.InputJsonValue,
          makerChecker: controls.makerChecker !== false, approvalThreshold: numericControls.approvalThreshold, clientDailyLimit: numericControls.clientDailyLimit,
          brokerageFeePct: numericControls.brokerageFeePct, minimumFee: numericControls.minimumFee,
          settlementCycle, allowedOrderTypes: allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12,
        } });
        await tx.tenantProfile.create({ data: { tenantId: brokerId, businessType } });
        await tx.tenantLicense.create({ data: { id: `lic_${brokerId}`, tenantId: brokerId, regulator: "ECMA", licenseType: businessType, licenseNumber, status: "active", validFrom: dateOnly(licenseValidFrom) } });
        if (entitlements.length) await tx.tenantEntitlement.createMany({ data: entitlements.map((activityKey) => ({ id: crypto.randomUUID(), tenantId: brokerId, activityKey, basis: licenseNumber, status: "active" })) });
        await tx.tenantModule.createMany({ data: tenantModules.map((moduleKey) => ({ id: crypto.randomUUID(), tenantId: brokerId, moduleKey, enabled: modules[moduleKey] === true })) });
        await tx.tenantIntegration.createMany({ data: integrationDefaults.map((item) => ({ id: `${brokerId}-${item.key}`, brokerId, ...item, status: "not_connected", mode: "manual" })) });
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId, actorId: null, action: "TENANT_CREATED", entityType: "broker", entityId: brokerId, summary: `${tradingName} created in pilot status`, newValue: JSON.stringify({ tenantCode, name, tradingName, licenseNumber, businessType, entitlements, modules, plan }) } });
      });
      return Response.json({ tenant: { id: brokerId } }, { status: 201 });
    }
    if (payload.entity === "instrument") {
      const symbol = String(data.symbol ?? "").trim().toUpperCase();
      const id = `ins_${symbol.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")}`;
      const name = String(data.name ?? "").trim();
      const issuer = String(data.issuer ?? "").trim();
      const assetClass = String(data.assetClass ?? "");
      const marketSegment = String(data.marketSegment ?? "main").trim().toLowerCase();
      const tradingStatus = String(data.status ?? "halted").trim().toLowerCase();
      const lotSize = Number(data.lotSize);
      const tickSize = Number(data.tickSize);
      const lastPrice = Number(data.lastPrice);
      const settlementCycle = String(data.settlementCycle ?? "T+2");
      const enabledTenantIds = Array.isArray(data.enabledTenantIds) ? [...new Set(data.enabledTenantIds.map(String))] : [];
      if (!/^[A-Z0-9][A-Z0-9.-]{1,15}$/.test(symbol)) return Response.json({ error: "Symbol must be 2–16 uppercase letters, numbers, dots, or hyphens." }, { status: 400 });
      if (name.length < 2 || issuer.length < 2) return Response.json({ error: "Instrument name and issuer are required." }, { status: 400 });
      if (!['equity', 'bond'].includes(assetClass) || !/^[a-z0-9_-]{2,30}$/.test(marketSegment)) return Response.json({ error: "Select a supported asset class and market segment." }, { status: 400 });
      if (!['halted', 'tradable'].includes(tradingStatus) || !['T+1', 'T+2', 'T+3'].includes(settlementCycle)) return Response.json({ error: "Select a valid initial status and settlement cycle." }, { status: 400 });
      if (!Number.isInteger(lotSize) || lotSize <= 0 || !Number.isFinite(tickSize) || tickSize <= 0 || !Number.isFinite(lastPrice) || lastPrice <= 0) return Response.json({ error: "Lot size, tick size, and reference price must be positive numbers." }, { status: 400 });
      const faceValue = data.faceValue === "" || data.faceValue === null || data.faceValue === undefined ? null : Number(data.faceValue);
      const couponRate = data.couponRate === "" || data.couponRate === null || data.couponRate === undefined ? null : Number(data.couponRate);
      const maturityDate = String(data.maturityDate ?? "");
      const couponFrequency = String(data.couponFrequency ?? "semi_annual");
      if (assetClass === "bond" && ((!Number.isFinite(faceValue) || (faceValue ?? 0) <= 0) || !validDateOnly(maturityDate) || !Number.isFinite(couponRate) || (couponRate ?? -1) < 0 || !['annual', 'semi_annual', 'quarterly'].includes(couponFrequency))) return Response.json({ error: "Bonds require a positive face value, maturity date, non-negative coupon rate, and supported coupon frequency." }, { status: 400 });
      const duplicate = await prisma.instrument.findFirst({ where: { OR: [{ id }, { symbol }] }, select: { id: true } });
      if (duplicate) return Response.json({ error: "That instrument symbol is already in the master catalogue." }, { status: 409 });
      if (enabledTenantIds.length) {
        const tenantCount = await prisma.broker.count({ where: { id: { in: enabledTenantIds } } });
        if (tenantCount !== enabledTenantIds.length) return Response.json({ error: "One or more selected tenants no longer exist." }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.instrument.create({ data: {
          id, symbol, name, issuer, assetClass, sector: String(data.sector ?? "").trim() || null, marketSegment,
          tradingStatus, currency: "ETB", lotSize, tickSize, settlementCycle, lastPrice,
          faceValue: assetClass === "bond" ? faceValue : null,
          maturityDate: assetClass === "bond" ? dateOnly(maturityDate) : null,
          couponRate: assetClass === "bond" ? couponRate : null,
          couponFrequency: assetClass === "bond" ? couponFrequency : null,
        } });
        if (enabledTenantIds.length) await tx.brokerInstrument.createMany({ data: enabledTenantIds.map((brokerId) => ({ id: `bri_${brokerId}_${id}`, brokerId, instrumentId: id, enabled: true })) });
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: null, actorId: null, action: "INSTRUMENT_CREATED", entityType: "instrument", entityId: id, summary: `${symbol} added to the instrument master in ${tradingStatus} status`, newValue: JSON.stringify({ symbol, name, issuer, assetClass, marketSegment, tradingStatus, lotSize, tickSize, settlementCycle, enabledTenantIds }) } });
      });
      return Response.json({ instrument: { id } }, { status: 201 });
    }
    if (payload.entity === "legal_document") {
      const brokerId = String(data.brokerId ?? "");
      const version = String(data.version ?? "").trim();
      const titleText = String(data.title ?? "").trim();
      const content = String(data.content ?? "").trim();
      const effectiveAt = String(data.effectiveAt ?? "");
      if (!brokerId || !version || !titleText || content.length < 40 || !validDateOnly(effectiveAt)) {
        return Response.json({ error: "Tenant, version, title, and complete legal text are required." }, { status: 400 });
      }
      const id = String(data.id ?? `legal_${brokerId}_${version.replaceAll(".", "_")}`);
      await prisma.$transaction(async (tx) => {
        await tx.legalDocument.updateMany({
          where: { brokerId, documentType: "brokerage_terms", status: "published", id: { not: id } },
          data: { status: "archived" },
        });
        await tx.legalDocument.upsert({
          where: { id },
          update: {
            title: titleText,
            version,
            language: String(data.language ?? "en"),
            summary: String(data.summary ?? ""),
            content,
            status: "published",
            effectiveAt: dateOnly(effectiveAt),
            publishedAt: new Date(),
            requiresReacceptance: data.requiresReacceptance !== false,
          },
          create: {
            id,
            brokerId,
            documentType: "brokerage_terms",
            title: titleText,
            version,
            language: String(data.language ?? "en"),
            summary: String(data.summary ?? ""),
            content,
            status: "published",
            effectiveAt: dateOnly(effectiveAt),
            publishedAt: new Date(),
            requiresReacceptance: data.requiresReacceptance !== false,
          },
        });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "LEGAL_DOCUMENT_PUBLISHED",
          entityType: "legal_document", entityId: id, summary: `${titleText} version ${version} published`,
          newValue: JSON.stringify({ version, effectiveAt: data.effectiveAt }),
        } });
      });
      return Response.json({ legalDocument: { id } }, { status: 201 });
    }
    if (payload.entity === "fee_schedule") {
      const brokerId = String(data.brokerId ?? "");
      const version = String(data.version ?? "").trim();
      const rules = Array.isArray(data.rules) ? data.rules as Array<Record<string, unknown>> : [];
      const effectiveFrom = String(data.effectiveFrom ?? "");
      const normalized = rules.map((rule) => ({
        assetClass: String(rule.assetClass ?? ""),
        marketSegment: String(rule.marketSegment ?? "main"),
        brokeragePct: Number(rule.brokeragePct ?? 0),
        regulatorPct: Number(rule.regulatorPct ?? 0),
        exchangePct: Number(rule.exchangePct ?? 0),
        csdPct: Number(rule.csdPct ?? 0),
        minimumFee: Number(rule.minimumFee ?? 0),
        maximumFee: rule.maximumFee === null || rule.maximumFee === "" || rule.maximumFee === undefined ? null : Number(rule.maximumFee),
      }));
      if (!brokerId || !version || !validDateOnly(effectiveFrom) || !normalized.length) return Response.json({ error: "Tenant, version, effective date, and at least one fee rule are required." }, { status: 400 });
      if (normalized.some((rule) => !["equity", "bond"].includes(rule.assetClass)
        || !/^[a-z0-9_-]{2,30}$/.test(rule.marketSegment)
        || [rule.brokeragePct, rule.regulatorPct, rule.exchangePct, rule.csdPct, rule.minimumFee].some((value) => !Number.isFinite(value) || value < 0)
        || (rule.maximumFee !== null && (!Number.isFinite(rule.maximumFee) || rule.maximumFee < rule.minimumFee)))) {
        return Response.json({ error: "Fee rules must use supported assets and valid non-negative rates and limits." }, { status: 400 });
      }
      const id = String(data.id ?? `fees_${brokerId}_${version.replaceAll(".", "_")}`);
      await prisma.$transaction(async (tx) => {
        await tx.feeSchedule.updateMany({ where: { brokerId, status: "published", id: { not: id } }, data: { status: "archived" } });
        await tx.feeSchedule.upsert({
          where: { id },
          update: { name: String(data.name ?? "Standard fee schedule"), version, status: "published", effectiveFrom: dateOnly(effectiveFrom), effectiveTo: null },
          create: { id, brokerId, name: String(data.name ?? "Standard fee schedule"), version, status: "published", effectiveFrom: dateOnly(effectiveFrom) },
        });
        await tx.feeRule.deleteMany({ where: { feeScheduleId: id } });
        await tx.feeRule.createMany({ data: normalized.map((rule) => ({
          id: crypto.randomUUID(),
          feeScheduleId: id,
          ...rule,
        })) });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "FEE_SCHEDULE_PUBLISHED",
          entityType: "fee_schedule", entityId: id, summary: `${String(data.name ?? "Fee schedule")} version ${version} published`,
          newValue: JSON.stringify({ version, rules }),
        } });
      });
      return Response.json({ feeSchedule: { id } }, { status: 201 });
    }
    if (payload.entity === "platform_tax_schedule") {
      const version = String(data.version ?? "").trim();
      const effectiveFrom = String(data.effectiveFrom ?? "");
      const legalReference = String(data.legalReference ?? "").trim();
      const evidenceReference = String(data.evidenceReference ?? "").trim();
      const rules = Array.isArray(data.rules) ? data.rules as Array<Record<string, unknown>> : [];
      if (!version || !validDateOnly(effectiveFrom) || legalReference.length < 10 || evidenceReference.length < 5) return Response.json({ error: "Version, effective date, legal reference, and source evidence are required." }, { status: 400 });
      const normalized = rules.map((rule) => ({
        appliesTo: String(rule.appliesTo ?? ""),
        assetClass: String(rule.assetClass ?? ""),
        ratePct: Number(rule.ratePct),
        calculationBasis: String(rule.calculationBasis ?? ""),
        collectionMethod: String(rule.collectionMethod ?? ""),
        inflationAdjustmentPct: Number(rule.inflationAdjustmentPct ?? 0),
      }));
      const expected = new Set(["dividend:equity", "interest:bond", "capital_gain:equity", "capital_gain:bond"]);
      const supplied = new Set(normalized.map((rule) => `${rule.appliesTo}:${rule.assetClass}`));
      const invalid = normalized.some((rule) => !Number.isFinite(rule.ratePct) || rule.ratePct < 0 || rule.ratePct > 100 || !Number.isFinite(rule.inflationAdjustmentPct) || rule.inflationAdjustmentPct < 0 || rule.inflationAdjustmentPct > 100
        || (rule.appliesTo === "capital_gain" ? rule.calculationBasis !== "adjusted_gain" || rule.collectionMethod !== "investor_payable" : rule.calculationBasis !== "gross" || rule.collectionMethod !== "issuer_withheld"));
      if (normalized.length !== expected.size || invalid || [...expected].some((key) => !supplied.has(key))) return Response.json({ error: "Provide equity dividend, bond interest, and equity and bond capital-gain rules with the prescribed collection responsibilities." }, { status: 400 });
      const existing = await prisma.platformTaxSchedule.findUnique({ where: { version } });
      if (existing?.status === "published") return Response.json({ error: "Published tax schedules are immutable. Use a new version for any change." }, { status: 409 });
      if (existing && existing.effectiveFrom.toISOString().slice(0, 10) !== effectiveFrom) return Response.json({ error: "Use a new tax version when changing the effective date." }, { status: 409 });
      const id = existing?.id ?? `platform_tax_${version.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const effectiveDate = dateOnly(effectiveFrom);
      await prisma.$transaction(async (tx) => {
        await tx.platformTaxSchedule.updateMany({ where: { status: "published", id: { not: id }, effectiveFrom: { lt: effectiveDate } }, data: { effectiveTo: dayBefore(effectiveDate) } });
        await tx.platformTaxSchedule.updateMany({ where: { status: "published", id: { not: id }, effectiveFrom: { gte: effectiveDate } }, data: { status: "archived" } });
        await tx.platformTaxSchedule.upsert({ where: { id }, update: { name: String(data.name ?? "Ethiopian investment tax schedule"), version, status: "published", effectiveFrom: effectiveDate, effectiveTo: null, legalReference, sourceEvidence: { evidenceReference } }, create: { id, name: String(data.name ?? "Ethiopian investment tax schedule"), version, status: "published", effectiveFrom: effectiveDate, legalReference, sourceEvidence: { evidenceReference } } });
        await tx.platformTaxRule.deleteMany({ where: { platformTaxScheduleId: id } });
        await tx.platformTaxRule.createMany({ data: normalized.map((rule) => ({ id: crypto.randomUUID(), platformTaxScheduleId: id, ...rule })) });
        await tx.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: null, actorId: null, action: "PLATFORM_TAX_SCHEDULE_PUBLISHED", entityType: "platform_tax_schedule", entityId: id, summary: `Platform tax schedule ${version} published for every brokerage`, newValue: JSON.stringify({ version, effectiveFrom, legalReference, evidenceReference, rules: normalized }) } });
      });
      return Response.json({ platformTaxSchedule: { id, version, effectiveFrom } }, { status: 201 });
    }
    if (payload.entity === "platform_fee_schedule") {
      const version = String(data.version ?? "").trim();
      const effectiveFrom = String(data.effectiveFrom ?? "");
      const rules = Array.isArray(data.rules) ? data.rules as Array<Record<string, unknown>> : [];
      if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !rules.length) {
        return Response.json({ error: "Version, effective date, and at least one platform fee rule are required." }, { status: 400 });
      }
      const normalized = rules.map((rule) => ({
        assetClass: String(rule.assetClass ?? ""),
        marketSegment: String(rule.marketSegment ?? "main"),
        regulatorPct: Number(rule.regulatorPct),
        exchangePct: Number(rule.exchangePct),
        csdPct: Number(rule.csdPct),
      }));
      if (normalized.some((rule) => !["equity", "bond"].includes(rule.assetClass) || [rule.regulatorPct, rule.exchangePct, rule.csdPct].some((value) => !Number.isFinite(value) || value < 0))) {
        return Response.json({ error: "Enter valid non-negative platform fee rates." }, { status: 400 });
      }
      const existing = await prisma.platformFeeSchedule.findUnique({ where: { version } });
      if (existing && existing.effectiveFrom.toISOString().slice(0, 10) !== effectiveFrom) {
        return Response.json({ error: "Use a new platform fee version when changing the effective date." }, { status: 409 });
      }
      const id = existing?.id ?? `platform_fees_${version.replaceAll(".", "_")}`;
      const effectiveDate = dateOnly(effectiveFrom);
      await prisma.$transaction(async (tx) => {
        await tx.platformFeeSchedule.updateMany({ where: { status: "published", id: { not: id }, effectiveFrom: { lt: effectiveDate } }, data: { effectiveTo: dayBefore(effectiveDate) } });
        await tx.platformFeeSchedule.updateMany({ where: { status: "published", id: { not: id }, effectiveFrom: { gte: effectiveDate } }, data: { status: "archived" } });
        await tx.platformFeeSchedule.upsert({
          where: { id },
          update: { name: String(data.name ?? "ESX market and regulatory fees"), version, status: "published", effectiveFrom: effectiveDate, effectiveTo: null },
          create: { id, name: String(data.name ?? "ESX market and regulatory fees"), version, status: "published", effectiveFrom: effectiveDate },
        });
        await tx.platformFeeRule.deleteMany({ where: { platformFeeScheduleId: id } });
        await tx.platformFeeRule.createMany({ data: normalized.map((rule) => ({ id: crypto.randomUUID(), platformFeeScheduleId: id, ...rule })) });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId: null, actorId: null, action: "PLATFORM_FEE_SCHEDULE_PUBLISHED",
          entityType: "platform_fee_schedule", entityId: id, summary: `Platform market and regulatory fee schedule version ${version} published for eligible tenants`,
          newValue: JSON.stringify({ version, effectiveFrom, rules: normalized }),
        } });
      });
      return Response.json({ platformFeeSchedule: { id, version, effectiveFrom } }, { status: 201 });
    }
    if (payload.entity !== "user") return Response.json({ error: "Unsupported configuration entity." }, { status: 400 });
    const brokerId = String(data.tenantId ?? "");
    const employeeId = String(data.employeeId ?? "").trim().toUpperCase();
    const authorizationReference = String(data.authorizationReference ?? "").trim();
    if (!brokerId || !/^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(employeeId) || String(data.name ?? "").trim().length < 3 || !String(data.email ?? "").includes("@") || !String(data.jobTitle ?? "").trim() || !String(data.department ?? "").trim() || authorizationReference.length < 5) {
      return Response.json({ error: "Tenant, employee ID, name, work email, job title, department, and authorized-request reference are required." }, { status: 400 });
    }
    const activeAccessAdmins = await prisma.user.count({ where: { brokerId, role: "access_admin", status: { in: ["active", "invited"] } } });
    if (activeAccessAdmins >= 2) return Response.json({ error: "This tenant already has two active or invited access administrators. Use the recovery workflow to replace one." }, { status: 409 });
    const id = String(data.id ?? `usr_${crypto.randomUUID().slice(0, 10)}`);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({ data: {
      id, brokerId, employeeId, email: String(data.email).trim().toLowerCase(), fullName: String(data.name).trim(),
      jobTitle: String(data.jobTitle ?? "Access Administrator").trim(), department: String(data.department ?? "").trim(),
      role: "access_admin", status: "invited", mfaEnabled: false, authProvider: "pending", invitedAt: new Date(), invitationExpiresAt: expiresAt,
      accessReviewDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    } });
    await prisma.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: user.brokerId, actorId: null, action: "ACCESS_ADMIN_BOOTSTRAPPED", entityType: "user", entityId: user.id, summary: `${user.fullName} (${employeeId}) bootstrapped as broker access administrator`, reason: authorizationReference, newValue: JSON.stringify({ employeeId, email: user.email, role: "access_admin" }) } });
    return Response.json({ user: { id: user.id } }, { status: 201 });
  } catch (error) { return routeError(error); }
}
