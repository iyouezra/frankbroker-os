import type { HistoryPoint, MarketDataProvider, MarketInstrument, MarketRange, MarketSummary, OrderBookLevel, RecentTrade } from "./types";

const MOCKS = [
  ["ins_tele", "TELE", "Ethio Telecom", "Ethio Telecom", "Equity", 310, 305, 48520],
  ["ins_awab", "AWAB", "Awash Bank", "Awash Bank", "Equity", 9655, 9650, 26740],
  ["ins_wgbx", "WGBX", "Wegagen Bank", "Wegagen Bank", "Equity", 1738, 1742, 19310],
  ["ins_gdab", "GDAB", "Gadaa Bank", "Gadaa Bank", "Equity", 1196, 1196, 8840],
  ["ins_abayb", "ABAYB", "Abay Bank", "Abay Bank", "Equity", 1814, 1808, 11420],
  ["ins_goeb_2029", "GB2029", "GoE Treasury Bond 2029", "Federal Democratic Republic of Ethiopia", "Bond", 99.85, 99.8, 1220],
  ["ins_goeb_2031", "GB2031", "GoE Treasury Bond 2031", "Federal Democratic Republic of Ethiopia", "Bond", 100.6, 100.6, 810],
] as const;

function instruments(now = new Date()): MarketInstrument[] {
  const updatedAt = now.toISOString();
  return MOCKS.map(([id, symbol, name, issuer, instrumentType, price, previousClose, volume], index) => {
    const change = price - previousClose;
    return {
      id, symbol, name, issuer, instrumentType, currency: "ETB", status: "open",
      lastPrice: price, change, changePercent: previousClose ? change / previousClose * 100 : null, previousClose,
      open: previousClose + (index % 2 ? 2 : -3), high: Math.max(price, previousClose) + 12, low: Math.min(price, previousClose) - 9,
      bestBid: price - 2, bestBidQuantity: 300 + index * 80, bestOffer: price + 3, bestOfferQuantity: 180 + index * 60,
      volume, turnover: volume * price, trades: 28 + index * 9,
      lastTradeAt: new Date(now.getTime() - (index + 1) * 9_000).toISOString(), updatedAt, feedStatus: "development_mock",
    };
  });
}

export class DevelopmentMockMarketDataProvider implements MarketDataProvider {
  readonly mode = "development_mock" as const;
  async getMarketSummary(): Promise<MarketSummary> {
    const rows = instruments();
    const timestamp = rows[0].updatedAt;
    return {
      marketStatus: "open", session: "Continuous trading", tradingDate: timestamp?.slice(0, 10) ?? null,
      totalTurnover: rows.reduce((sum, row) => sum + (row.turnover ?? 0), 0),
      totalVolume: rows.reduce((sum, row) => sum + (row.volume ?? 0), 0),
      trades: rows.reduce((sum, row) => sum + (row.trades ?? 0), 0),
      advancing: rows.filter((row) => (row.change ?? 0) > 0).length,
      declining: rows.filter((row) => (row.change ?? 0) < 0).length,
      unchanged: rows.filter((row) => row.change === 0).length,
      updatedAt: timestamp, lastSuccessfulUpdate: timestamp, feedStatus: "development_mock", source: "FrankBroker development mock",
    };
  }
  async getInstruments() { return instruments(); }
  async getInstrumentQuote(id: string) { return instruments().find((item) => item.id === id || item.symbol === id) ?? null; }
  async getInstrumentHistory(id: string, range: MarketRange): Promise<HistoryPoint[]> {
    const quote = await this.getInstrumentQuote(id);
    if (!quote?.lastPrice) return [];
    const count = { "1D": 24, "5D": 30, "1M": 30, "3M": 45, "1Y": 52 }[range];
    const interval = { "1D": 15 * 60_000, "5D": 4 * 60 * 60_000, "1M": 86_400_000, "3M": 2 * 86_400_000, "1Y": 7 * 86_400_000 }[range];
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => ({
      timestamp: new Date(now - (count - 1 - index) * interval).toISOString(),
      price: Number((quote.lastPrice! * (0.975 + index / count * .025 + Math.sin(index * 1.7) * .006)).toFixed(2)),
    }));
  }
  async getOrderBook(id: string): Promise<{ bids: OrderBookLevel[]; offers: OrderBookLevel[] }> {
    const quote = await this.getInstrumentQuote(id);
    if (!quote?.bestBid || !quote.bestOffer) return { bids: [], offers: [] };
    return {
      bids: [0, 1, 2].map((level) => ({ price: quote.bestBid! - level * 2, quantity: (quote.bestBidQuantity ?? 0) + level * 120 })),
      offers: [0, 1, 2].map((level) => ({ price: quote.bestOffer! + level * 2, quantity: (quote.bestOfferQuantity ?? 0) + level * 90 })),
    };
  }
  async getRecentTrades(id: string): Promise<RecentTrade[]> {
    const quote = await this.getInstrumentQuote(id);
    if (!quote?.lastPrice) return [];
    return [0, 1, 2, 3].map((index) => ({ id: `${id}-trade-${index}`, timestamp: new Date(Date.now() - index * 75_000).toISOString(), price: quote.lastPrice! - index, quantity: 100 + index * 50 }));
  }
}
