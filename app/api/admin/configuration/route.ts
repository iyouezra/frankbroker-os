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
        },
        orderBy: { name: "asc" },
      }),
      prisma.instrument.findMany({ include: { brokerAccess: true }, orderBy: { symbol: "asc" } }),
      prisma.auditLog.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    const tenants = brokers.map((broker) => {
      const settings = broker.settings;
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
        }, create: {
          id: `set_${payload.id}`, brokerId: payload.id, tradingName: String(data.tradingName), plan: String(data.plan), domain: String(data.domain ?? ""),
          supportEmail: String(data.supportEmail ?? ""), primaryColor: String(data.primaryColor), welcomeMessage: String(data.welcomeMessage ?? ""),
          timezone: String(data.timezone), businessDate: dateOnly(String(data.businessDate)), features: data.features as Prisma.InputJsonValue,
          makerChecker: Boolean(controls.makerChecker), approvalThreshold: Number(controls.approvalThreshold), clientDailyLimit: Number(controls.clientDailyLimit),
          brokerageFeePct: Number(controls.brokerageFeePct), minimumFee: Number(controls.minimumFee), settlementCycle: String(controls.settlementCycle),
          allowedOrderTypes: controls.allowedOrderTypes as Prisma.InputJsonValue,
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
    if (payload.entity !== "user" || !payload.data) return Response.json({ error: "Only user invitations are supported." }, { status: 400 });
    const data = payload.data;
    const id = String(data.id ?? `usr_${crypto.randomUUID().slice(0, 10)}`);
    const user = await prisma.user.create({ data: {
      id, brokerId: String(data.tenantId), email: String(data.email), fullName: String(data.name),
      role: roleToDb[String(data.role)] ?? "management", status: "invited", mfaEnabled: Boolean(data.mfa),
    } });
    await audit(user.brokerId, "USER_INVITED", "user", user.id, `${user.fullName} invited as ${String(data.role)}`);
    return Response.json({ user: { id: user.id } }, { status: 201 });
  } catch (error) { return routeError(error); }
}
