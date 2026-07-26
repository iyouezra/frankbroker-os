"use client";

/* eslint-disable @next/next/no-img-element */

import type { FormEvent } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { hasPermission, type OrderStatus, type Role } from "../../../lib/frank";
import { ACTIVE_ORDER_STATUSES, movementDescription, orderResponsibility, waitingTime } from "../../../lib/order-log";
import { MarketContextCard } from "../market/market-context-card";
import { brokerChannelGuidance } from "../../../lib/order-submission-ux";
import {
  StatusBadge,
  calculateConfiguredAmounts,
  displayLabel,
  etb,
  fmt,
  statusLabels,
  type BrokerInstrument,
  type NewOrderValue,
  type TenantControls,
  type TenantInfo,
  type TradeValue,
} from "../shared/broker-foundation";

export function NewOrderForm({ value, setValue, clients, instruments, controls, checks, busy, onInstructionChange, onValidate, onSubmit }: { value: NewOrderValue; setValue: (value: NewOrderValue) => void; clients: BrokerClient[]; instruments: BrokerInstrument[]; controls: TenantControls; checks: { label: string; passed: boolean; message: string }[] | null; busy: boolean; onInstructionChange: () => void; onValidate: () => void; onSubmit: (event: FormEvent) => void }) {
  const client = clients.find((item) => item.accountId === value.accountId) ?? clients[0];
  const instrument = instruments.find((item) => item.id === value.instrumentId) ?? instruments[0];
  const assetClass = instrument?.asset.toLowerCase().includes("bond") ? "bond" : "equity";
  const channelGuidance = brokerChannelGuidance[value.source];
  const feeRule = controls.feeRules.find((rule) => rule.assetClass === assetClass);
  const amounts = calculateConfiguredAmounts(value.side, Number(value.quantity) || 0, Number(value.price) || 0, controls.brokerageFeePct, controls.minimumFee, feeRule);
  const updateInstruction = (patch: Partial<NewOrderValue>) => {
    onInstructionChange();
    setValue({ ...value, ...patch, verificationId: "", verificationCode: "", demoCode: "" });
  };
  return <form onSubmit={onSubmit} className="drawer-content">
    <div className="drawer-title"><span className="eyebrow">MANUAL ORDER ENTRY</span><h2>Create client order</h2><p>Capture the instruction, run server-side controls, then submit for approval.</p></div>
    <div className="stepper"><span className="active">1 <b>Instruction</b></span><i /><span className={checks ? "active" : ""}>2 <b>Validation</b></span><i /><span>3 <b>Review</b></span></div>
    <div className="form-section"><h3>Client instruction</h3>
      <label>Client account<select value={value.accountId} onChange={(event) => updateInstruction({ accountId: event.target.value })}>{clients.map((item) => <option key={item.id} value={item.accountId}>{item.code} · {item.name}</option>)}</select><small>{client ? `${etb(client.availableCash)} available cash · KYC ${client.kyc.replaceAll("_", " ")}` : "No client accounts available"}</small></label>
      <label>Instruction source<select value={value.source} onChange={(event) => updateInstruction({ source: event.target.value as NewOrderValue["source"] })}><option value="digital">Digital</option><option value="in_person">In person</option><option value="neway">Neway</option><option value="phone">Phone</option></select><small>The source is retained on the order and audit trail.</small></label>
      <div className="order-channel-card" data-channel={value.source}>
        <span>{value.source === "digital" ? "DIGITAL SOURCE" : "NON-DIGITAL SOURCE"}</span>
        <div><b>{channelGuidance.heading}</b><p>{channelGuidance.evidence}</p><small>{channelGuidance.authorization}</small></div>
      </div>
      <label>Instrument<select value={instrument?.id ?? ""} disabled={!instruments.length} onChange={(event) => { const next = instruments.find((item) => item.id === event.target.value); if (next) updateInstruction({ instrumentId: next.id, price: String(next.price) }); }}>{instruments.length ? instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>) : <option value="">No instruments enabled</option>}</select><small>{instrument ? `${instrument.asset} · ${instrument.status} · Lot ${instrument.lot} · ${instrument.cycle}` : "Enable an instrument for this tenant in the admin console."}</small></label>
      <div className="segmented"><button type="button" className={value.side === "buy" ? "active buy" : ""} onClick={() => updateInstruction({ side: "buy" })}>BUY</button><button type="button" className={value.side === "sell" ? "active sell" : ""} onClick={() => updateInstruction({ side: "sell" })}>SELL</button></div>
      <div className="field-row"><label>Quantity<input inputMode="numeric" value={value.quantity} onChange={(event) => updateInstruction({ quantity: event.target.value })} /></label><label>Limit price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => updateInstruction({ price: event.target.value })} /></label></div>
      <div className="field-row"><label>Order type<select value={value.orderType} disabled={!controls.allowedOrderTypes.length} onChange={(event) => updateInstruction({ orderType: event.target.value })}>{controls.allowedOrderTypes.length ? controls.allowedOrderTypes.map((orderType) => <option key={orderType}>{orderType}</option>) : <option value="">No order types enabled</option>}</select></label><label>Validity<select value={value.validity} onChange={(event) => setValue({ ...value, validity: event.target.value })}><option>Day</option><option>Good till date</option><option>Immediate or cancel</option></select></label></div>
      <label>Dealer notes<textarea rows={3} placeholder="Optional client instruction details" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label>
      {value.verificationId && <div className="client-approval-callout"><span>AUTHORIZATION PENDING</span><div><b>Enter the client&apos;s one-time code</b><small>The code is bound to this account, instrument, side, quantity, price, order type, source, and submission reference. Changing the instruction requires a new code.{value.demoCode ? ` Demo code: ${value.demoCode}` : ""}</small><input aria-label="Client authorization code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value.verificationCode} onChange={(event) => setValue({ ...value, verificationCode: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6-digit code" /></div></div>}
    </div>
    <div className="estimate-card"><span><small>Gross consideration</small><b>{etb(amounts.gross)}</b></span><span><small>Brokerage{feeRule ? ` (${feeRule.brokeragePct.toFixed(2)}%)` : ""}</small><b>{etb(amounts.brokerage)}</b></span>{amounts.regulator > 0 && <span><small>ECMA fee</small><b>{etb(amounts.regulator)}</b></span>}{amounts.exchange > 0 && <span><small>ESX fee</small><b>{etb(amounts.exchange)}</b></span>}{amounts.csd > 0 && <span><small>CSD fee</small><b>{etb(amounts.csd)}</b></span>}<span><small>Total estimated fees</small><b>{etb(amounts.fees)}</b></span><span><small>Estimated net</small><strong>{etb(amounts.net)}</strong></span></div>
    <div className="validation-card"><div><h3>Pre-trade validation</h3><button type="button" className="btn secondary small" onClick={onValidate}>Run validation</button></div>{checks ? <ul>{checks.map((check) => <li key={check.label} className={check.passed ? "pass" : "fail"}><span>{check.passed ? "✓" : "!"}</span><b>{check.label}</b><small>{check.message}</small></li>)}</ul> : <p>Run all cash, holdings, KYC, account, tradability, order-type, lot, and tick-size controls before submission.</p>}</div>
    <div className="drawer-actions"><button type="button" className="btn secondary" disabled>Save draft</button><button type="submit" className="btn primary" disabled={busy || !checks?.every((item) => item.passed)}>{busy ? "Submitting…" : value.verificationId ? "Verify & submit" : "Request authorization"} <span>→</span></button></div>
  </form>;
}


