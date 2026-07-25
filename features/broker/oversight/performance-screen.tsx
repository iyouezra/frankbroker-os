"use client";

import { useMemo, useState } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { computeBrokerAnalytics, PERIODS, type Period } from "../../../lib/broker-analytics";
import type { OrderStatus } from "../../../lib/frank";
import { Metric, SectionHeader, StatusBadge, compactEtb, fmt } from "../shared/broker-foundation";

function TrendChart({ data, metric }: { data: { label: string; volume: number; revenue: number }[]; metric: "revenue" | "volume" }) {
  // Downsample long windows into buckets so bars stay legible (quarter/YTD).
  let display = data;
  if (data.length > 32) {
    const size = Math.ceil(data.length / 26);
    display = [];
    for (let i = 0; i < data.length; i += size) {
      const slice = data.slice(i, i + size);
      display.push({ label: slice[slice.length - 1].label, volume: slice.reduce((t, p) => t + p.volume, 0), revenue: slice.reduce((t, p) => t + p.revenue, 0) });
    }
  }
  const values = display.map((point) => (metric === "revenue" ? point.revenue : point.volume));
  const max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil(display.length / 6));
  return <div className="bar-chart" role="img" aria-label={`${metric} trend`}>
    {display.map((point, index) => <div className="bar-col" key={point.label + index} title={`${point.label} · ${compactEtb(values[index])}`}>
      <i style={{ height: `${Math.max(3, (values[index] / max) * 100)}%` }} />
      <span>{index === display.length - 1 || index % step === 0 ? point.label : ""}</span>
    </div>)}
  </div>;
}

