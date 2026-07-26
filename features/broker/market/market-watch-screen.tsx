"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoOrder, OrderLogResponse } from "../../../lib/demo-data";
import { hasPermission, MARKET_PERMISSIONS, type Role } from "../../../lib/frank";
import { isQuoteStale, marketLabel } from "../../../lib/market-data/format";
import type { MarketInstrument, OrderBookLevel, RecentTrade } from "../../../lib/market-data/types";
import { isMarketLinkEligible } from "../../../lib/order-log";
import { BROKER_TENANT_ID, EmptyState, SectionHeader, fmt, hydrateOrders } from "../shared/broker-foundation";
import { MarketPriceChart } from "./market-chart";
import { useMarketData } from "./use-market-data";

type OrderFocus = { instrumentId: string; symbol: string; side?: "buy" | "sell"; status: "open" | "history" };

export function MarketWatchPage({ role, orders, onOpenOrder, onViewOrders }: {
  role: Role;
  orders: DemoOrder[];
  onOpenOrder: (order: DemoOrder) => void;
  onViewOrders: (focus: OrderFocus) => void;
}) {
  const { data, loading, refreshing, error, retry } = useMarketData(role);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<"symbol" | "price" | "change" | "volume">("symbol");
  const [actionSide, setActionSide] = useState<"buy" | "sell" | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(data?.instruments ?? [])]
      .filter((item) => (!needle || `${item.symbol} ${item.name}`.toLowerCase().includes(needle))
        && (typeFilter === "all" || item.instrumentType === typeFilter)
        && (statusFilter === "all" || item.status === statusFilter))
      .sort((left, right) => sort === "symbol" ? left.symbol.localeCompare(right.symbol)
        : sort === "price" ? (right.lastPrice ?? -Infinity) - (left.lastPrice ?? -Infinity)
          : sort === "change" ? (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity)
            : (right.volume ?? -Infinity) - (left.volume ?? -Infinity));
  }, [data, query, sort, statusFilter, typeFilter]);
  const effectiveSelectedId = data?.instruments.some((item) => item.id === selectedId) ? selectedId : data?.instruments[0]?.id ?? "";
  const selected = data?.instruments.find((item) => item.id === effectiveSelectedId) ?? null;
  const types = [...new Set((data?.instruments ?? []).map((item) => item.instrumentType))];

  if (loading && !data) return <><SectionHeader eyebrow="ESX MARKET DATA" title="Market Watch" copy="Loading permitted instruments and current market state." /><div className="market-loading"><span /><span /><span /></div></>;
  if (error && !data) return <><SectionHeader eyebrow="ESX MARKET DATA" title="Market Watch" copy="Live market visibility for broker operations." /><div className="panel market-unavailable"><b>Market data unavailable</b><p>{error}</p><button className="btn secondary" onClick={retry}>Retry</button></div></>;

  return <>
    <SectionHeader eyebrow="ESX MARKET DATA" title="Market Watch" copy="Live quote context connected to existing client orders. No orders are created from this page." action={refreshing ? <span className="market-refreshing">Refreshing…</span> : undefined} />
    {data && <MarketStatus summary={data.summary} providerMode={data.providerMode} staleAfterMs={data.staleAfterMs} />}
    {error && <div className="market-warning"><b>Refresh failed.</b> Last successful market data remains visible. {error}</div>}
    {data?.instruments.length === 0 ? <div className="panel"><EmptyState title="No permitted instruments" copy="This tenant has no enabled ESX instruments or the provider returned none." /></div> :
      <div className="market-layout">
        <section className="panel market-watchlist">
          <div className="market-controls">
            <label className="market-search">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Symbol or instrument" /></label>
            <label>Type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{["open", "pre_open", "closed", "halted", "unavailable"].map((status) => <option key={status} value={status}>{marketLabel(status)}</option>)}</select></label>
            <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="symbol">Symbol</option><option value="price">Last price</option><option value="change">Price change</option><option value="volume">Volume</option></select></label>
          </div>
          <InstrumentTable rows={filtered} selectedId={effectiveSelectedId} onSelect={(id) => { setSelectedId(id); setActionSide(null); }} />
        </section>
        {selected && <div className="market-detail-column">
          <InstrumentDetail instrument={selected} role={role} staleAfterMs={data?.staleAfterMs ?? 90_000} />
          <MarketPriceChart instrument={selected} role={role} />
          <OrderActions instrument={selected} role={role} orders={orders} side={actionSide} setSide={setActionSide} onOpenOrder={onOpenOrder} onViewOrders={onViewOrders} />
        </div>}
      </div>}
  </>;
}