export function OrderDetail({ order, role, busy, controls, manualTradeCapture, onApprove, onReject, onCancel, onFail, onTrade, onSettle, onContract }: { order: DemoOrder; role: Role; busy: string | null; controls: TenantControls; manualTradeCapture: boolean; onApprove: () => void; onReject: () => void; onCancel: () => void; onFail: () => void; onTrade: () => void; onSettle: () => void; onContract: () => void }) {
  const remaining = order.remainingQuantity ?? order.quantity;
  const filled = order.filledQuantity ?? 0;
  const actions = new Set(order.availableActions ?? (
    order.status === "pending_broker_review" ? ["approve", "reject", "cancel", "fail"]
      : order.status === "approved" ? ["execute", "cancel", "fail"]
        : order.status === "partially_filled" ? ["execute", "settle", "cancel", "fail"]
          : ["filled", "settlement_pending"].includes(order.status) ? ["settle", "contract_note", "fail"]
            : order.status === "settled" ? ["contract_note"] : []
  ));
  const events = order.events?.length ? order.events : [
    { id: `${order.id}-created`, fromStatus: null, toStatus: "submitted", reason: "Order created and pre-trade controls recorded", actor: "Mekdes Tadesse", createdAt: order.createdAt },
    { id: `${order.id}-current`, fromStatus: null, toStatus: order.status, reason: statusLabels[order.status], actor: order.trader, createdAt: order.createdAt },
  ];
  const responsibility = order.nextAction && order.actionOwner ? { nextAction: order.nextAction, actionOwner: order.actionOwner } : orderResponsibility(order.status, order.trader === "Unassigned" ? null : order.trader);
  const lastChangedAt = events.at(-1)?.createdAt ?? order.updatedAt ?? order.createdAt;
  const exceptionReason = order.rejectionReason ?? (["validation_failed", "rejected", "cancelled", "failed"].includes(order.status) ? events.at(-1)?.reason : null);
  const maker = events.find((event) => event.fromStatus === null)?.actor;
  // Mirror the server rule: four-eyes applies only when the tenant has maker-checker
  // on and the order value meets the approval threshold.
  const requiresFourEyes = controls.makerChecker && order.estimatedNet >= controls.approvalThreshold;
  return <div className="drawer-content">
    <div className="drawer-title"><span className="eyebrow">ORDER CONTROL</span><h2>{order.id}</h2><div className="title-badges"><StatusBadge status={order.status} /><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></div></div>
    <div className="order-hero"><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · {order.accountNumber ?? order.accountId.replace("acc_", "TRD-").toUpperCase()}</span></div><strong>{fmt.format(order.quantity)} <small>{order.symbol}</small></strong><p>@ {fmt.format(order.price)} ETB · {order.orderType}{order.triggerPrice ? ` · Trigger ${fmt.format(order.triggerPrice)} ETB` : ""}</p></div>
    <MarketContextCard instrumentId={order.instrumentId} orderLimit={order.price} role={role} />
    <div className="current-action-card"><span><small>NEXT ACTION</small><b>{responsibility.nextAction}</b><em>{ACTIVE_ORDER_STATUSES.has(order.status) ? waitingTime(lastChangedAt) : `Last updated ${new Date(lastChangedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}</em></span><span><small>RESPONSIBLE</small><strong>{responsibility.actionOwner}</strong><em>{order.trader !== "Unassigned" ? `Assigned trader: ${order.trader}` : "No individual assigned"}</em></span></div>
    {exceptionReason && <div className="order-exception-card"><i>!</i><span><b>{displayLabel(order.status)}</b><p>{exceptionReason}</p></span></div>}
    <div className="fill-progress"><span><b>{fmt.format(filled)}</b> filled</span><span><b>{fmt.format(remaining)}</b> remaining</span><i><em style={{ width: `${Math.min(100, (filled / order.quantity) * 100)}%` }} /></i></div>
    <dl className="detail-grid">
      <div><dt>Original quantity</dt><dd>{fmt.format(order.quantity)}</dd></div><div><dt>Filled quantity</dt><dd>{fmt.format(filled)}</dd></div><div><dt>Remaining quantity</dt><dd>{fmt.format(remaining)}</dd></div>
      <div><dt>Average fill price</dt><dd>{order.averageFillPrice ? `${fmt.format(order.averageFillPrice)} ETB` : "-"}</dd></div><div><dt>Estimated value</dt><dd>{etb(order.estimatedNet)}</dd></div><div className="total"><dt>Final executed value</dt><dd>{filled ? etb(order.executedNet ?? order.tradeNet ?? 0) : "-"}</dd></div>
      <div><dt>Blocked cash</dt><dd>{etb(order.blockedCash ?? 0)}</dd></div><div><dt>Blocked securities</dt><dd>{fmt.format(order.blockedQuantity ?? 0)} {order.symbol}</dd></div><div><dt>Assigned trader</dt><dd>{order.trader}</dd></div>
    </dl>
    <dl className="order-facts-grid">
      <div><dt>Source</dt><dd>{displayLabel(order.source)}</dd></div><div><dt>Order type</dt><dd>{order.orderType}</dd></div><div><dt>Validity</dt><dd>{order.validity ?? "Day"}</dd></div>
      <div><dt>Submission reference</dt><dd>{order.submissionReference ?? "Not recorded"}</dd></div><div><dt>Submitted</dt><dd>{new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt>Last updated</dt><dd>{new Date(order.updatedAt ?? order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd></div>
      <div><dt>Approved by</dt><dd>{order.approvedBy ?? "Not approved yet"}</dd></div><div><dt>Approved at</dt><dd>{order.approvedAt ? new Date(order.approvedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not approved yet"}</dd></div><div><dt>Trading account</dt><dd>{order.accountNumber ?? order.accountId}</dd></div>
      {order.notes && <div className="wide"><dt>Instruction notes</dt><dd>{order.notes}</dd></div>}
    </dl>
    {order.validations?.length ? <div className="workflow-card validation-results"><h3>Pre-trade checks</h3>{order.validations.map((validation) => <div className={validation.passed ? "pass" : "fail"} key={validation.id}><i>{validation.passed ? "✓" : "!"}</i><span><b>{validation.label}</b><small>{validation.message ?? (validation.passed ? "Check passed" : "Check needs attention")}</small></span></div>)}</div> : null}
    <div className="workflow-card oms-records"><h3>Executions</h3><p className="section-helper">An order may be completed through one or more executions.</p>{order.trades?.length ? <div className="table-scroll"><table><thead><tr><th>Execution / reference</th><th className="num">Quantity</th><th className="num">Price</th><th className="num">Gross</th><th className="num">Fees</th><th className="num">Net</th><th>Trade / settlement</th><th>Captured</th></tr></thead><tbody>{order.trades.map((trade) => <tr key={trade.id}><td><b>{trade.id}</b><small>{trade.captureReference ?? "Reference not recorded"}</small></td><td className="num">{fmt.format(trade.quantity)}</td><td className="num">{fmt.format(trade.executionPrice)}</td><td className="num">{etb(trade.gross)}</td><td className="num">{etb(trade.fees)}</td><td className="num">{etb(trade.net)}</td><td><b>{trade.tradeDate}</b><small>{trade.settlementDate} · {displayLabel(trade.settlementStatus)}</small></td><td><b>{trade.capturedBy}</b><small>{new Date(trade.capturedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td></tr>)}</tbody></table></div> : <p>No executions yet. This order has not been filled.</p>}</div>
    <details className="workflow-card technical-details"><summary><span><b>Technical details</b><small>Cash and holdings movements</small></span><i>⌄</i></summary><div className="oms-records">{order.ledgerEntries?.length ? <div className="table-scroll"><table><thead><tr><th>Movement</th><th className="num">Amount / quantity</th><th className="num">Available</th><th className="num">Blocked</th><th className="num">Unsettled</th><th className="num">Running balance</th><th>Recorded</th></tr></thead><tbody>{order.ledgerEntries.map((entry) => <tr key={entry.id}><td><b>{movementDescription(entry.ledger, entry.entryType)}</b><small>{entry.reason ?? entry.description}</small></td><td className="num">{entry.ledger === "cash" ? etb(entry.amount ?? 0) : `${fmt.format(entry.quantity ?? 0)} ${entry.symbol ?? order.symbol}`}</td><td className="num">{fmt.format(entry.availableImpact)}</td><td className="num">{fmt.format(entry.blockedImpact)}</td><td className="num">{fmt.format(entry.unsettledImpact)}</td><td className="num">{fmt.format(entry.runningBalance ?? entry.runningQuantity ?? 0)}</td><td><b>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><small>{entry.tradeId ? `Execution ${entry.tradeId}` : "Order movement"}</small></td></tr>)}</tbody></table></div> : <p>No cash or holdings movements have been recorded for this order.</p>}</div></details>
    <div className="workflow-card"><h3>Workflow history</h3><ol>{events.map((event, index) => <li className={index === events.length - 1 ? "current" : "done"} key={event.id}><i>{index === events.length - 1 ? index + 1 : "✓"}</i><div><b>{statusLabels[event.toStatus as OrderStatus] ?? event.toStatus.replaceAll("_", " ")}</b><small>{new Date(event.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {event.actor}{event.reason ? ` · ${event.reason}` : ""}</small></div></li>)}</ol></div>
    <div className="workflow-card"><h3>Audit trail</h3>{order.auditTrail?.length ? <ol>{order.auditTrail.map((entry, index) => <li className={index === order.auditTrail!.length - 1 ? "current" : "done"} key={entry.id}><i>{index === order.auditTrail!.length - 1 ? index + 1 : "✓"}</i><div><b>{displayLabel(entry.action)}</b><small>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {entry.actor} · {entry.summary}{entry.reason ? ` · ${entry.reason}` : ""}</small></div></li>)}</ol> : <p>No persisted audit records are available in demo fallback mode.</p>}</div>
    {role === "management" && <div className="permission-note">Read-only management mode: workflow actions are disabled.</div>}
    {order.status === "pending_broker_review" && requiresFourEyes && <div className="permission-note">{`Four-eyes control: at or above ${etb(controls.approvalThreshold)} the maker${maker ? ` (${maker})` : ""} cannot approve this order. A second authorized approver is required.`}</div>}
    {order.status === "pending_broker_review" && !requiresFourEyes && <div className="permission-note" style={{ background: "#e8f8f2", borderColor: "#bfe6d5", color: "#17765b" }}>Below the four-eyes threshold. A single authorized approver may release this order.</div>}
    {!manualTradeCapture && ["approved", "partially_filled"].includes(order.status) && <div className="permission-note">Manual execution capture is disabled for this tenant by platform administration.</div>}
    <div className="drawer-actions stacked">
      {actions.has("contract_note") && <button className="btn secondary" onClick={onContract}>Contract note</button>}
      {actions.has("cancel") && <button className="btn secondary" onClick={onCancel} disabled={Boolean(busy) || !hasPermission(role, "create")}>{filled ? "Cancel remainder & release" : "Cancel & release"}</button>}
      {actions.has("reject") && <button className="btn danger" onClick={onReject} disabled={Boolean(busy) || !hasPermission(role, "reject")}>Reject</button>}
      {actions.has("fail") && <button className="btn danger" onClick={onFail} disabled={Boolean(busy) || !hasPermission(role, "adjust")}>Mark failed</button>}
      {actions.has("approve") && <button className="btn primary" onClick={onApprove} disabled={Boolean(busy) || !hasPermission(role, "approve")}>{busy === "approve" ? "Approving…" : "Approve reserved order"}</button>}
      {actions.has("execute") && remaining > 0 && <button className="btn primary" onClick={onTrade} disabled={Boolean(busy) || !manualTradeCapture || !hasPermission(role, "trade")}>{filled ? "Capture remaining fill" : "Capture execution"} <span>→</span></button>}
      {actions.has("settle") && order.tradeId && <button className="btn primary" onClick={onSettle} disabled={Boolean(busy) || !hasPermission(role, "settle")}>{busy === "settle" ? "Settling…" : "Confirm next settlement"}</button>}
    </div>
  </div>;
}

export function TradeForm({ order, role, value, setValue, controls, busy, onSubmit, onCancel }: { order: DemoOrder; role: Role; value: TradeValue; setValue: (value: TradeValue) => void; controls: TenantControls; busy: boolean; onSubmit: (event: FormEvent) => void; onCancel: () => void }) {
  const fillGross = (Number(value.quantity) || 0) * (Number(value.price) || 0);
  const cumulativeFeeTarget = fillGross > 0 ? Math.max(controls.minimumFee, ((order.executedGross ?? 0) + fillGross) * (controls.brokerageFeePct / 100)) : 0;
  const fillFees = Math.max(0, cumulativeFeeTarget - (order.executedFees ?? 0));
  const amount = { gross: fillGross, fees: fillFees, net: order.side === "buy" ? fillGross + fillFees : fillGross - fillFees };
  const remaining = order.remainingQuantity ?? order.quantity;
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL TRADE CAPTURE</span><h2>Record execution</h2><p>Link a full or partial fill to {order.id}. No ESX message will be sent.</p></div><div className="manual-callout"><span>MANUAL</span><p>Confirm these details against the official external execution record before capture.</p></div><MarketContextCard instrumentId={order.instrumentId} orderLimit={order.price} role={role} /><div className="order-reference"><span>{order.side.toUpperCase()}</span><div><b>{fmt.format(remaining)} {order.symbol} remaining</b><small>{order.client} · Limit {fmt.format(order.price)} ETB</small></div></div><div className="form-section"><div className="field-row"><label>Quantity filled<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /><small>Maximum remaining {fmt.format(remaining)}</small></label><label>Execution price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><div className="field-row"><label>Trade date<input type="date" value={value.tradeDate} onChange={(event) => setValue({ ...value, tradeDate: event.target.value })} /></label><label>Execution reference<input required maxLength={120} value={value.captureReference} onChange={(event) => setValue({ ...value, captureReference: event.target.value })} placeholder="Exchange or broker confirmation" /><small>Use the reference shown on the official execution record.</small></label></div></div><div className="estimate-card"><span><small>Gross amount</small><b>{etb(amount.gross)}</b></span><span><small>Fees</small><b>{etb(amount.fees)}</b></span><span><small>Net amount</small><strong>{etb(amount.net)}</strong></span></div><div className="drawer-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !value.captureReference.trim()}>{busy ? "Capturing…" : "Capture trade & open settlement"}</button></div></form>;
}

export function ContractNote({ order, instruments, tenantInfo, settlementCycle, busy, onPrint }: { order: DemoOrder; instruments: BrokerInstrument[]; tenantInfo: TenantInfo; settlementCycle: string; busy: boolean; onPrint: () => void }) {
  const instrument = instruments.find((item) => item.id === order.instrumentId);
  const quantity = order.filledQuantity ?? order.tradeQuantity ?? 0;
  const price = order.averageFillPrice ?? order.executionPrice ?? order.price;
  const gross = order.executedGross ?? order.tradeGross ?? 0;
  const fees = order.executedFees ?? order.tradeFees ?? 0;
  const net = order.executedNet ?? order.tradeNet ?? 0;
  const tradeDate = order.tradeDate ?? order.createdAt.slice(0, 10);
  const parsedTradeDate = new Date(`${tradeDate}T00:00:00.000Z`);
  const displayTradeDate = Number.isNaN(parsedTradeDate.getTime()) ? tradeDate : parsedTradeDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const hasTrade = quantity > 0;
  const noteNumber = order.contractNoteNumber ?? (hasTrade ? `CN-${order.id}` : `DRAFT-${order.id}`);
  return <div className="drawer-content contract-wrapper"><div className="contract-toolbar"><div><span className="eyebrow">PRINTABLE CONTRACT NOTE</span><h2>{order.tradeId ?? "Trade pending"}</h2></div><button className="btn primary" onClick={onPrint} disabled={!hasTrade || busy}>{busy ? "Recording…" : "Print / Save PDF"}</button></div>{!hasTrade && <div className="permission-note">A final contract note is available only after an execution has been captured.</div>}<article className="contract-note"><header><div className="contract-brand"><img src="/frankscore-icon.png" alt="" /><span><b>{tenantInfo.name}</b><small>Licensed securities broker{tenantInfo.license ? ` · ${tenantInfo.license}` : ""}</small></span></div><div><b>CONTRACT NOTE</b><small>{hasTrade ? "Original · Client copy" : "Draft preview"}</small></div></header><section><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · Addis Ababa, Ethiopia</span></div><div><small>CONTRACT NOTE NO.</small><b>{noteNumber}</b><span>Trade date · {displayTradeDate}</span></div></section><table><thead><tr><th>Security</th><th>Side</th><th className="num">Quantity</th><th className="num">Average execution price (ETB)</th><th className="num">Gross (ETB)</th></tr></thead><tbody><tr><td><b>{order.symbol}</b><small>{instrument?.name ?? "Tenant instrument"}</small></td><td>{order.side.toUpperCase()}</td><td className="num">{fmt.format(quantity)}</td><td className="num">{fmt.format(price)}</td><td className="num"><b>{fmt.format(gross)}</b></td></tr></tbody></table><div className="contract-totals"><span><small>Gross consideration</small><b>{etb(gross)}</b></span><span><small>Brokerage & market fees</small><b>{etb(fees)}</b></span><span><small>{order.side === "buy" ? "Amount payable" : "Net proceeds"}</small><strong>{etb(net)}</strong></span></div><div className="contract-meta"><span><small>ORDER ID</small><b>{order.id}</b></span><span><small>FILLS</small><b>{order.trades?.length ?? (order.tradeId ? 1 : 0)}</b></span><span><small>SETTLEMENT DATE</small><b>{order.settlementDate ?? "Pending"}</b></span><span><small>SETTLEMENT CYCLE</small><b>{settlementCycle || instrument?.cycle}</b></span></div><footer><p>This contract note records manually captured execution data in FrankBroker OS and is backed by the order’s trade, ledger, and audit records.</p><div><span>Captured by</span><b>{order.capturedBy ?? order.trader}</b><small>Authorized broker user</small></div></footer></article></div>;
}
