import type { FeedState, MarketInstrument, MarketState, MarketSummary } from "./types";

type Raw = Record<string, unknown>;
const numberOrNull = (value: unknown) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const textOrNull = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const marketState = (value: unknown): MarketState => {
  const key = String(value ?? "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["pre_open", "open", "closed", "halted"].includes(key)) return key as MarketState;
  return "unavailable";
};
const feedState = (value: unknown): FeedState => {
  const key = String(value ?? "").toLowerCase();
  return key === "live" ? "live" : key === "delayed" ? "delayed" : "unavailable";
};

export function normalizeEsxSummary(raw: Raw): MarketSummary {
  const updatedAt = textOrNull(raw.updatedAt ?? raw.timestamp ?? raw.asOf);
  return {
    marketStatus: marketState(raw.marketStatus ?? raw.status),
    session: textOrNull(raw.session ?? raw.tradingSession),
    tradingDate: textOrNull(raw.tradingDate ?? raw.businessDate),
    totalTurnover: numberOrNull(raw.totalTurnover ?? raw.turnover),
    totalVolume: numberOrNull(raw.totalVolume ?? raw.volume),
    trades: numberOrNull(raw.numberOfTrades ?? raw.trades),
    advancing: numberOrNull(raw.advancing),
    declining: numberOrNull(raw.declining),
    unchanged: numberOrNull(raw.unchanged),
    updatedAt,
    lastSuccessfulUpdate: updatedAt,
    feedStatus: feedState(raw.feedStatus),
    source: textOrNull(raw.source) ?? "ESX",
  };
}

export function normalizeEsxInstrument(raw: Raw): MarketInstrument {
  const lastPrice = numberOrNull(raw.lastPrice ?? raw.lastTradedPrice);
  const previousClose = numberOrNull(raw.previousClose);
  const change = numberOrNull(raw.change) ?? (lastPrice !== null && previousClose !== null ? lastPrice - previousClose : null);
  const changePercent = numberOrNull(raw.changePercent ?? raw.percentageChange) ?? (change !== null && previousClose ? change / previousClose * 100 : null);
  return {
    id: String(raw.instrumentId ?? raw.id ?? raw.symbol ?? ""),
    symbol: String(raw.symbol ?? ""),
    name: String(raw.name ?? raw.instrumentName ?? ""),
    issuer: String(raw.issuer ?? raw.name ?? ""),
    instrumentType: String(raw.instrumentType ?? raw.assetClass ?? "equity"),
    currency: String(raw.currency ?? "ETB"),
    status: marketState(raw.marketStatus ?? raw.tradingStatus ?? raw.status),
    lastPrice, change, changePercent, previousClose,
    open: numberOrNull(raw.open ?? raw.openingPrice),
    high: numberOrNull(raw.high ?? raw.sessionHigh),
    low: numberOrNull(raw.low ?? raw.sessionLow),
    bestBid: numberOrNull(raw.bestBid),
    bestBidQuantity: numberOrNull(raw.bestBidQuantity ?? raw.bidQuantity),
    bestOffer: numberOrNull(raw.bestOffer ?? raw.bestAsk),
    bestOfferQuantity: numberOrNull(raw.bestOfferQuantity ?? raw.askQuantity),
    volume: numberOrNull(raw.volume ?? raw.sessionVolume),
    turnover: numberOrNull(raw.turnover ?? raw.sessionTurnover),
    trades: numberOrNull(raw.numberOfTrades ?? raw.trades),
    lastTradeAt: textOrNull(raw.lastTradeAt ?? raw.lastTradeTime),
    updatedAt: textOrNull(raw.updatedAt ?? raw.timestamp ?? raw.asOf),
    feedStatus: feedState(raw.feedStatus),
  };
}