function MarketStatus({ summary, providerMode, staleAfterMs }: { summary: NonNullable<ReturnType<typeof useMarketData>["data"]>["summary"]; providerMode: string; staleAfterMs: number }) {
  const [now] = useState(Date.now);
  const stale = isQuoteStale(summary.updatedAt, now, staleAfterMs);
  const value = (number: number | null, currency = false) => number === null ? "Unavailable" : `${fmt.format(number)}${currency ? " ETB" : ""}`;
  return <section className={`market-status-bar ${stale ? "stale" : ""}`}>
    <div className="market-state"><small>MARKET</small><b>{marketLabel(summary.marketStatus)}</b><span>{summary.session ?? "Session unavailable"}</span></div>
    <div><small>Trading date</small><b>{summary.tradingDate ?? "Unavailable"}</b></div>
    <div><small>Turnover</small><b>{value(summary.totalTurnover, true)}</b></div>
    <div><small>Volume / trades</small><b>{value(summary.totalVolume)} / {value(summary.trades)}</b></div>
    <div><small>Advance / decline / unchanged</small><b>{value(summary.advancing)} / {value(summary.declining)} / {value(summary.unchanged)}</b></div>
    <div className="market-feed"><small>FEED STATUS</small><b>{stale ? "Stale" : marketLabel(summary.feedStatus)}</b><span>{providerMode === "development_mock" ? "Development data · not live" : summary.updatedAt ? `Updated ${new Date(summary.updatedAt).toLocaleString("en-GB")}` : "No successful update"}</span></div>
  </section>;
}