export function PerformancePage({ orders, clients, period, setPeriod, onOpen }: { orders: DemoOrder[]; clients: BrokerClient[]; period: Period; setPeriod: (period: Period) => void; onOpen: (order: DemoOrder) => void }) {
  const [metric, setMetric] = useState<"revenue" | "volume">("revenue");
  const a = useMemo(() => computeBrokerAnalytics(orders, clients, period), [orders, clients, period]);
  const riskTotal = Math.max(1, a.risk.bands.reduce((total, band) => total + band.cash, 0));
  const flowTotal = Math.max(1, a.buySell.buy + a.buySell.sell);
  const topInstrumentMax = Math.max(1, ...a.topInstruments.map((item) => item.volume));
  const topClientMax = Math.max(1, ...a.topClients.map((item) => item.commission));

  return <>
    <SectionHeader eyebrow="BUSINESS INTELLIGENCE" title="Performance" copy="Turnover facilitated, commissions earned, and the risk profile of your client book."
      action={<div className="period-toggle">{PERIODS.map((item) => <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div>} />

    <section className="metric-grid perf-kpis">
      <Metric label="Volume facilitated" value={compactEtb(a.volume)} note={`${a.ordersFilled} filled orders`} tone="brand" />
      <Metric label="Commissions earned" value={compactEtb(a.revenue)} note={`${a.effectiveRate.toFixed(2)}% effective rate`} tone="success" />
      <Metric label="Fill rate" value={`${Math.round(a.fillRate * 100)}%`} note={`${a.ordersRejected} rejected or cancelled`} tone="purple" />
      <Metric label="Active clients" value={`${a.activeClients}`} note={`${a.newClients} new this period`} tone="warning" />
      <Metric label="Avg order size" value={compactEtb(a.avgOrderSize)} note="per filled order" tone="brand" />
    </section>

    <div className="perf-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">OVER TIME</span><h2>{metric === "revenue" ? "Commissions earned" : "Volume facilitated"}</h2></div>
          <div className="chart-toggle"><button className={metric === "revenue" ? "active" : ""} onClick={() => setMetric("revenue")}>Revenue</button><button className={metric === "volume" ? "active" : ""} onClick={() => setMetric("volume")}>Volume</button></div>
        </div>
        <div className="panel-body"><TrendChart data={a.trend} metric={metric} /></div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">FLOW & CONCENTRATION</span><h2>Where volume comes from</h2></div></div>
        <div className="panel-body">
          <div className="split-block">
            <div className="split-labels"><span><i className="dot dot-buy" />Buys <b>{Math.round((a.buySell.buy / flowTotal) * 100)}%</b></span><span><i className="dot dot-sell" />Sells <b>{Math.round((a.buySell.sell / flowTotal) * 100)}%</b></span></div>
            <div className="stack-bar"><i className="seg seg-buy" style={{ flexGrow: Math.max(0.001, a.buySell.buy) }} title={`Buys · ${compactEtb(a.buySell.buy)}`} /><i className="seg seg-sell" style={{ flexGrow: Math.max(0.001, a.buySell.sell) }} title={`Sells · ${compactEtb(a.buySell.sell)}`} /></div>
          </div>
          <ul className="rank-list">{a.topInstruments.map((item) => <li key={item.symbol}><span className="rank-label">{item.symbol}</span><i className="rank-track"><em style={{ width: `${Math.max(4, (item.volume / topInstrumentMax) * 100)}%` }} /></i><b>{compactEtb(item.volume)}</b></li>)}</ul>
        </div>
      </section>
    </div>

    <SectionHeader eyebrow="RISK & SUITABILITY" title="Client book risk profile" copy="The composition of who you trade for, and where exposure concentrates." />

    <section className="metric-grid perf-risk-kpis">
      <Metric label="Assets under administration" value={compactEtb(a.risk.totalAum)} note={`${clients.length} client accounts`} tone="brand" />
      <Metric label="Orders under enhanced review" value={`${a.risk.flaggedOrders.count}`} note={`${compactEtb(a.risk.flaggedOrders.value)} flagged`} tone={a.risk.flaggedOrders.count ? "warning" : "success"} />
      <Metric label="Largest client concentration" value={`${Math.round(a.risk.concentration.share * 100)}%`} note={`of AUM · ${a.risk.concentration.client}`} tone={a.risk.concentration.share > 0.4 ? "danger" : "purple"} />
      <Metric label="Restricted accounts" value={`${a.risk.restrictedClients}`} note={`${Math.round(a.risk.blockedRatio * 100)}% of cash blocked`} tone={a.risk.restrictedClients ? "danger" : "success"} />
    </section>

    <div className="perf-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">SUITABILITY MIX</span><h2>Clients by risk rating</h2></div></div>
        <div className="panel-body">
          <div className="stack-bar">{a.risk.bands.map((band) => <i key={band.key} className={`seg tone-${band.tone}`} style={{ flexGrow: Math.max(0.001, band.cash) }} title={`${band.label} · ${band.count} clients · ${compactEtb(band.cash)}`} />)}</div>
          <ul className="legend-list">{a.risk.bands.map((band) => <li key={band.key}><i className={`dot tone-${band.tone}`} /><span><b>{band.label}</b><small>{band.count} {band.count === 1 ? "client" : "clients"}</small></span><em>{Math.round((band.cash / riskTotal) * 100)}%</em><b className="num">{compactEtb(band.cash)}</b></li>)}</ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">ONBOARDING</span><h2>KYC status</h2></div></div>
        <div className="panel-body"><ul className="legend-list">{a.risk.kyc.map((item) => <li key={item.key}><i className={`dot tone-${item.tone}`} /><span><b>{item.label}</b></span><b className="num">{item.count}</b></li>)}</ul></div>
      </section>
    </div>

    <div className="perf-grid">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">DRILL DOWN</span><h2>Top clients by commission</h2></div></div>
        <div className="panel-body"><ul className="rank-list">{a.topClients.map((item) => <li key={item.code}><span className="rank-label rank-label-wide">{item.name}<small>{item.code}</small></span><i className="rank-track"><em style={{ width: `${Math.max(4, (item.commission / topClientMax) * 100)}%` }} /></i><b>{compactEtb(item.commission)}</b></li>)}</ul></div>
      </section>

      <section className="panel table-panel">
        <div className="panel-head"><div><span className="eyebrow">DRILL DOWN</span><h2>Largest orders</h2></div></div>
        <div className="table-scroll"><table><thead><tr><th>Order</th><th>Client</th><th>Instrument</th><th className="num">Net (ETB)</th><th>Status</th></tr></thead><tbody>{a.largestOrders.map((row) => <tr key={row.id} onClick={() => { const order = orders.find((item) => item.id === row.id); if (order) onOpen(order); }}><td><b>{row.id}</b></td><td>{row.client}</td><td><span className={`side side-${row.side}`}>{row.side.toUpperCase()}</span> <b>{row.symbol}</b></td><td className="num"><b>{fmt.format(row.net)}</b></td><td><StatusBadge status={row.status as OrderStatus} /></td></tr>)}</tbody></table></div>
      </section>
    </div>
  </>;
}
