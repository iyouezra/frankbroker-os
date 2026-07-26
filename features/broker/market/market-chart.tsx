"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Role } from "../../../lib/frank";
import { MARKET_RANGES, type HistoryPoint, type MarketInstrument, type MarketRange } from "../../../lib/market-data/types";
import { BROKER_TENANT_ID, fmt } from "../shared/broker-foundation";

export function MarketPriceChart({ instrument, role }: { instrument: MarketInstrument; role: Role }) {
  const [range, setRange] = useState<MarketRange>("1D");
  const [result, setResult] = useState<{ key: string; points: HistoryPoint[]; unavailable: boolean }>({ key: "", points: [], unavailable: false });
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");

  useEffect(() => {
    const controller = new AbortController();
    const key = `${instrument.id}:${range}`;
    void fetch(`/api/market?action=history&instrumentId=${encodeURIComponent(instrument.id)}&range=${range}`, {
      signal: controller.signal,
      headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
    }).then((response) => response.ok ? response.json() : Promise.reject())
      .then((response: { points: HistoryPoint[] }) => setResult({ key, points: response.points.filter((point) => Number.isFinite(point.price)), unavailable: false }))
      .catch(() => { if (!controller.signal.aborted) setResult({ key, points: [], unavailable: true }); });
    return () => controller.abort();
  }, [instrument.id, range, role]);

  const requestKey = `${instrument.id}:${range}`;
  const loading = result.key !== requestKey;
  const unavailable = result.key === requestKey && result.unavailable;
  const valid = useMemo(() => result.key === requestKey ? result.points.filter((point): point is HistoryPoint & { price: number } => point.price !== null) : [], [requestKey, result]);
  const width = 820;
  const height = 290;
  const plotLeft = 18;
  const plotRight = 742;
  const priceTop = 18;
  const priceBottom = 190;
  const volumeTop = 215;
  const volumeBottom = 268;
  const rawMin = Math.min(...valid.map((point) => point.price));
  const rawMax = Math.max(...valid.map((point) => point.price));
  const pricePadding = Math.max((rawMax - rawMin) * .12, (instrument.lastPrice ?? 1) * .0025);
  const min = rawMin - pricePadding;
  const max = rawMax + pricePadding;
  const span = Math.max(1, max - min);
  const maxVolume = Math.max(1, ...valid.map((point) => point.volume ?? 0));
  const barWidth = Math.max(2, ((plotRight - plotLeft) / Math.max(valid.length, 1)) * .55);
  const coords = valid.map((point, index) => ({
    ...point,
    x: plotLeft + index / Math.max(1, valid.length - 1) * (plotRight - plotLeft),
    y: priceBottom - (point.price - min) / span * (priceBottom - priceTop),
  }));
  const selected = coords[active ?? Math.max(0, coords.length - 1)];
  const change = valid.length > 1 ? selected.price - valid[0].price : 0;
  const changePercent = valid.length > 1 ? change / valid[0].price * 100 : 0;
  const positive = change >= 0;
  const stroke = positive ? "#0c8189" : "#b84949";
  const gridValues = [max, (max + min) / 2, min];
  const firstTimestamp = valid[0]?.timestamp;
  const lastTimestamp = valid.at(-1)?.timestamp;
  const formatDate = (timestamp?: string) => timestamp ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(timestamp)) : "";

  return <section className="panel market-chart">
    <div className="panel-head market-chart-head"><div><span className="eyebrow">TRADED PRICE</span><h2>{instrument.symbol} price history</h2></div><span className={`market-chart-period ${positive ? "market-up" : "market-down"}`}>{valid.length > 1 ? `${positive ? "+" : ""}${changePercent.toFixed(2)}% ${range}` : "Change unavailable"}</span></div>
    <div className="market-chart-readout"><span><small>Selected price</small><b>{selected ? `${fmt.format(selected.price)} ${instrument.currency}` : "Unavailable"}</b><em>{selected ? new Date(selected.timestamp).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: range === "1D" ? "short" : undefined }) : ""}</em></span><span><small>Change from period open</small><b className={change > 0 ? "market-up" : change < 0 ? "market-down" : ""}>{valid.length > 1 ? `${change > 0 ? "+" : ""}${fmt.format(change)} ${instrument.currency}` : "Unavailable"}</b></span></div>
    {loading ? <div className="market-chart-state">Loading price history…</div> : unavailable ? <div className="market-chart-state">Price history is unavailable from the provider.</div> : !coords.length ? <div className="market-chart-state">No price history is available for this range.</div> :
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${instrument.name} ${range} traded price chart`}
        onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const viewX = (event.clientX - rect.left) / rect.width * width; setActive(Math.max(0, Math.min(coords.length - 1, Math.round((viewX - plotLeft) / (plotRight - plotLeft) * (coords.length - 1))))); }}
        onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const viewX = (event.clientX - rect.left) / rect.width * width; setActive(Math.max(0, Math.min(coords.length - 1, Math.round((viewX - plotLeft) / (plotRight - plotLeft) * (coords.length - 1))))); }}
        onPointerLeave={() => setActive(null)}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity=".18" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
        {gridValues.map((value) => <g key={value}><line x1={plotLeft} y1={priceBottom - (value - min) / span * (priceBottom - priceTop)} x2={plotRight} y2={priceBottom - (value - min) / span * (priceBottom - priceTop)} className="market-chart-grid" /><text x={width - 12} y={priceBottom - (value - min) / span * (priceBottom - priceTop) + 4} textAnchor="end" className="market-chart-axis">{fmt.format(value)}</text></g>)}
        <line x1={plotLeft} y1={coords[0].y} x2={plotRight} y2={coords[0].y} className="market-chart-baseline" />
        <path d={`M ${coords.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coords.at(-1)!.x} ${priceBottom} L ${coords[0].x} ${priceBottom} Z`} fill={`url(#${gradientId})`} />
        <polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point) => point.volume ? <rect key={point.timestamp} x={point.x - barWidth / 2} y={volumeBottom - point.volume / maxVolume * (volumeBottom - volumeTop)} width={barWidth} height={point.volume / maxVolume * (volumeBottom - volumeTop)} rx="1.5" className="market-chart-volume" /> : null)}
        {selected && <><line x1={selected.x} x2={selected.x} y1={priceTop} y2={volumeBottom} className="market-chart-cursor" /><circle cx={selected.x} cy={selected.y} r="7" fill="var(--fx-card)" stroke={stroke} strokeWidth="4" /></>}
      </svg>}
    {!loading && !unavailable && coords.length > 0 && <div className="market-chart-dates"><span>{formatDate(firstTimestamp)}</span><span>Volume</span><span>{formatDate(lastTimestamp)}</span></div>}
    <div className="market-ranges">{MARKET_RANGES.map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => { setRange(item); setActive(null); }}>{item}</button>)}</div>
  </section>;
}
