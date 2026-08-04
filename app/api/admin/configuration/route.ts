import { Prisma } from "../../../../app/generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import { toNum } from "../../../../lib/money";
import { requirePlatformAdmin } from "../../../../lib/server-auth";
import { apiError as routeError } from "../../../../lib/api";

export const runtime = "nodejs";

const roleToUi: Record<string, string> = {
  access_admin: "Access admin", broker_admin: "Broker admin", trader: "Trader", operations: "Operations", compliance: "Compliance",
  settlement: "Settlement", relationship_officer: "Relationship", service_officer: "Client service", advisory_lead: "Advisory lead", advisory_analyst: "Advisory analyst", management: "Read only",
};
const title = (value: string) => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dayBefore = (value: Date) => new Date(value.getTime() - 24 * 60 * 60 * 1000);
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function audit(brokerId: string | null, action: string, entityType: string, entityId: string, summary: string, previousValue?: unknown, newValue?: unknown) {
  return prisma.auditLog.create({ data: {
    id: crypto.randomUUID(), brokerId, actorId: null, action, entityType, entityId, summary,
    previousValue: previousValue ? JSON.stringify(previousValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
  } });
}

export async function GET(request: Request) {
  try {
    requirePlatformAdmin(request);
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [brokers, instruments, auditRows, platformFeeSchedule, checklistTemplates] = await Promise.all([
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
        businessDate: (settings?.businessDate ?? new Date()).toISOString().slice(0, 10),
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
          effectiveAt: new Date().toISOString().slice(0, 10),
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
          effectiveFrom: new Date().toISOString().slice(0, 10),
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
    requirePlatformAdmin(request);
    const payload = await request.json() as { entity?: string; id?: string; tenantId?: string; data?: Record<string, unknown> };
    if (!payload.entity || !payload.id || !payload.data) return Response.json({ error: "entity, id, and data are required." }, { status: 400 });

    if (payload.entity === "tenant") {
      const tenantId = payload.id;
      const current = await prisma.broker.findUnique({ where: { id: tenantId }, include: { settings: true } });
      if (!current) return Response.json({ error: "Tenant not found." }, { status: 404 });
      const data = payload.data;
      const controls = data.controls as Record<string, unknown>;
      const modules = (data.modules ?? {}) as Record<string, unknown>;
      const entitlements = Array.isArray(data.entitlements) ? data.entitlements.map(String) : [];
      if ((modules.dealer_operations === true || modules.investor_servicing === true) && !entitlements.includes("securities_dealing")) return Response.json({ error: "Dealer operations and investor servicing require the securities dealing entitlement." }, { status: 400 });
      if (modules.issuer_advisory === true && !entitlements.includes("transaction_advisory")) return Response.json({ error: "Issuer advisory requires the transaction advisory entitlement." }, { status: 400 });
      await prisma.$transaction(async (tx) => {
        await tx.broker.update({ where: { id: tenantId }, data: {
          name: String(data.name), licenseNumber: String(data.licenseNumber), status: String(data.status), baseCurrency: String(data.baseCurrency ?? "ETB"),
        } });
        await tx.brokerSettings.upsert({ where: { brokerId: tenantId }, update: {
          tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""), supportEmail: String(data.supportEmail ?? ""),
          primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""), timezone: String(data.timezone), businessDate: dateOnly(String(data.businessDate)),
          features: data.features as Prisma.InputJsonValue, makerChecker: Boolean(controls.makerChecker), approvalThreshold: Number(controls.approvalThreshold),
          clientDailyLimit: Number(controls.clientDailyLimit), brokerageFeePct: Number(controls.brokerageFeePct), minimumFee: Number(controls.minimumFee),
          settlementCycle: String(controls.settlementCycle), allowedOrderTypes: controls.allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: Number(controls.discrepancyWindowDays),
          kycReviewMonths: Number(controls.kycReviewMonths),
        }, create: {
          id: `set_${tenantId}`, brokerId: tenantId, tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""),
          supportEmail: String(data.supportEmail ?? ""), primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""),
          timezone: String(data.timezone), businessDate: dateOnly(String(data.businessDate)), features: data.features as Prisma.InputJsonValue,
          makerChecker: Boolean(controls.makerChecker), approvalThreshold: Number(controls.approvalThreshold), clientDailyLimit: Number(controls.clientDailyLimit),
          brokerageFeePct: Number(controls.brokerageFeePct), minimumFee: Number(controls.minimumFee), settlementCycle: String(controls.settlementCycle),
          allowedOrderTypes: controls.allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: Number(controls.discrepancyWindowDays),
          kycReviewMonths: Number(controls.kycReviewMonths),
        } });
        await tx.tenantProfile.upsert({ where: { tenantId }, update: { businessType: String(data.businessType ?? "securities_dealer") }, create: { tenantId, businessType: String(data.businessType ?? "securities_dealer") } });
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
        await prisma.instrument.update({ where: { id: payload.id }, data: { tradingStatus: payload.data.status.toLowerCase() } });
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
    requirePlatformAdmin(request);
    const payload = await request.json() as { entity?: string; data?: Record<string, unknown> };
    if (!payload.data) return Response.json({ error: "Configuration data is required." }, { status: 400 });
    const data = payload.data;
    if (payload.entity === "legal_document") {
      const brokerId = String(data.brokerId ?? "");
      const version = String(data.version ?? "").trim();
      const titleText = String(data.title ?? "").trim();
      const content = String(data.content ?? "").trim();
      if (!brokerId || !version || !titleText || content.length < 40) {
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
            effectiveAt: dateOnly(String(data.effectiveAt)),
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
            effectiveAt: dateOnly(String(data.effectiveAt)),
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
      if (!brokerId || !version || !rules.length) return Response.json({ error: "Tenant, version, and at least one fee rule are required." }, { status: 400 });
      const id = String(data.id ?? `fees_${brokerId}_${version.replaceAll(".", "_")}`);
      await prisma.$transaction(async (tx) => {
        await tx.feeSchedule.updateMany({ where: { brokerId, status: "published", id: { not: id } }, data: { status: "archived" } });
        await tx.feeSchedule.upsert({
          where: { id },
          update: { name: String(data.name ?? "Standard fee schedule"), version, status: "published", effectiveFrom: dateOnly(String(data.effectiveFrom)), effectiveTo: null },
          create: { id, brokerId, name: String(data.name ?? "Standard fee schedule"), version, status: "published", effectiveFrom: dateOnly(String(data.effectiveFrom)) },
        });
        await tx.feeRule.deleteMany({ where: { feeScheduleId: id } });
        await tx.feeRule.createMany({ data: rules.map((rule) => ({
          id: crypto.randomUUID(),
          feeScheduleId: id,
          assetClass: String(rule.assetClass),
          marketSegment: String(rule.marketSegment ?? "main"),
          brokeragePct: Number(rule.brokeragePct ?? 0),
          regulatorPct: Number(rule.regulatorPct ?? 0),
          exchangePct: Number(rule.exchangePct ?? 0),
          csdPct: Number(rule.csdPct ?? 0),
          minimumFee: Number(rule.minimumFee ?? 0),
          maximumFee: rule.maximumFee === null || rule.maximumFee === "" || rule.maximumFee === undefined ? null : Number(rule.maximumFee),
        })) });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(), brokerId, actorId: null, action: "FEE_SCHEDULE_PUBLISHED",
          entityType: "fee_schedule", entityId: id, summary: `${String(data.name ?? "Fee schedule")} version ${version} published`,
          newValue: JSON.stringify({ version, rules }),
        } });
      });
      return Response.json({ feeSchedule: { id } }, { status: 201 });
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