function InstrumentTable({ rows, selectedId, onSelect }: { rows: MarketInstrument[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="No instruments match" copy="Change the search or filters to see permitted instruments." />;
  const price = (value: number | null) => value === null ? "Unavailable" : fmt.format(value);
  return <div className="table-scroll"><table className="market-table"><thead><tr><th>Symbol</th><th>Instrument</th><th className="num">Last price</th><th className="num">Change</th><th className="num">Best bid</th><th className="num">Best offer</th><th className="num">Volume</th><th>Status</th></tr></thead><tbody>{rows.map((item) => {
    const tone = (item.change ?? 0) > 0 ? "market-up" : (item.change ?? 0) < 0 ? "market-down" : "market-flat";
    return <tr key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => onSelect(item.id)}>
      <td><b>{item.symbol}</b></td><td><b>{item.name}</b><small>{item.instrumentType}</small></td>
      <td className="num"><b>{price(item.lastPrice)}</b><small>{item.currency}</small></td>
      <td className={`num ${tone}`}><b>{item.change === null ? "Unavailable" : `${item.change > 0 ? "+" : ""}${fmt.format(item.change)}`}</b><small>{item.changePercent === null ? "" : `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`}</small></td>
      <td className="num">{price(item.bestBid)}</td><td className="num">{price(item.bestOffer)}</td><td className="num">{price(item.volume)}</td>
      <td><span className={`market-badge ${item.status}`}>{marketLabel(item.status)}</span></td>
    </tr>;
  })}</tbody></table></div>;
}

function InstrumentDetail({ instrument, role, staleAfterMs }: { instrument: MarketInstrument; role: Role; staleAfterMs: number }) {
  const [now] = useState(Date.now);
  const stale = isQuoteStale(instrument.updatedAt, now, staleAfterMs);
  const [extra, setExtra] = useState<{ orderBook: { bids: OrderBookLevel[]; offers: OrderBookLevel[] }; recentTrades: RecentTrade[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/market?action=detail&instrumentId=${encodeURIComponent(instrument.id)}`, { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => setExtra(result))
      .catch(() => setExtra({ orderBook: { bids: [], offers: [] }, recentTrades: [] }));
    return () => controller.abort();
  }, [instrument.id, role]);
  const price = (value: number | null) => value === null ? "Unavailable" : `${fmt.format(value)} ${instrument.currency}`;
  return <section className="panel instrument-detail">
    <div className="instrument-quote-head"><div><span className="eyebrow">{instrument.instrumentType} · {instrument.symbol}</span><h2>{instrument.name}</h2><p>{instrument.issuer}</p></div><div><strong>{price(instrument.lastPrice)}</strong><span className={(instrument.change ?? 0) > 0 ? "market-up" : (instrument.change ?? 0) < 0 ? "market-down" : ""}>{instrument.change === null ? "Change unavailable" : `${instrument.change > 0 ? "▲ +" : instrument.change < 0 ? "▼ " : "— "}${fmt.format(instrument.change)} (${instrument.changePercent?.toFixed(2) ?? "—"}%)`}</span></div></div>
    <div className="quote-state-line"><span className={`market-badge ${instrument.status}`}>{marketLabel(instrument.status)}</span><span className={stale ? "stale" : ""}>{stale ? "Stale quote" : marketLabel(instrument.feedStatus)}</span><span>{instrument.updatedAt ? `As of ${new Date(instrument.updatedAt).toLocaleString("en-GB")}` : "Update unavailable"}</span></div>
    <dl className="market-detail-grid">
      {[["Previous close", price(instrument.previousClose)], ["Open", price(instrument.open)], ["Session high", price(instrument.high)], ["Session low", price(instrument.low)], ["Best bid", `${price(instrument.bestBid)}${instrument.bestBidQuantity !== null ? ` × ${fmt.format(instrument.bestBidQuantity)}` : ""}`], ["Best offer", `${price(instrument.bestOffer)}${instrument.bestOfferQuantity !== null ? ` × ${fmt.format(instrument.bestOfferQuantity)}` : ""}`], ["Volume", instrument.volume === null ? "Unavailable" : fmt.format(instrument.volume)], ["Turnover", price(instrument.turnover)], ["Trades", instrument.trades === null ? "Unavailable" : fmt.format(instrument.trades)], ["Last trade", instrument.lastTradeAt ? new Date(instrument.lastTradeAt).toLocaleTimeString("en-GB") : "Unavailable"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="market-microstructure"><div><h3>Order book preview</h3>{extra?.orderBook.bids.length || extra?.orderBook.offers.length ? <table><thead><tr><th>Bid qty</th><th>Bid</th><th>Offer</th><th>Offer qty</th></tr></thead><tbody>{[0, 1, 2].map((index) => <tr key={index}><td>{extra?.orderBook.bids[index]?.quantity ?? "—"}</td><td>{extra?.orderBook.bids[index]?.price ?? "—"}</td><td>{extra?.orderBook.offers[index]?.price ?? "—"}</td><td>{extra?.orderBook.offers[index]?.quantity ?? "—"}</td></tr>)}</tbody></table> : <p>No order-book depth is available.</p>}</div><div><h3>Recent trades</h3>{extra?.recentTrades.length ? extra.recentTrades.slice(0, 4).map((trade) => <span key={trade.id}><b>{fmt.format(trade.price)} ETB</b><small>{fmt.format(trade.quantity)} · {new Date(trade.timestamp).toLocaleTimeString("en-GB")}</small></span>) : <p>No recent trades are available.</p>}</div></div>
  </section>;
}

function OrderActions({ instrument, role, orders, side, setSide, onOpenOrder, onViewOrders }: { instrument: MarketInstrument; role: Role; orders: DemoOrder[]; side: "buy" | "sell" | null; setSide: (side: "buy" | "sell" | null) => void; onOpenOrder: (order: DemoOrder) => void; onViewOrders: (focus: OrderFocus) => void }) {
  const canLink = hasPermission(role, MARKET_PERMISSIONS.orderLink);
  return <section className="panel market-order-actions"><div className="panel-head"><div><span className="eyebrow">EXISTING OMS ORDERS</span><h2>Order-related actions</h2></div></div><div className="market-order-buttons"><button className="btn primary" disabled={!canLink} onClick={() => setSide("buy")}>Buy</button><button className="btn primary sell-action" disabled={!canLink} onClick={() => setSide("sell")}>Sell</button><button className="btn secondary" onClick={() => onViewOrders({ instrumentId: instrument.id, symbol: instrument.symbol, status: "open" })}>View open orders</button><button className="btn secondary" onClick={() => onViewOrders({ instrumentId: instrument.id, symbol: instrument.symbol, status: "history" })}>View order history</button></div>
    {!canLink && <p className="permission-note">Read-only market access. This role cannot initiate Buy or Sell order linkage.</p>}
    {side && canLink && <EligibleOrderSelector instrument={instrument} side={side} role={role} fallbackOrders={orders} onSelect={onOpenOrder} onClose={() => setSide(null)} />}
  </section>;
}

function EligibleOrderSelector({ instrument, side, role, fallbackOrders, onSelect, onClose }: { instrument: MarketInstrument; side: "buy" | "sell"; role: Role; fallbackOrders: DemoOrder[]; onSelect: (order: DemoOrder) => void; onClose: () => void }) {
  const [rows, setRows] = useState<DemoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ pageSize: "100", instrumentId: instrument.id, side, eligibleForMarket: "true" });
    void fetch(`/api/orders?${params}`, { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: OrderLogResponse) => setRows(hydrateOrders(result.orders)))
      .catch(() => setRows(fallbackOrders.filter((order) => order.instrumentId === instrument.id && order.side === side && isMarketLinkEligible(order))))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fallbackOrders, instrument.id, role, side]);
  return <div className="eligible-order-selector"><div><b>Select an existing {side} order</b><button onClick={onClose}>Close</button></div>{loading ? <p>Loading eligible orders…</p> : rows.length === 0 ? <p>No eligible {side} orders with remaining quantity exist for {instrument.symbol}.</p> : rows.map((order) => <button key={order.id} onClick={() => onSelect(order)}><span><b>{order.id}</b><small>{order.client} · {order.accountNumber ?? order.accountId}</small></span><span><b>{fmt.format(order.remainingQuantity ?? order.quantity)} remaining</b><small>{order.status.replaceAll("_", " ")}</small></span><i>Continue to OMS →</i></button>)}</div>;
}

export type { OrderFocus };
