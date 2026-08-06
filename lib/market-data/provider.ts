import { normalizeEsxInstrument, normalizeEsxSummary } from "./esx-normalizer";
import { DevelopmentMockMarketDataProvider } from "./mock-provider";
import type { HistoryPoint, MarketDataProvider, MarketInstrument, MarketRange, MarketSummary, OrderBookLevel, RecentTrade } from "./types";

class EsxApiProvider implements MarketDataProvider {
  readonly mode = "live" as const;
  constructor(private readonly baseUrl: string, private readonly token?: string) {}
  private async read(path: string, signal?: AbortSignal) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      signal, headers: { accept: "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`ESX market data returned ${response.status}`);
    return response.json();
  }
  async getMarketSummary(signal?: AbortSignal): Promise<MarketSummary> { return normalizeEsxSummary(await this.read("/market/summary", signal)); }
  async getInstruments(signal?: AbortSignal): Promise<MarketInstrument[]> {
    const raw = await this.read("/instruments", signal) as { instruments?: Record<string, unknown>[] } | Record<string, unknown>[];
    return (Array.isArray(raw) ? raw : raw.instruments ?? []).map(normalizeEsxInstrument);
  }
  async getInstrumentQuote(id: string, signal?: AbortSignal) { return normalizeEsxInstrument(await this.read(`/instruments/${encodeURIComponent(id)}/quote`, signal)); }
  async getInstrumentHistory(id: string, range: MarketRange, signal?: AbortSignal): Promise<HistoryPoint[]> {
    const raw = await this.read(`/instruments/${encodeURIComponent(id)}/history?range=${range}`, signal) as { points?: HistoryPoint[] };
    return raw.points ?? [];
  }
  async getOrderBook(id: string, signal?: AbortSignal) { return this.read(`/instruments/${encodeURIComponent(id)}/order-book`, signal) as Promise<{ bids: OrderBookLevel[]; offers: OrderBookLevel[] }>; }
  async getRecentTrades(id: string, signal?: AbortSignal) { const raw = await this.read(`/instruments/${encodeURIComponent(id)}/trades`, signal) as { trades?: RecentTrade[] }; return raw.trades ?? []; }
}

export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.MARKET_DATA_PROVIDER === "unavailable") return new UnavailableMarketDataProvider();
  if (process.env.ESX_MARKET_DATA_URL) return new EsxApiProvider(process.env.ESX_MARKET_DATA_URL, process.env.ESX_MARKET_DATA_TOKEN);
  return new DevelopmentMockMarketDataProvider();
}

class UnavailableMarketDataProvider implements MarketDataProvider {
  readonly mode = "unavailable" as const;
  private summary(): MarketSummary { return { marketStatus: "unavailable", session: null, tradingDate: null, totalTurnover: null, totalVolume: null, trades: null, advancing: null, declining: null, unchanged: null, updatedAt: null, lastSuccessfulUpdate: null, feedStatus: "unavailable", source: "ESX provider unavailable" }; }
  async getMarketSummary() { return this.summary(); }
  async getInstruments() { return []; }
  async getInstrumentQuote() { return null; }
  async getInstrumentHistory() { return []; }
  async getOrderBook() { return { bids: [], offers: [] }; }
  async getRecentTrades() { return []; }
}
