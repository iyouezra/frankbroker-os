import { prisma } from "../../../lib/prisma";
import { resolveBrokerId } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const brokerId = resolveBrokerId(request);
    const broker = await prisma.broker.findUnique({
      where: { id: brokerId },
      include: {
        settings: true,
        instrumentAccess: { where: { enabled: true }, include: { instrument: true } },
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
        welcomeMessage: broker.settings?.welcomeMessage ?? "Invest in Ethiopia with confidence.",
        supportEmail: broker.settings?.supportEmail,
        features: broker.settings?.features ?? {},
        controls: broker.settings ? {
          brokerageFeePct: toNum(broker.settings.brokerageFeePct),
          minimumFee: toNum(broker.settings.minimumFee),
          allowedOrderTypes: broker.settings.allowedOrderTypes,
          settlementCycle: broker.settings.settlementCycle,
          makerChecker: broker.settings.makerChecker,
          approvalThreshold: toNum(broker.settings.approvalThreshold),
          clientDailyLimit: toNum(broker.settings.clientDailyLimit),
        } : null,
      },
      instruments: broker.instrumentAccess.map(({ instrument }) => ({
        id: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        assetClass: instrument.assetClass,
        status: instrument.tradingStatus,
        price: toNum(instrument.lastPrice),
        lotSize: instrument.lotSize,
        tickSize: toNum(instrument.tickSize),
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load tenant." }, { status: 500 });
  }
}
