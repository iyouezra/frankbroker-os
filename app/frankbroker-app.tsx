"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { demoAudit, demoClients, demoInstruments, initialOrders, type DemoOrder } from "../lib/demo-data";
import { calculateOrderAmounts, hasPermission, roleLabels, type OrderStatus, type Role } from "../lib/frank";

type View = "dashboard" | "orders" | "clients" | "instruments" | "settlement" | "reconciliation" | "reports" | "audit";
type Drawer = "new" | "detail" | "trade" | "contract" | null;
type NewOrderValue = { accountId: string; instrumentId: string; side: "buy" | "sell"; quantity: string; price: string; orderType: string; validity: string; notes: string };
type TradeValue = { quantity: string; price: string; tradeDate: string };

const navItems: { id: View; label: string; short: string }[] = [
  { id: "dashboard", label: "Dashboard", short: "DB" },
  { id: "orders", label: "Order blotter", short: "OR" },
  { id: "clients", label: "Clients & accounts", short: "CL" },
  { id: "instruments", label: "Instrument master", short: "IM" },
  { id: "settlement", label: "Settlement", short: "ST" },
  { id: "reconciliation", label: "Reconciliation", short: "RC" },
  { id: "reports", label: "Reports", short: "RP" },
  { id: "audit", label: "Audit trail", short: "AU" },
];

const statusLabels: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  validation_failed: "Validation failed",
  pending_broker_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  sent_to_esx_manually: "Sent to ESX",
  partially_filled: "Partially filled",
  filled: "Filled",
  cancelled: "Cancelled",
  expired: "Expired",
  settlement_pending: "Settlement pending",
  settled: "Settled",
};

const statusTone: Record<OrderStatus, string> = {
  draft: "neutral",
  submitted: "info",
  validation_failed: "danger",
  pending_broker_review: "warning",
  approved: "brand",
  rejected: "danger",
  sent_to_esx_manually: "info",
  partially_filled: "purple",
  filled: "success",
  cancelled: "neutral",
  expired: "neutral",
  settlement_pending: "warning",
  settled: "success",
};

