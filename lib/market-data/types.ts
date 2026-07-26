export const MARKET_RANGES = ["1D", "5D", "1M", "3M", "1Y"] as const;
export type MarketRange = (typeof MARKET_RANGES)[number];
export type MarketState = "pre_open" | "open" | "closed" | "halted" | "unavailable";
export type FeedState = "live" | "delayed" | "unavailable" | "development_mock";

export type MarketSummary = {
  marketStatus: MarketState;
  session: string | null;
  tradingDate: string | null;
  totalTurnover: number | null;
  totalVolume: number | null;
  trades: number | null;
  advancing: number | null;
  declining: number | null;
  unchanged: number | null;
  updatedAt: string | null;
  lastSuccessfulUpdate: string | null;
  feedStatus: FeedState;
  source: string;
};

export type MarketInstrument = {
  id: string;
  symbol: string;
  name: string;
  issuer: string;
  instrumentType: string;
  currency: string;
  status: MarketState;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  bestBid: number | null;
  bestBidQuantity: number | null;
  bestOffer: number | null;
  bestOfferQuantity: number | null;
  volume: number | null;
  turnover: number | null;
  trades: number | null;
  lastTradeAt: string | null;
  updatedAt: string | null;
  feedStatus: FeedState;
};

export type HistoryPoint = { timestamp: string; price: number | null };
export type OrderBookLevel = { price: number; quantity: number };
export type RecentTrade = { id: string; timestamp: string; price: number; quantity: number };

export type MarketSnapshot = {
  summary: MarketSummary;
  instruments: MarketInstrument[];
  providerMode: "live" | "development_mock" | "unavailable";
  staleAfterMs: number;
};

export interface MarketDataProvider {
  readonly mode: MarketSnapshot["providerMode"];
  getMarketSummary(signal?: AbortSignal): Promise<MarketSummary>;
  getInstruments(signal?: AbortSignal): Promise<MarketInstrument[]>;
  getInstrumentQuote(instrumentId: string, signal?: AbortSignal): Promise<MarketInstrument | null>;
  getInstrumentHistory(instrumentId: string, range: MarketRange, signal?: AbortSignal): Promise<HistoryPoint[]>;
  getOrderBook(instrumentId: string, signal?: AbortSignal): Promise<{ bids: OrderBookLevel[]; offers: OrderBookLevel[] }>;
  getRecentTrades(instrumentId: string, signal?: AbortSignal): Promise<RecentTrade[]>;
}
