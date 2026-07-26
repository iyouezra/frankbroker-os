import type { MarketInstrument } from "./types";

export const MARKET_STALE_AFTER_MS = Number(process.env.MARKET_DATA_STALE_AFTER_MS ?? 90_000);

export function isQuoteStale(updatedAt: string | null, now = Date.now(), thresholdMs = MARKET_STALE_AFTER_MS) {
  if (!updatedAt) return true;
  const timestamp = Date.parse(updatedAt);
  return !Number.isFinite(timestamp) || now - timestamp > thresholdMs;
}

export type OrderPriceContext =
  | "Below Best Bid"
  | "At Best Bid"
  | "Between Bid and Offer"
  | "At Best Offer"
  | "Above Best Offer"
  | "No Current Quote"
  | "Quote Stale";

export function compareOrderLimit(limit: number, quote: Pick<MarketInstrument, "bestBid" | "bestOffer" | "updatedAt">, now = Date.now(), thresholdMs = MARKET_STALE_AFTER_MS): OrderPriceContext {
  if (isQuoteStale(quote.updatedAt, now, thresholdMs)) return "Quote Stale";
  if (quote.bestBid === null || quote.bestOffer === null) return "No Current Quote";
  if (limit < quote.bestBid) return "Below Best Bid";
  if (limit === quote.bestBid) return "At Best Bid";
  if (limit < quote.bestOffer) return "Between Bid and Offer";
  if (limit === quote.bestOffer) return "At Best Offer";
  return "Above Best Offer";
}

export function marketLabel(value: string) {
  const labels: Record<string, string> = {
    pre_open: "Pre-Open",
    open: "Open",
    closed: "Closed",
    halted: "Halted",
    unavailable: "Unavailable",
    live: "Live",
    delayed: "Delayed",
    development_mock: "Development mock",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}