const fmt = new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 });
const etb = (value: number) => `${fmt.format(value)} ETB`;

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status status-${statusTone[status]}`}><i />{statusLabels[status]}</span>;
}

function SectionHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>
      {action && <div className="section-actions">{action}</div>}
    </div>
  );
}

function Metric({ label, value, note, tone = "brand" }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`metric metric-${tone}`}><div className="metric-top"><span>{label}</span><i /></div><strong>{value}</strong><small>{note}</small></article>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>✓</span><strong>{title}</strong><p>{copy}</p></div>;
}

export default function FrankBrokerApp({ userName }: { userName: string }) {
  const [view, setView] = useState<View>("dashboard");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState<string>(initialOrders[0].id);
  const [orders, setOrders] = useState<DemoOrder[]>(initialOrders);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>("broker_admin");
  const [toast, setToast] = useState<string | null>(null);
  const [reconFile, setReconFile] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState({ accountId: "acc_meron", instrumentId: "ins_ethio_telecom", side: "buy" as "buy" | "sell", quantity: "1000", price: "312.5", orderType: "Limit", validity: "Day", notes: "" });
  const [checks, setChecks] = useState<{ label: string; passed: boolean; message: string }[] | null>(null);
  const [tradeForm, setTradeForm] = useState({ quantity: "", price: "", tradeDate: "2026-07-14" });

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => [order.id, order.client, order.clientCode, order.symbol, order.status].some((value) => String(value).toLowerCase().includes(needle)));
  }, [orders, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  };

  const openDetail = (order: DemoOrder) => {
    setSelectedId(order.id);
    setDrawer("detail");
  };

  const updateStatus = (id: string, status: OrderStatus, extra: Partial<DemoOrder> = {}) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status, ...extra } : order));
  };

  const persistAction = async (id: string, payload: Record<string, unknown>) => {
    try {
      await fetch(`/api/orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify(payload),
      });
    } catch {
      // The in-product demo remains interactive when the local D1 binding is unavailable.
    }
  };

  const actionOrder = (action: "approve" | "reject" | "settle") => {
    const permission = action === "settle" ? "settle" : action;
    if (!hasPermission(role, permission)) return notify(`${roleLabels[role]} cannot ${action} orders.`);
    const nextStatus: OrderStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "settled";
    updateStatus(selected.id, nextStatus);
    void persistAction(selected.id, { action, reason: action === "reject" ? "Rejected after compliance review" : undefined });
    notify(`${selected.id} marked ${statusLabels[nextStatus].toLowerCase()}. Audit event recorded.`);
    setDrawer(null);
  };

  const openTrade = (order: DemoOrder) => {
    if (!hasPermission(role, "trade")) return notify(`${roleLabels[role]} cannot capture trades.`);
    setSelectedId(order.id);
    setTradeForm({ quantity: String(order.quantity), price: String(order.price), tradeDate: "2026-07-14" });
    setDrawer("trade");
  };

  const captureTrade = (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(tradeForm.quantity);
    const price = Number(tradeForm.price);
    if (!quantity || !price || quantity > selected.quantity) return notify("Enter a valid execution quantity and price.");
    const partial = quantity < selected.quantity;
    const tradeId = `TRD-2026-${String(780 + orders.filter((order) => order.tradeId).length)}`;
    const settlementDate = selected.symbol.startsWith("TB") ? "2026-07-15" : "2026-07-16";
    updateStatus(selected.id, partial ? "partially_filled" : "settlement_pending", { price, tradeId, settlementDate });
    void persistAction(selected.id, { action: "execute", executionPrice: price, quantityFilled: quantity, tradeDate: tradeForm.tradeDate });
    setDrawer(null);
    notify(`${tradeId} captured. Settlement is due ${settlementDate}.`);
  };

  const runValidation = () => {
    const client = demoClients.find((item) => item.accountId === newOrder.accountId)!;
    const instrument = demoInstruments.find((item) => item.id === newOrder.instrumentId)!;
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    const amounts = calculateOrderAmounts(newOrder.side, quantity, price);
    const owned = client.accountId === "acc_meron" && instrument.symbol === "WEGA" ? 2000 : client.accountId === "acc_blue" && instrument.symbol === "WEGA" ? 5200 : 0;
    const results = [
      { label: "Client and account", passed: Boolean(client), message: `${client.code} · ${client.status}` },
      { label: "KYC approved", passed: client.kyc === "Approved", message: client.kyc },
      { label: "Account active", passed: client.status === "Active", message: client.status },
      { label: "Instrument tradable", passed: instrument.status === "Tradable", message: `${instrument.symbol} · ${instrument.status}` },
      { label: "Quantity valid", passed: quantity > 0 && quantity % instrument.lot === 0, message: `Lot size ${instrument.lot}` },
      { label: "Price valid", passed: price > 0 && Math.abs(price / instrument.tick - Math.round(price / instrument.tick)) < 0.001, message: `Tick size ${instrument.tick} ETB` },
      newOrder.side === "buy"
        ? { label: "Cash including fees", passed: client.available >= amounts.net, message: `${etb(client.available)} available` }
        : { label: "Available, unblocked holdings", passed: owned >= quantity, message: `${fmt.format(owned)} ${instrument.symbol} available` },
    ];
    setChecks(results);
    notify(results.every((item) => item.passed) ? "All pre-trade checks passed." : "Validation found checks that need attention.");
  };

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    if (!checks?.every((item) => item.passed)) return notify("Run validation and resolve failed checks before submission.");
    const client = demoClients.find((item) => item.accountId === newOrder.accountId)!;
    const instrument = demoInstruments.find((item) => item.id === newOrder.instrumentId)!;
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    const amounts = calculateOrderAmounts(newOrder.side, quantity, price);
    const id = `ORD-2026-${1049 + orders.length - initialOrders.length}`;
    const optimistic: DemoOrder = {
      id, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), createdAt: new Date().toISOString(), client: client.name, clientCode: client.code,
      accountId: client.accountId, instrumentId: instrument.id, symbol: instrument.symbol, side: newOrder.side, quantity, price, orderType: newOrder.orderType,
      estimatedGross: amounts.gross, estimatedFees: amounts.fees, estimatedNet: amounts.net, status: "pending_broker_review", source: "Manual", trader: "Unassigned", riskFlag: amounts.net >= 2_000_000 ? "review" : "none",
    };
    setOrders((current) => [optimistic, ...current]);
    setDrawer(null);
    setChecks(null);
    setView("orders");
    notify(`${id} submitted for broker review.`);
    void fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ ...newOrder, quantity, price }) })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result?.order) setOrders((current) => current.map((order) => order.id === id ? { ...order, ...result.order, time: order.time, trader: order.trader } : order));
      })
      .catch(() => undefined);
  };

  const exportOrders = () => {
    const rows = [["Order ID", "Client", "Instrument", "Side", "Quantity", "Price", "Status"], ...orders.map((order) => [order.id, order.client, order.symbol, order.side, String(order.quantity), String(order.price), statusLabels[order.status]])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "frankbroker-daily-orders-2026-07-14.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("Daily order report exported as CSV.");
  };

  const openNewOrder = () => {
    if (!hasPermission(role, "create")) return notify(`${roleLabels[role]} has read-only access.`);
    setChecks(null);
    setDrawer("new");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark"><img src="/frankscore-icon.png" alt="FrankScore" /></span><span><b>FrankBroker</b><small>OPERATING SYSTEM</small></span></div>
        <div className="broker-chip"><span>AB</span><div><b>Abyssinia Securities</b><small>License: ESCA-BR-004</small></div><i>⌄</i></div>
        <nav aria-label="Main navigation">
          <span className="nav-label">OPERATIONS</span>
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setDrawer(null); }}><i>{item.short}</i><span>{item.label}</span>{item.id === "orders" && <em>3</em>}{item.id === "reconciliation" && <em className="warn">2</em>}</button>)}
        </nav>
        <div className="sidebar-foot"><div className="system-state"><i /><span><b>Manual market mode</b><small>ESX / CSD disconnected by design</small></span></div><p>FrankBroker OS <b>MVP 0.1</b></p></div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><img src="/frankscore-icon.png" alt="" /><b>FrankBroker</b></div>
          <label className="search"><span>⌕</span><input aria-label="Search orders, clients, or instruments" placeholder="Search orders, clients, instruments…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><span className="business-date">Business date <b>14 JUL 2026</b></span><button className="icon-button" aria-label="Notifications">◌<em>3</em></button><div className="user-control"><span>MT</span><label><b>{userName}</b><select aria-label="Demo role" value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div></div>
        </header>

        <main>
          {view === "dashboard" && <Dashboard orders={orders} onViewOrders={() => setView("orders")} onOpen={openDetail} onNewOrder={openNewOrder} onSettle={() => setView("settlement")} />}
          {view === "orders" && <OrdersPage orders={filteredOrders} onOpen={openDetail} onNewOrder={openNewOrder} onExport={exportOrders} />}
          {view === "clients" && <ClientsPage />}
          {view === "instruments" && <InstrumentsPage />}
          {view === "settlement" && <SettlementPage orders={orders} onOpen={openDetail} />}
          {view === "reconciliation" && <ReconciliationPage file={reconFile} onFile={(name) => { setReconFile(name); notify(`${name} staged for reconciliation.`); }} />}
          {view === "reports" && <ReportsPage onExport={exportOrders} />}
          {view === "audit" && <AuditPage />}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.slice(0, 5).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.short}</i><span>{item.label.split(" ")[0]}</span></button>)}</nav>
      </div>

      {drawer && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className={`drawer ${drawer === "contract" ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={drawer === "new" ? "New order" : drawer === "trade" ? "Capture trade" : drawer === "contract" ? "Contract note" : "Order details"}>
          <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close">×</button>
          {drawer === "new" && <NewOrderForm value={newOrder} setValue={setNewOrder} checks={checks} onValidate={runValidation} onSubmit={submitOrder} />}
          {drawer === "detail" && <OrderDetail order={selected} role={role} onApprove={() => actionOrder("approve")} onReject={() => actionOrder("reject")} onTrade={() => openTrade(selected)} onSettle={() => actionOrder("settle")} onContract={() => setDrawer("contract")} />}
          {drawer === "trade" && <TradeForm order={selected} value={tradeForm} setValue={setTradeForm} onSubmit={captureTrade} />}
          {drawer === "contract" && <ContractNote order={selected} onPrint={() => window.print()} />}
        </aside>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({ orders, onViewOrders, onOpen, onNewOrder, onSettle }: { orders: DemoOrder[]; onViewOrders: () => void; onOpen: (order: DemoOrder) => void; onNewOrder: () => void; onSettle: () => void }) {
  const pending = orders.filter((order) => order.status === "pending_broker_review");
  const settlement = orders.filter((order) => order.status === "settlement_pending" || order.status === "partially_filled");
  return <>
    <SectionHeader eyebrow="TUESDAY · 14 JULY 2026" title="Good morning, Mekdes" copy="Here’s the control picture for today’s brokerage operations." action={<><button className="btn secondary" onClick={onViewOrders}>View blotter</button><button className="btn primary" onClick={onNewOrder}><span>＋</span> New order</button></>} />
    <div className="manual-banner"><span>MANUAL MARKET MODE</span><p>Orders are entered and sent to ESX manually. Settlement confirmations are updated by operations.</p><button>Integration readiness <b>View</b></button></div>
    <section className="metric-grid"><Metric label="Today’s orders" value={String(orders.length + 16)} note="ETB 8.42M estimated value" /><Metric label="Pending approvals" value={String(pending.length + 2)} note="1 requires enhanced review" tone="warning" /><Metric label="Filled today" value="11" note="ETB 4.18M executed" tone="success" /><Metric label="Settlement pending" value={String(settlement.length + 3)} note="ETB 3.06M due by T+2" tone="purple" /><Metric label="Recon exceptions" value="2" note="ETB 18,750 variance" tone="danger" /></section>
    <div className="dashboard-grid">
      <section className="panel queue-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL QUEUE</span><h2>Needs your attention</h2></div><button className="text-button" onClick={onViewOrders}>View all <span>→</span></button></div>
        <div className="queue-list">{[...pending, ...orders.filter((order) => order.status === "validation_failed")].slice(0, 3).map((order) => <button key={order.id} onClick={() => onOpen(order)}><span className={`queue-icon ${order.status === "validation_failed" ? "danger" : "warning"}`}>{order.status === "validation_failed" ? "!" : "↗"}</span><span><b>{order.status === "validation_failed" ? "Validation failed" : "Order awaiting approval"}</b><small>{order.id} · {order.client} · {order.side.toUpperCase()} {fmt.format(order.quantity)} {order.symbol}</small></span><StatusBadge status={order.status} /><em>›</em></button>)}</div>
      </section>
      <section className="panel settlement-card"><div className="panel-head"><div><span className="eyebrow">SETTLEMENT POSITION</span><h2>Due by value date</h2></div><button className="text-button" onClick={onSettle}>Open queue <span>→</span></button></div><div className="settlement-bars"><div><span><b>Today</b><small>3 trades</small></span><i><em style={{ width: "82%" }} /></i><strong>ETB 1.84M</strong></div><div><span><b>Tomorrow</b><small>5 trades</small></span><i><em style={{ width: "58%" }} /></i><strong>ETB 1.22M</strong></div><div><span><b>16 Jul</b><small>2 trades</small></span><i><em style={{ width: "30%" }} /></i><strong>ETB 640K</strong></div></div><div className="settlement-foot"><span><i className="cash" /> Cash pending <b>3</b></span><span><i className="security" /> Securities pending <b>4</b></span></div></section>
      <section className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">LIVE ACTIVITY</span><h2>Latest control events</h2></div><button className="text-button">Audit trail <span>→</span></button></div><div className="activity-list">{demoAudit.slice(0, 4).map((item) => <div key={item.time}><i /><time>{item.time}</time><span><b>{item.action.replaceAll("_", " ")}</b><small>{item.detail}</small></span><em>{item.actor}</em></div>)}</div></section>
    </div>
  </>;
}

function OrdersPage({ orders, onOpen, onNewOrder, onExport }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void; onNewOrder: () => void; onExport: () => void }) {
  return <><SectionHeader eyebrow="ORDER MANAGEMENT" title="Order blotter" copy="Capture, review, execute, and trace every client instruction." action={<><button className="btn secondary" onClick={onExport}>Export CSV</button><button className="btn primary" onClick={onNewOrder}>＋ New order</button></>} /><div className="filter-row"><button className="filter active">All orders <b>{orders.length}</b></button><button className="filter">Pending review <b>{orders.filter((o) => o.status === "pending_broker_review").length}</b></button><button className="filter">Approved</button><button className="filter">Executed</button><button className="filter">Exceptions</button><span /><button className="filter-control">☷ Filters</button></div><section className="panel table-panel"><OrderTable orders={orders} onOpen={onOpen} /></section></>;
}

function OrderTable({ orders, onOpen }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  if (!orders.length) return <EmptyState title="No orders found" copy="Try another client, symbol, order ID, or status." />;
  return <div className="table-scroll"><table><thead><tr><th>Order / time</th><th>Client</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Limit price</th><th className="num">Est. value</th><th>Status</th><th>Trader</th><th aria-label="Actions" /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.id}</b><small>{order.time} · {order.source}</small></td><td><b>{order.client}</b><small>{order.clientCode}</small></td><td><b>{order.symbol}</b><small>{demoInstruments.find((item) => item.id === order.instrumentId)?.asset}</small></td><td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td><td className="num"><b>{fmt.format(order.quantity)}</b></td><td className="num">{fmt.format(order.price)}</td><td className="num"><b>{fmt.format(order.estimatedNet)}</b><small>ETB incl. fees</small></td><td><StatusBadge status={order.status} />{order.riskFlag !== "none" && <small className="risk-note">◇ Risk review</small>}</td><td><b>{order.trader}</b></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); onOpen(order); }}>•••</button></td></tr>)}</tbody></table></div>;
}

function ClientsPage() {
  return <><SectionHeader eyebrow="CLIENT & ACCOUNT MANAGEMENT" title="Client accounts" copy="KYC, cash, holdings, and trading history in one controlled record." action={<button className="btn primary">＋ Add client</button>} /><div className="client-grid">{demoClients.map((client) => <article className="panel client-card" key={client.id}><div className="client-head"><span>{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><h3>{client.name}</h3><p>{client.code} · {client.type}</p></div><span className={`status ${client.status === "Active" ? "status-success" : "status-warning"}`}><i />{client.status}</span></div><div className="client-money"><span><small>Total cash</small><b>{etb(client.cash)}</b></span><span><small>Available</small><b>{etb(client.available)}</b></span></div><div className="client-meta"><span>KYC <b>{client.kyc}</b></span><span>Risk <b>{client.risk}</b></span><span>Holdings <b>{client.holdings}</b></span></div><button>Open account <span>→</span></button></article>)}</div><section className="panel ledger-panel"><div className="panel-head"><div><span className="eyebrow">CASH LEDGER</span><h2>Recent account movements</h2></div><button className="text-button">Full ledger →</button></div><div className="table-scroll"><table><thead><tr><th>Value date</th><th>Client</th><th>Reference</th><th>Type</th><th className="num">Amount</th><th className="num">Running balance</th></tr></thead><tbody><tr><td>14 Jul 2026</td><td><b>Meron Bekele</b></td><td>TRD-2026-0768</td><td>Trade debit</td><td className="num negative">−305,118.00</td><td className="num"><b>1,840,500.00</b></td></tr><tr><td>14 Jul 2026</td><td><b>Blue Nile Trading PLC</b></td><td>ADJ-2026-0081</td><td>Bank receipt</td><td className="num positive">+750,000.00</td><td className="num"><b>4,705,300.00</b></td></tr></tbody></table></div></section></>;
}

function InstrumentsPage() {
  return <><SectionHeader eyebrow="REFERENCE DATA" title="Instrument master" copy="Tradability, settlement rules, and pricing controls for supported securities." action={<button className="btn primary">＋ Add instrument</button>} /><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Symbol / name</th><th>Asset class</th><th>Issuer</th><th>Trading</th><th className="num">Last price</th><th className="num">Lot / tick</th><th>Settlement</th><th>Bond terms</th></tr></thead><tbody>{demoInstruments.map((instrument) => <tr key={instrument.id}><td><b>{instrument.symbol}</b><small>{instrument.name}</small></td><td><span className="asset-chip">{instrument.asset}</span></td><td>{instrument.issuer}</td><td><span className={`status ${instrument.status === "Tradable" ? "status-success" : "status-danger"}`}><i />{instrument.status}</span></td><td className="num"><b>{fmt.format(instrument.price)}</b><small>ETB</small></td><td className="num">{instrument.lot} / {instrument.tick}</td><td><b>{instrument.cycle}</b></td><td>{instrument.coupon ? <><b>{instrument.coupon}</b><small>{instrument.maturity}</small></> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div></section></>;
}

function SettlementPage({ orders, onOpen }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  const queue = orders.filter((order) => ["settlement_pending", "partially_filled", "settled"].includes(order.status));
  return <><SectionHeader eyebrow="POST-TRADE CONTROL" title="Settlement tracking" copy="Confirm cash and securities legs, value dates, and operational exceptions." action={<button className="btn secondary">Export queue</button>} /><section className="metric-grid settlement-metrics"><Metric label="Due today" value="3" note="ETB 1.84M net" tone="warning" /><Metric label="Cash confirmed" value="7 / 10" note="3 awaiting confirmation" tone="success" /><Metric label="Securities confirmed" value="6 / 10" note="4 awaiting confirmation" tone="purple" /><Metric label="Exceptions" value="1" note="Age: 2h 14m" tone="danger" /></section><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Client</th><th>Instrument</th><th>Value date</th><th className="num">Net amount</th><th>Cash</th><th>Securities</th><th>Overall</th></tr></thead><tbody>{queue.map((order) => <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.tradeId ?? "Trade pending"}</b><small>{order.id}</small></td><td><b>{order.client}</b></td><td><b>{order.symbol}</b><small>{order.side.toUpperCase()} {fmt.format(order.quantity)}</small></td><td><b>{order.settlementDate ?? "Pending"}</b></td><td className="num"><b>{fmt.format(order.estimatedNet)}</b><small>ETB</small></td><td><span className={`leg ${order.status === "settled" ? "done" : "pending"}`}>{order.status === "settled" ? "Confirmed" : "Pending"}</span></td><td><span className={`leg ${order.status === "settled" ? "done" : "pending"}`}>{order.status === "settled" ? "Confirmed" : "Pending"}</span></td><td><StatusBadge status={order.status} /></td></tr>)}</tbody></table></div></section></>;
}

function ReconciliationPage({ file, onFile }: { file: string | null; onFile: (name: string) => void }) {
  return <><SectionHeader eyebrow="END-OF-DAY CONTROL" title="Reconciliation" copy="Import external files, match records, and resolve cash or securities breaks." action={<button className="btn secondary">Download template</button>} /><div className="recon-grid"><label className="upload-card"><input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /><span>⇧</span><h3>{file ?? "Drop a reconciliation file here"}</h3><p>CSV or Excel · cash, securities, or trade confirmations</p><b>{file ? "Ready to process" : "Choose file"}</b></label><section className="panel recon-summary"><span className="eyebrow">TODAY’S BATCH</span><h2>REC-2026-0714-A</h2><div><span><small>Records</small><b>248</b></span><span><small>Matched</small><b className="positive">246</b></span><span><small>Exceptions</small><b className="negative">2</b></span></div><i><em /></i><p>99.2% automatically matched</p></section></div><section className="panel exception-panel"><div className="panel-head"><div><span className="eyebrow">OPEN EXCEPTIONS</span><h2>Items requiring resolution</h2></div></div><div className="exception-row"><span className="queue-icon danger">!</span><div><b>Cash variance · TRD-2026-0759</b><small>Expected ETB 418,250.00 · Actual ETB 400,000.00</small></div><strong>ETB 18,250.00</strong><button className="btn secondary small">Resolve</button></div><div className="exception-row"><span className="queue-icon warning">!</span><div><b>Quantity mismatch · ETTEL</b><small>Internal 12,500 units · File 12,495 units</small></div><strong>5 units</strong><button className="btn secondary small">Resolve</button></div></section></>;
}

function ReportsPage({ onExport }: { onExport: () => void }) {
  const reports = ["Daily order report", "Daily trade report", "Pending approvals", "Pending settlement", "Client cash", "Client holdings", "Fees report", "Audit log report"];
  return <><SectionHeader eyebrow="CONTROL REPORTING" title="Reports" copy="Operational, client asset, fee, and audit exports for management and oversight." /><div className="report-grid">{reports.map((report, index) => <button className="panel report-card" key={report} onClick={onExport}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{report}</h3><p>{index < 2 ? "Business date · 14 Jul 2026" : index < 4 ? "Open items as of now" : "All active accounts"}</p></div><em>CSV <b>↓</b></em></button>)}</div><section className="panel fee-summary"><div><span className="eyebrow">MONTH TO DATE</span><h2>Brokerage fee summary</h2><p>Indicative demo calculation; fee rules remain configurable.</p></div><strong>ETB 184,620.50<small>+12.4% vs previous period</small></strong></section></>;
}

function AuditPage() {
  return <><SectionHeader eyebrow="IMMUTABLE CONTROL RECORD" title="Audit trail" copy="Sensitive actions, actors, timestamps, and before-and-after state for every workflow." action={<button className="btn secondary">Export audit log</button>} /><section className="panel audit-timeline">{demoAudit.map((item) => <div key={item.time}><span className="audit-dot" /><time>14 Jul 2026<br /><b>{item.time}</b></time><div><span className="asset-chip">{item.entity}</span><h3>{item.action.replaceAll("_", " ")}</h3><p>{item.detail}</p></div><strong>{item.actor}<small>Addis Ababa · Workspace</small></strong></div>)}</section></>;
}

function NewOrderForm({ value, setValue, checks, onValidate, onSubmit }: { value: NewOrderValue; setValue: (value: NewOrderValue) => void; checks: { label: string; passed: boolean; message: string }[] | null; onValidate: () => void; onSubmit: (event: FormEvent) => void }) {
  const client = demoClients.find((item) => item.accountId === value.accountId)!;
  const instrument = demoInstruments.find((item) => item.id === value.instrumentId)!;
  const amounts = calculateOrderAmounts(value.side, Number(value.quantity) || 0, Number(value.price) || 0);
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL ORDER ENTRY</span><h2>Create client order</h2><p>Capture the instruction, run server-side controls, then submit for approval.</p></div><div className="stepper"><span className="active">1 <b>Instruction</b></span><i /><span className={checks ? "active" : ""}>2 <b>Validation</b></span><i /><span>3 <b>Review</b></span></div><div className="form-section"><h3>Client instruction</h3><label>Client account<select value={value.accountId} onChange={(event) => { setValue({ ...value, accountId: event.target.value }); }}><option value="acc_meron">CL-10041 · Meron Bekele</option><option value="acc_wegagen">CL-10008 · Wegagen Pension Fund</option><option value="acc_selam">CL-10052 · Selamawit Tesfaye</option><option value="acc_blue">CL-10017 · Blue Nile Trading PLC</option></select><small>{etb(client.available)} available cash · KYC {client.kyc}</small></label><label>Instrument<select value={value.instrumentId} onChange={(event) => { const next = demoInstruments.find((item) => item.id === event.target.value)!; setValue({ ...value, instrumentId: event.target.value, price: String(next.price) }); }} >{demoInstruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select><small>{instrument.asset} · {instrument.status} · Lot {instrument.lot} · {instrument.cycle}</small></label><div className="segmented"><button type="button" className={value.side === "buy" ? "active buy" : ""} onClick={() => setValue({ ...value, side: "buy" })}>BUY</button><button type="button" className={value.side === "sell" ? "active sell" : ""} onClick={() => setValue({ ...value, side: "sell" })}>SELL</button></div><div className="field-row"><label>Quantity<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /></label><label>Limit price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><div className="field-row"><label>Order type<select value={value.orderType} onChange={(event) => setValue({ ...value, orderType: event.target.value })}><option>Limit</option><option>Market</option></select></label><label>Validity<select value={value.validity} onChange={(event) => setValue({ ...value, validity: event.target.value })}><option>Day</option><option>Good till date</option><option>Immediate or cancel</option></select></label></div><label>Dealer notes<textarea rows={3} placeholder="Optional client instruction details" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label></div><div className="estimate-card"><span><small>Gross consideration</small><b>{etb(amounts.gross)}</b></span><span><small>Estimated fees (0.50%)</small><b>{etb(amounts.fees)}</b></span><span><small>Estimated net</small><strong>{etb(amounts.net)}</strong></span></div><div className="validation-card"><div><h3>Pre-trade validation</h3><button type="button" className="btn secondary small" onClick={onValidate}>Run validation</button></div>{checks ? <ul>{checks.map((check) => <li key={check.label} className={check.passed ? "pass" : "fail"}><span>{check.passed ? "✓" : "!"}</span><b>{check.label}</b><small>{check.message}</small></li>)}</ul> : <p>Run all cash, holdings, KYC, account, tradability, lot, and tick-size controls before submission.</p>}</div><div className="drawer-actions"><button type="button" className="btn secondary">Save draft</button><button type="submit" className="btn primary" disabled={!checks?.every((item) => item.passed)}>Submit for review <span>→</span></button></div></form>;
}

function OrderDetail({ order, role, onApprove, onReject, onTrade, onSettle, onContract }: { order: DemoOrder; role: Role; onApprove: () => void; onReject: () => void; onTrade: () => void; onSettle: () => void; onContract: () => void }) {
  return <div className="drawer-content"><div className="drawer-title"><span className="eyebrow">ORDER CONTROL</span><h2>{order.id}</h2><div className="title-badges"><StatusBadge status={order.status} /><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></div></div><div className="order-hero"><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · {order.accountId.replace("acc_", "TRD-").toUpperCase()}</span></div><strong>{fmt.format(order.quantity)} <small>{order.symbol}</small></strong><p>@ {fmt.format(order.price)} ETB · {order.orderType}</p></div><dl className="detail-grid"><div><dt>Gross consideration</dt><dd>{etb(order.estimatedGross)}</dd></div><div><dt>Estimated fees</dt><dd>{etb(order.estimatedFees)}</dd></div><div className="total"><dt>Estimated net</dt><dd>{etb(order.estimatedNet)}</dd></div><div><dt>Source</dt><dd>{order.source}</dd></div><div><dt>Assigned trader</dt><dd>{order.trader}</dd></div><div><dt>Risk flag</dt><dd>{order.riskFlag === "none" ? "No flags" : "Enhanced review"}</dd></div></dl><div className="workflow-card"><h3>Workflow history</h3><ol><li className="done"><i>✓</i><div><b>Order created</b><small>14 Jul 2026 · {order.time} · Mekdes T.</small></div></li><li className="done"><i>✓</i><div><b>Pre-trade validation</b><small>All required controls recorded</small></div></li><li className={order.status === "pending_broker_review" ? "current" : "done"}><i>{order.status === "pending_broker_review" ? "3" : "✓"}</i><div><b>Broker review</b><small>{order.status === "pending_broker_review" ? "Awaiting authorized approver" : statusLabels[order.status]}</small></div></li><li><i>4</i><div><b>Trade & settlement</b><small>{order.tradeId ? `${order.tradeId} · ${order.settlementDate}` : "Pending execution"}</small></div></li></ol></div>{role === "management" && <div className="permission-note">Read-only management mode: workflow actions are disabled.</div>}<div className="drawer-actions stacked">{order.status === "pending_broker_review" && <><button className="btn danger" onClick={onReject} disabled={!hasPermission(role, "reject")}>Reject</button><button className="btn primary" onClick={onApprove} disabled={!hasPermission(role, "approve")}>Approve & block assets</button></>}{order.status === "approved" && <button className="btn primary full" onClick={onTrade} disabled={!hasPermission(role, "trade")}>Capture execution <span>→</span></button>}{order.status === "settlement_pending" && <><button className="btn secondary" onClick={onContract}>Contract note</button><button className="btn primary" onClick={onSettle} disabled={!hasPermission(role, "settle")}>Confirm settlement</button></>}{["settled", "partially_filled"].includes(order.status) && <button className="btn secondary full" onClick={onContract}>View contract note</button>}</div></div>;
}

function TradeForm({ order, value, setValue, onSubmit }: { order: DemoOrder; value: TradeValue; setValue: (value: TradeValue) => void; onSubmit: (event: FormEvent) => void }) {
  const amount = calculateOrderAmounts(order.side, Number(value.quantity) || 0, Number(value.price) || 0);
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL TRADE CAPTURE</span><h2>Record execution</h2><p>Link a full or partial fill to {order.id}. No ESX message will be sent.</p></div><div className="manual-callout"><span>MANUAL</span><p>Confirm these details against the official external execution record before capture.</p></div><div className="order-reference"><span>{order.side.toUpperCase()}</span><div><b>{fmt.format(order.quantity)} {order.symbol}</b><small>{order.client} · Limit {fmt.format(order.price)} ETB</small></div></div><div className="form-section"><div className="field-row"><label>Quantity filled<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /><small>Maximum {fmt.format(order.quantity)}</small></label><label>Execution price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><label>Trade date<input type="date" value={value.tradeDate} onChange={(event) => setValue({ ...value, tradeDate: event.target.value })} /></label></div><div className="estimate-card"><span><small>Gross amount</small><b>{etb(amount.gross)}</b></span><span><small>Fees</small><b>{etb(amount.fees)}</b></span><span><small>Net amount</small><strong>{etb(amount.net)}</strong></span></div><div className="drawer-actions"><button type="button" className="btn secondary">Cancel</button><button type="submit" className="btn primary">Capture trade & open settlement</button></div></form>;
}

function ContractNote({ order, onPrint }: { order: DemoOrder; onPrint: () => void }) {
  return <div className="drawer-content contract-wrapper"><div className="contract-toolbar"><div><span className="eyebrow">PRINTABLE CONTRACT NOTE</span><h2>{order.tradeId ?? "Trade pending"}</h2></div><button className="btn primary" onClick={onPrint}>Print / Save PDF</button></div><article className="contract-note"><header><div className="contract-brand"><img src="/frankscore-icon.png" alt="" /><span><b>Abyssinia Securities S.C.</b><small>Licensed securities broker · ESCA-BR-004</small></span></div><div><b>CONTRACT NOTE</b><small>Original · Client copy</small></div></header><section><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · Addis Ababa, Ethiopia</span></div><div><small>CONTRACT NOTE NO.</small><b>CN-2026-{order.id.slice(-4)}</b><span>Trade date · 14 July 2026</span></div></section><table><thead><tr><th>Security</th><th>Side</th><th className="num">Quantity</th><th className="num">Price (ETB)</th><th className="num">Gross (ETB)</th></tr></thead><tbody><tr><td><b>{order.symbol}</b><small>{demoInstruments.find((item) => item.id === order.instrumentId)?.name}</small></td><td>{order.side.toUpperCase()}</td><td className="num">{fmt.format(order.quantity)}</td><td className="num">{fmt.format(order.price)}</td><td className="num"><b>{fmt.format(order.estimatedGross)}</b></td></tr></tbody></table><div className="contract-totals"><span><small>Gross consideration</small><b>{etb(order.estimatedGross)}</b></span><span><small>Brokerage & market fees</small><b>{etb(order.estimatedFees)}</b></span><span><small>{order.side === "buy" ? "Amount payable" : "Net proceeds"}</small><strong>{etb(order.estimatedNet)}</strong></span></div><div className="contract-meta"><span><small>ORDER ID</small><b>{order.id}</b></span><span><small>TRADE ID</small><b>{order.tradeId ?? "Pending"}</b></span><span><small>SETTLEMENT DATE</small><b>{order.settlementDate ?? "Pending"}</b></span><span><small>SETTLEMENT CYCLE</small><b>{demoInstruments.find((item) => item.id === order.instrumentId)?.cycle}</b></span></div><footer><p>This contract note records a manually captured execution in FrankBroker OS. It is subject to confirmation against the broker’s official books and external market records.</p><div><span>Authorized by</span><b>Mekdes Tadesse</b><small>Broker administrator</small></div></footer></article></div>;
}
