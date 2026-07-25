"use client";

import type { DemoOrder } from "../../../lib/demo-data";
import { Icon, Metric, SectionHeader, auditTime, compactEtb, type AuditEntry, type QueueItem } from "../shared/broker-foundation";

export function Dashboard({ orders, auditEntries, queue, settlementCycle, manualTradeCapture, onViewOrders, onNewOrder, onSettle }: { orders: DemoOrder[]; auditEntries: AuditEntry[]; queue: QueueItem[]; settlementCycle: string; manualTradeCapture: boolean; onViewOrders: () => void; onOpen: (order: DemoOrder) => void; onNewOrder: () => void; onSettle: () => void }) {
  const pending = orders.filter((order) => order.status === "pending_broker_review");
  const settlement = orders.filter((order) => order.status === "settlement_pending" || order.status === "partially_filled");
  const filled = orders.filter((order) => ["partially_filled", "settlement_pending", "settled"].includes(order.status));
  const orderValue = orders.reduce((total, order) => total + order.estimatedNet, 0);
  const filledValue = filled.reduce((total, order) => total + (order.tradeNet ?? order.estimatedNet), 0);
  const settlementValue = settlement.reduce((total, order) => total + (order.tradeNet ?? order.estimatedNet), 0);
  return <>
    <SectionHeader eyebrow="TUESDAY · 14 JULY 2026" title="Good morning, Mekdes" copy="Here’s the control picture for today’s brokerage operations." action={<><button className="btn secondary" onClick={onViewOrders}>View order log</button><button className="btn primary" onClick={onNewOrder}><span>＋</span> New order</button></>} />
    <div className="manual-banner"><span>{manualTradeCapture ? "MANUAL MARKET MODE" : "TRADE CAPTURE DISABLED"}</span><p>{manualTradeCapture ? "Orders are entered and sent to ESX manually. Settlement confirmations are updated by operations." : "Platform administration has paused manual execution capture for this tenant. Existing orders and settlements remain visible."}</p></div>
    <section className="metric-grid"><Metric label="Orders in view" value={String(orders.length)} note={`${compactEtb(orderValue)} estimated value`} /><Metric label="Pending approvals" value={String(pending.length)} note={`${pending.filter((order) => order.riskFlag !== "none").length} require risk review`} tone="warning" /><Metric label="Executed orders" value={String(filled.length)} note={`${compactEtb(filledValue)} captured`} tone="success" /><Metric label="Settlement pending" value={String(settlement.length)} note={`${compactEtb(settlementValue)} due by ${settlementCycle}`} tone="purple" /><Metric label="Validation exceptions" value={String(orders.filter((order) => order.status === "validation_failed").length)} note="Orders requiring correction" tone="danger" /></section>
    <div className="dashboard-grid">
      <section className="panel queue-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL QUEUE</span><h2>Needs your attention</h2></div>{queue.length > 0 && <span className="queue-count">{queue.length} open</span>}</div>
        <div className="queue-list">{queue.length === 0
          ? <div className="queue-empty">Nothing is waiting on you right now.</div>
          : queue.slice(0, 6).map((item) => <button key={item.key} onClick={item.onOpen}><span className={`queue-icon ${item.tone}`}><Icon name={item.icon} size={16} /></span><span><b>{item.title}</b><small>{item.detail}</small></span><em>›</em></button>)}</div>
      </section>
      <section className="panel settlement-card"><div className="panel-head"><div><span className="eyebrow">SETTLEMENT POSITION</span><h2>Due by value date</h2></div><button className="text-button" onClick={onSettle}>Open queue <span>→</span></button></div><div className="settlement-bars"><div><span><b>Today</b><small>3 trades</small></span><i><em style={{ width: "82%" }} /></i><strong>ETB 1.84M</strong></div><div><span><b>Tomorrow</b><small>5 trades</small></span><i><em style={{ width: "58%" }} /></i><strong>ETB 1.22M</strong></div><div><span><b>16 Jul</b><small>2 trades</small></span><i><em style={{ width: "30%" }} /></i><strong>ETB 640K</strong></div></div><div className="settlement-foot"><span><i className="cash" /> Cash pending <b>3</b></span><span><i className="security" /> Securities pending <b>4</b></span></div></section>
      <section className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">LIVE ACTIVITY</span><h2>Latest control events</h2></div></div><div className="activity-list">{auditEntries.slice(0, 4).map((item) => <div key={item.id ?? item.time}><i /><time>{auditTime(item.time)}</time><span><b>{item.action.replaceAll("_", " ")}</b><small>{item.detail}</small></span><em>{item.actor}</em></div>)}</div></section>
    </div>
  </>;
}
