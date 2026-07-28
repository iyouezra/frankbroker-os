import { prisma } from "../../../lib/prisma";
import { resolveBrokerId } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError } from "../../../lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const brokerId = resolveBrokerId(request);
    const broker = await prisma.broker.findUnique({
      where: { id: brokerId },
      include: {
        settings: true,
        instrumentAccess: { where: { enabled: true }, include: { instrument: true } },
        feeSchedules: {
          where: { status: "published" },
          include: { rules: true },
          orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
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
            regulatorPct: toNum(rule.regulatorPct),
            exchangePct: toNum(rule.exchangePct),
            csdPct: toNum(rule.csdPct),
            minimumFee: toNum(rule.minimumFee),
            maximumFee: rule.maximumFee ? toNum(rule.maximumFee) : null,
          })),
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
