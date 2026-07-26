"use client";

import { useEffect, useState } from "react";
import type { Role } from "../../../lib/frank";
import { compareOrderLimit, isQuoteStale, marketLabel } from "../../../lib/market-data/format";
import type { MarketInstrument } from "../../../lib/market-data/types";
import { BROKER_TENANT_ID, fmt } from "../shared/broker-foundation";

export function MarketContextCard({ instrumentId, orderLimit, role }: { instrumentId: string; orderLimit: number; role: Role }) {
  const [now] = useState(Date.now);
  const [quote, setQuote] = useState<MarketInstrument | null | undefined>(undefined);
  const [staleAfterMs, setStaleAfterMs] = useState(90_000);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/market?action=detail&instrumentId=${encodeURIComponent(instrumentId)}`, {
      signal: controller.signal,
      headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
    }).then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: { quote: MarketInstrument | null; staleAfterMs: number }) => { setQuote(result.quote); setStaleAfterMs(result.staleAfterMs); })
      .catch(() => { if (!controller.signal.aborted) setQuote(null); });
    return () => controller.abort();
  }, [instrumentId, role]);

  if (quote === undefined) return <div className="market-context-card loading">Loading market context…</div>;
  if (!quote) return <div className="market-context-card unavailable"><b>Market context unavailable</b><span>The OMS workflow remains available under its existing controls.</span></div>;
  const stale = isQuoteStale(quote.updatedAt, now, staleAfterMs);
  const context = compareOrderLimit(orderLimit, quote, now, staleAfterMs);
  const value = (number: number | null) => number === null ? "Unavailable" : `${fmt.format(number)} ETB`;
  return <section className={`market-context-card${stale ? " stale" : ""}`}>
    <div><span><small>MARKET CONTEXT</small><b>{quote.symbol}</b></span><em>{stale ? "Stale quote" : marketLabel(quote.feedStatus)}</em></div>
    <dl>
      <div><dt>Last trade</dt><dd>{value(quote.lastPrice)}</dd></div>
      <div><dt>Best bid</dt><dd>{value(quote.bestBid)}{quote.bestBidQuantity !== null ? ` × ${fmt.format(quote.bestBidQuantity)}` : ""}</dd></div>
      <div><dt>Best offer</dt><dd>{value(quote.bestOffer)}{quote.bestOfferQuantity !== null ? ` × ${fmt.format(quote.bestOfferQuantity)}` : ""}</dd></div>
      <div><dt>Day range</dt><dd>{quote.low === null || quote.high === null ? "Unavailable" : `${fmt.format(quote.low)}–${fmt.format(quote.high)} ETB`}</dd></div>
      <div><dt>Order limit</dt><dd>{fmt.format(orderLimit)} ETB</dd></div>
      <div><dt>Price context</dt><dd>{context}</dd></div>
      <div><dt>Market status</dt><dd>{marketLabel(quote.status)}</dd></div>
      <div><dt>Updated</dt><dd>{quote.updatedAt ? new Date(quote.updatedAt).toLocaleTimeString("en-GB") : "Unavailable"}</dd></div>
    </dl>
    {stale && <p>Quote is older than the configured threshold. It is shown for context only and does not change OMS validation.</p>}
  </section>;
}
