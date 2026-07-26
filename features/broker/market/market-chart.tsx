"use client";

import { useEffect, useMemo, useState } from "react";
import type { Role } from "../../../lib/frank";
import { MARKET_RANGES, type HistoryPoint, type MarketInstrument, type MarketRange } from "../../../lib/market-data/types";
import { BROKER_TENANT_ID, fmt } from "../shared/broker-foundation";

export function MarketPriceChart({ instrument, role }: { instrument: MarketInstrument; role: Role }) {
  const [range, setRange] = useState<MarketRange>("1D");
  const [result, setResult] = useState<{ key: string; points: HistoryPoint[]; unavailable: boolean }>({ key: "", points: [], unavailable: false });
  const [active, setActive] = useState<number | null>(null);

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
  const width = 680;
  const height = 180;
  const pad = 18;
  const min = Math.min(...valid.map((point) => point.price));
  const max = Math.max(...valid.map((point) => point.price));
  const span = Math.max(1, max - min);
  const coords = valid.map((point, index) => ({
    ...point,
    x: pad + index / Math.max(1, valid.length - 1) * (width - pad * 2),
    y: pad + (max - point.price) / span * (height - pad * 2),
  }));
  const selected = coords[active ?? Math.max(0, coords.length - 1)];
  const change = valid.length > 1 ? valid.at(-1)!.price - valid[0].price : 0;

  return <section className="panel market-chart">
    <div className="panel-head"><div><span className="eyebrow">TRADED PRICE</span><h2>{range} price history</h2></div><div className="market-ranges">{MARKET_RANGES.map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
    <div className="market-chart-readout"><span><small>Selected price</small><b>{selected ? `${fmt.format(selected.price)} ETB` : "Unavailable"}</b></span><span><small>Period change</small><b className={change > 0 ? "market-up" : change < 0 ? "market-down" : ""}>{valid.length > 1 ? `${change > 0 ? "+" : ""}${fmt.format(change)} ETB` : "Unavailable"}</b></span></div>
    {loading ? <div className="market-chart-state">Loading price history…</div> : unavailable ? <div className="market-chart-state">Price history is unavailable from the provider.</div> : !coords.length ? <div className="market-chart-state">No price history is available for this range.</div> :
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${instrument.name} ${range} traded price chart`}
        onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.round(((event.clientX - rect.left) / rect.width) * (coords.length - 1))); }}
        onPointerLeave={() => setActive(null)}>
        <defs><linearGradient id={`market-fill-${instrument.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c8189" stopOpacity=".25" /><stop offset="1" stopColor="#0c8189" stopOpacity="0" /></linearGradient></defs>
        <path d={`M ${coords.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coords.at(-1)!.x} ${height} L ${coords[0].x} ${height} Z`} fill={`url(#market-fill-${instrument.id})`} />
        <polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#0c8189" strokeWidth="2.5" />
        {selected && <><line x1={selected.x} x2={selected.x} y1={12} y2={height - 8} stroke="#82989a" strokeDasharray="4 4" /><circle cx={selected.x} cy={selected.y} r="5" fill="#fff" stroke="#0c8189" strokeWidth="3" /></>}
      </svg>}
  </section>;
}
