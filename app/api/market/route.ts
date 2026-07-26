import { apiError, isDatabaseOffline } from "../../../lib/api";
import { MARKET_STALE_AFTER_MS } from "../../../lib/market-data/format";
import { getMarketDataProvider } from "../../../lib/market-data/provider";
import { MARKET_RANGES, type MarketRange } from "../../../lib/market-data/types";
import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";

export const runtime = "nodejs";

const DEVELOPMENT_INSTRUMENTS = ["ins_tele", "ins_awab", "ins_wgbx", "ins_gdab", "ins_abayb", "ins_goeb_2029", "ins_goeb_2031"];

async function permittedInstrumentIds(brokerId: string) {
  try {
    const rows = await prisma.brokerInstrument.findMany({
      where: { brokerId, enabled: true, instrument: { tradingStatus: { not: "disabled" } } },
      select: { instrumentId: true },
    });
    return rows.map((row) => row.instrumentId);
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && isDatabaseOffline(error) && brokerId === "brk_abyssinia") return DEVELOPMENT_INSTRUMENTS;
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const actor = requirePermission(request, "market.view");
    const provider = getMarketDataProvider();
    const url = new URL(request.url);
    const instrumentId = url.searchParams.get("instrumentId")?.trim() ?? "";
    const action = url.searchParams.get("action") ?? "snapshot";
    const permitted = await permittedInstrumentIds(actor.brokerId);

    if (instrumentId && !permitted.includes(instrumentId)) {
      return Response.json({ error: "Instrument is not enabled for this tenant." }, { status: 404 });
    }

    if (action === "history") {
      const requestedRange = url.searchParams.get("range") ?? "1D";
      if (!MARKET_RANGES.includes(requestedRange as MarketRange)) {
        return Response.json({ error: "Unsupported market history range.", supportedRanges: MARKET_RANGES }, { status: 400 });
      }
      if (!instrumentId) return Response.json({ error: "instrumentId is required." }, { status: 400 });
      return Response.json({ instrumentId, range: requestedRange, points: await provider.getInstrumentHistory(instrumentId, requestedRange as MarketRange) });
    }

    if (action === "detail") {
      if (!instrumentId) return Response.json({ error: "instrumentId is required." }, { status: 400 });
      const [quote, orderBook, recentTrades] = await Promise.all([
        provider.getInstrumentQuote(instrumentId),
        actor.role === "broker_admin" || actor.role === "trader" ? provider.getOrderBook(instrumentId) : Promise.resolve({ bids: [], offers: [] }),
        actor.role === "broker_admin" || actor.role === "trader" ? provider.getRecentTrades(instrumentId) : Promise.resolve([]),
      ]);
      return Response.json({ quote, orderBook, recentTrades, providerMode: provider.mode, staleAfterMs: MARKET_STALE_AFTER_MS });
    }

    const [summary, rows] = await Promise.all([provider.getMarketSummary(), provider.getInstruments()]);
    return Response.json({
      summary,
      instruments: rows.filter((instrument) => permitted.includes(instrument.id)),
      providerMode: provider.mode,
      staleAfterMs: MARKET_STALE_AFTER_MS,
    });
  } catch (error) {
    return apiError(error);
  }
}
