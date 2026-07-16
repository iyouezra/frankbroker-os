import { Prisma } from "../../../../app/generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import { toNum } from "../../../../lib/money";
import { requirePlatformAdmin } from "../../../../lib/server-auth";
import { apiError as routeError } from "../../../../lib/api";

export const runtime = "nodejs";

const roleToUi: Record<string, string> = {
  broker_admin: "Broker admin", trader: "Trader", compliance: "Compliance",
  settlement: "Settlement", management: "Read only", operations: "Read only",
};
const roleToDb: Record<string, string> = {
  "Broker admin": "broker_admin", Trader: "trader", Compliance: "compliance",
  Settlement: "settlement", "Read only": "management",
};
const title = (value: string) => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
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
    const [brokers, instruments, auditRows] = await Promise.all([
      prisma.broker.findMany({
        include: {
          settings: true,
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
      id: user.id, tenantId: broker.id, name: user.fullName, email: user.email,
      role: roleToUi[user.role] ?? title(user.role), status: title(user.status), mfa: user.mfaEnabled,
      lastActive: user.lastLoginAt ? user.lastLoginAt.toISOString() : "Not yet",
    })));
    const integrations = brokers.flatMap((broker) => broker.integrations.map((item) => ({
      id: item.id, tenantId: broker.id, name: item.name, description: item.description,
      status: title(item.status), mode: title(item.mode),
    })));

    return Response.json({
      tenants,
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
      const current = await prisma.broker.findUnique({ where: { id: payload.id }, include: { settings: true } });
      if (!current) return Response.json({ error: "Tenant not found." }, { status: 404 });
      const data = payload.data;
      const controls = data.controls as Record<string, unknown>;
      await prisma.$transaction([
        prisma.broker.update({ where: { id: payload.id }, data: {
          name: String(data.name), licenseNumber: String(data.licenseNumber), status: String(data.status), baseCurrency: String(data.baseCurrency ?? "ETB"),
        } }),
        prisma.brokerSettings.upsert({ where: { brokerId: payload.id }, update: {
          tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""), supportEmail: String(data.supportEmail ?? ""),
          primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""), timezone: String(data.timezone), businessDate: dateOnly(String(data.businessDate)),
          features: data.features as Prisma.InputJsonValue, makerChecker: Boolean(controls.makerChecker), approvalThreshold: Number(controls.approvalThreshold),
          clientDailyLimit: Number(controls.clientDailyLimit), brokerageFeePct: Number(controls.brokerageFeePct), minimumFee: Number(controls.minimumFee),
          settlementCycle: String(controls.settlementCycle), allowedOrderTypes: controls.allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: Number(controls.discrepancyWindowDays),
          kycReviewMonths: Number(controls.kycReviewMonths),
        }, create: {
          id: `set_${payload.id}`, brokerId: payload.id, tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""),
          supportEmail: String(data.supportEmail ?? ""), primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""),
          timezone: String(data.timezone), businessDate: dateOnly(String(data.businessDate)), features: data.features as Prisma.InputJsonValue,
          makerChecker: Boolean(controls.makerChecker), approvalThreshold: Number(controls.approvalThreshold), clientDailyLimit: Number(controls.clientDailyLimit),
          brokerageFeePct: Number(controls.brokerageFeePct), minimumFee: Number(controls.minimumFee), settlementCycle: String(controls.settlementCycle),
          allowedOrderTypes: controls.allowedOrderTypes as Prisma.InputJsonValue,
          requireTermsAcceptance: Boolean(controls.requireTermsAcceptance),
          discrepancyWindowDays: Number(controls.discrepancyWindowDays),
          kycReviewMonths: Number(controls.kycReviewMonths),
        } }),
        audit(payload.id, "TENANT_CONFIGURATION_UPDATED", "broker", payload.id, `${String(data.tradingName)} configuration updated`, current, data),
      ]);
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
      const update: { status?: string; role?: string; mfaEnabled?: boolean } = {};
      if (typeof payload.data.status === "string") update.status = payload.data.status.toLowerCase();
      if (typeof payload.data.role === "string") update.role = roleToDb[payload.data.role] ?? payload.data.role.toLowerCase();
      if (typeof payload.data.mfa === "boolean") update.mfaEnabled = payload.data.mfa;
      const user = await prisma.user.update({ where: { id: payload.id }, data: update });
      await audit(user.brokerId, "USER_UPDATED", "user", user.id, `${user.fullName} access updated`, null, payload.data);
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
    if (payload.entity !== "user") return Response.json({ error: "Unsupported configuration entity." }, { status: 400 });
    const id = String(data.id ?? `usr_${crypto.randomUUID().slice(0, 10)}`);
    const user = await prisma.user.create({ data: {
      id, brokerId: String(data.tenantId), email: String(data.email), fullName: String(data.name),
      role: roleToDb[String(data.role)] ?? "management", status: "invited", mfaEnabled: Boolean(data.mfa),
    } });
    await audit(user.brokerId, "USER_INVITED", "user", user.id, `${user.fullName} invited as ${String(data.role)}`);
    return Response.json({ user: { id: user.id } }, { status: 201 });
  } catch (error) { return routeError(error); }
}
