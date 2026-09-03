import { Prisma } from "../../../../../app/generated/prisma/client";
import { apiError } from "../../../../../lib/api";
import { writeAudit } from "../../../../../lib/oms/audit-service";
import { prisma } from "../../../../../lib/prisma";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

const list = (value: unknown, allowed?: string[]) => Array.isArray(value)
  ? [...new Set(value.map(String).map((item) => item.trim().toLowerCase()).filter((item) => item && (!allowed || allowed.includes(item))))]
  : [];
const optionalMoney = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const optionalText = (value: unknown) => value === null || value === undefined || value === "" ? null : String(value).trim();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(request, "adjust");
    if (!["broker_admin", "compliance"].includes(actor.role)) return Response.json({ error: "Broker administrator or compliance access is required." }, { status: 403 });
    const { id: clientId } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const client = await prisma.client.findFirst({ where: { id: clientId, brokerId: actor.brokerId }, include: { tradingMandate: true } });
    if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
    const version = Number(payload.version ?? client.tradingMandate?.version ?? 1);
    if (client.tradingMandate && version !== client.tradingMandate.version) return Response.json({ error: "The mandate changed. Refresh before saving." }, { status: 409 });
    const maxOrderValue = optionalMoney(payload.maxOrderValue);
    const dailyGrossLimit = optionalMoney(payload.dailyGrossLimit);
    if ([maxOrderValue, dailyGrossLimit].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) return Response.json({ error: "Trading limits must be non-negative amounts or blank to inherit the tenant default." }, { status: 400 });
    const commissionSource = payload.commissionSource === "client_override" ? "client_override" : "tenant_default";
    const commissionRatePct = commissionSource === "client_override" ? optionalMoney(payload.commissionRatePct) : null;
    const commissionMinimumFee = commissionSource === "client_override" ? optionalMoney(payload.commissionMinimumFee) : null;
    const commissionMaximumFee = commissionSource === "client_override" ? optionalMoney(payload.commissionMaximumFee) : null;
    const commissionEffectiveFrom = commissionSource === "client_override" && payload.commissionEffectiveFrom ? new Date(`${String(payload.commissionEffectiveFrom)}T00:00:00.000Z`) : null;
    const commissionReason = commissionSource === "client_override" ? optionalText(payload.commissionReason) : null;
    if (actor.role !== "broker_admin") {
      const existing = client.tradingMandate;
      const pricingChanged = commissionSource !== (existing?.commissionSource ?? "tenant_default")
        || commissionRatePct !== (existing?.commissionRatePct === null || existing?.commissionRatePct === undefined ? null : Number(existing.commissionRatePct))
        || commissionMinimumFee !== (existing?.commissionMinimumFee === null || existing?.commissionMinimumFee === undefined ? null : Number(existing.commissionMinimumFee))
        || commissionMaximumFee !== (existing?.commissionMaximumFee === null || existing?.commissionMaximumFee === undefined ? null : Number(existing.commissionMaximumFee))
        || (commissionEffectiveFrom?.toISOString().slice(0, 10) ?? null) !== (existing?.commissionEffectiveFrom?.toISOString().slice(0, 10) ?? null)
        || commissionReason !== (existing?.commissionReason ?? null);
      if (pricingChanged) return Response.json({ error: "Only a broker administrator can change client-specific commission terms." }, { status: 403 });
    }
    if (commissionSource === "client_override") {
      if (commissionRatePct === null || !Number.isFinite(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100) return Response.json({ error: "Client commission must be between 0% and 100%." }, { status: 400 });
      if (!commissionEffectiveFrom || Number.isNaN(commissionEffectiveFrom.getTime())) return Response.json({ error: "Choose a valid effective date for the client commission." }, { status: 400 });
      if (!commissionReason || commissionReason.length < 5) return Response.json({ error: "Record a clear reason for the client-specific commission." }, { status: 400 });
      if ([commissionMinimumFee, commissionMaximumFee].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) return Response.json({ error: "Commission minimum and maximum must be non-negative amounts or blank." }, { status: 400 });
      if (commissionMinimumFee !== null && commissionMaximumFee !== null && commissionMaximumFee < commissionMinimumFee) return Response.json({ error: "Commission maximum cannot be below the minimum." }, { status: 400 });
    }
    const data = {
      status: payload.status === "suspended" ? "suspended" : "active",
      buyEnabled: payload.buyEnabled !== false,
      sellEnabled: payload.sellEnabled !== false,
      maxOrderValue,
      dailyGrossLimit,
      allowedAssetClasses: list(payload.allowedAssetClasses, ["equity", "bond"]),
      allowedMarketSegments: list(payload.allowedMarketSegments),
      allowedOrderTypes: list(payload.allowedOrderTypes, ["market", "limit", "stop_loss"]),
      commissionSource,
      commissionRatePct,
      commissionMinimumFee,
      commissionMaximumFee,
      commissionEffectiveFrom,
      commissionReason,
    };
    const result = await prisma.$transaction(async (tx) => {
      let mandate;
      if (client.tradingMandate) {
        const updated = await tx.clientTradingMandate.updateMany({ where: { clientId, brokerId: actor.brokerId, version }, data: { ...data, version: { increment: 1 } } });
        if (updated.count !== 1) throw new Response("The mandate changed. Refresh before saving.", { status: 409 });
        mandate = await tx.clientTradingMandate.findUniqueOrThrow({ where: { clientId } });
      } else {
        mandate = await tx.clientTradingMandate.create({ data: { id: `mandate_${clientId}`, brokerId: actor.brokerId, clientId, ...data } });
      }
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CLIENT_TRADING_MANDATE_UPDATED", entityType: "client", entityId: clientId, summary: `Trading mandate updated for ${client.fullName}`, previousValue: client.tradingMandate, newValue: data });
      return mandate;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ tradingMandate: { ...data, commissionEffectiveFrom: data.commissionEffectiveFrom?.toISOString().slice(0, 10) ?? null, version: result.version } });
  } catch (error) {
    return apiError(error);
  }
}
