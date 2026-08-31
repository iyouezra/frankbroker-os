"use client";

import { useEffect, useState } from "react";
import type { DemoOrder, OrderLogResponse } from "../../../lib/demo-data";
import type { Role } from "../../../lib/frank";
import { BrandSelect } from "../../shared/brand-select";
import { ACTIVE_ORDER_STATUSES, waitingTime } from "../../../lib/order-log";
import { addisBusinessDate } from "../../../lib/addis-date";
import { BROKER_TENANT_ID, EmptyState, SectionHeader, StatusBadge, displayLabel, etb, fmt, hydrateOrders, normalizedOrderType } from "../shared/broker-foundation";
import type { OrderFocus } from "../market/market-watch-screen";
import { normalizeOrderValidity, orderValidityLabel } from "../../../lib/order-input";

export function OrdersPage({ orders, query, role, refreshKey, focus, initialStatus, onInitialStatusConsumed, onClearFocus, onOpen, onNewOrder }: { orders: DemoOrder[]; query: string; role: Role; refreshKey: number; focus?: OrderFocus | null; initialStatus?: "all" | "review" | "approved" | "executed" | "exceptions" | "open" | "history" | null; onInitialStatusConsumed?: () => void; onClearFocus?: () => void; onOpen: (order: DemoOrder) => void; onNewOrder: () => void }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "review" | "approved" | "executed" | "exceptions" | "open" | "history">(focus?.status ?? initialStatus ?? "all");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">(focus?.side ?? "all");
  const [riskFilter, setRiskFilter] = useState<"all" | "flagged">("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [validityFilter, setValidityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "7d" | "30d">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "value" | "updated" | "validity">("newest");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(orders.slice(0, 25));
  const [loading, setLoading] = useState(false);
  // A deep-linked status (e.g. from a dashboard metric) seeds the tab once, then
  // the parent clears it so returning here via the nav defaults back to "All".
  useEffect(() => { if (initialStatus) onInitialStatusConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: orders.length, pageCount: Math.max(1, Math.ceil(orders.length / 25)) });
  const [facets, setFacets] = useState<OrderLogResponse["facets"]>({
    statuses: Object.fromEntries([...new Set(orders.map((order) => order.status))].map((status) => [status, orders.filter((order) => order.status === status).length])),
    orderTypes: [...new Set(orders.map((order) => normalizedOrderType(order.orderType)))],
    validities: [...new Set(orders.map((order) => normalizeOrderValidity(order.validity) ?? "day"))],
    sources: [...new Set(orders.map((order) => order.source.toLowerCase().replaceAll(" ", "_")))],
  });
  const statusMatches = (order: DemoOrder) => statusFilter === "all"
    || (statusFilter === "open" && ["draft", "submitted", "validation_failed", "pending_broker_review", "approved", "partially_filled"].includes(order.status))
    || (statusFilter === "history" && ["filled", "cancelled", "expired", "settlement_pending", "settled", "rejected", "failed"].includes(order.status))
    || (statusFilter === "review" && order.status === "pending_broker_review")
    || (statusFilter === "approved" && order.status === "approved")
    || (statusFilter === "executed" && ["partially_filled", "filled", "settlement_pending", "settled"].includes(order.status))
    || (statusFilter === "exceptions" && ["validation_failed", "rejected", "cancelled", "expired", "failed"].includes(order.status));
  const buildParams = (requestedPage = page) => new URLSearchParams({
    page: String(requestedPage),
    pageSize: "25",
    query: query.trim(),
    status: statusFilter,
    side: sideFilter,
    risk: riskFilter,
    orderType: orderTypeFilter,
    validity: validityFilter,
    source: sourceFilter,
    period: periodFilter,
    sort,
    ...(focus?.instrumentId ? { instrumentId: focus.instrumentId } : {}),
  });
  const fallbackFilteredOrders = () => {
    const needle = query.trim().toLowerCase();
    const periodDays = periodFilter === "7d" ? 7 : periodFilter === "30d" ? 30 : 0;
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : 0;
    const today = addisBusinessDate();
    return orders
      .filter((order) => statusMatches(order)
        && (sideFilter === "all" || order.side === sideFilter)
        && (riskFilter === "all" || order.riskFlag !== "none")
        && (orderTypeFilter === "all" || normalizedOrderType(order.orderType) === normalizedOrderType(orderTypeFilter))
        && (validityFilter === "all" || (normalizeOrderValidity(order.validity) ?? "day") === validityFilter)
        && (sourceFilter === "all" || order.source.toLowerCase().replaceAll(" ", "_") === sourceFilter)
        && (!focus?.instrumentId || order.instrumentId === focus.instrumentId)
        && (periodFilter === "all" || (periodFilter === "today" ? order.createdAt.slice(0, 10) === today : new Date(order.createdAt).getTime() >= cutoff))
        && (!needle || [order.id, order.client, order.clientCode, order.accountNumber, order.symbol, order.status, order.submissionReference, ...(order.trades?.map((trade) => trade.captureReference) ?? [])].some((value) => String(value ?? "").toLowerCase().includes(needle))))
      .sort((left, right) => sort === "validity" ? ((normalizeOrderValidity(left.validity) ?? "day").localeCompare(normalizeOrderValidity(right.validity) ?? "day") || right.createdAt.localeCompare(left.createdAt)) : sort === "value" ? right.estimatedNet - left.estimatedNet : sort === "oldest" ? left.createdAt.localeCompare(right.createdAt) : sort === "updated" ? (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt) : right.createdAt.localeCompare(left.createdAt));
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/orders?${buildParams().toString()}`, { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
        .then((result: OrderLogResponse) => {
          setRows(hydrateOrders(result.orders));
          setPagination(result.pagination);
          setFacets(result.facets);
        })
        .catch(() => {
          const filtered = fallbackFilteredOrders();
          const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
          const safePage = Math.min(page, pageCount);
          setRows(filtered.slice((safePage - 1) * 25, safePage * 25));
          setPagination({ page: safePage, pageSize: 25, total: filtered.length, pageCount });
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, sideFilter, riskFilter, orderTypeFilter, validityFilter, sourceFilter, periodFilter, sort, page, role, refreshKey, orders, focus]);

  const chooseStatus = (value: typeof statusFilter) => { setStatusFilter(value); setPage(1); };
  const exportFiltered = async () => {
    const params = buildParams(1);
    params.set("format", "csv");
    const response = await fetch(`/api/orders?${params.toString()}`, { headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
    const blob = response.ok
      ? await response.blob()
      : new Blob([
        [
          ["Order ID", "Submitted", "Last updated", "Client", "Client code", "Trading account", "Instrument", "Side", "Order type", "Validity", "Good-till date", "Limit price", "Trigger price", "Ordered", "Filled", "Remaining", "Estimated value", "Executed value", "Status", "Source", "Submission reference", "Assigned trader", "Next action", "Action owner", "Exception reason"],
          ...fallbackFilteredOrders().map((order) => [order.id, order.createdAt, order.updatedAt ?? order.createdAt, order.client, order.clientCode, order.accountNumber ?? order.accountId, order.symbol, order.side, order.orderType, normalizeOrderValidity(order.validity) ?? "day", order.goodTillDate ?? "", order.price, order.triggerPrice ?? "", order.quantity, order.filledQuantity ?? 0, order.remainingQuantity ?? order.quantity, order.estimatedNet, order.executedNet ?? 0, order.status, order.source, order.submissionReference ?? "", order.trader, order.nextAction ?? "", order.actionOwner ?? "", order.rejectionReason ?? ""]),
        ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"),
      ], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `frankbroker-orders-${addisBusinessDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const count = (statuses: string[]) => statuses.reduce((total, status) => total + (facets.statuses[status] ?? 0), 0);
  return <>
    <SectionHeader eyebrow="ORDER MANAGEMENT" title="Order log" copy="See each instruction, what has happened, and what needs attention next." action={<><button className="btn secondary" onClick={() => void exportFiltered()}>Export filtered CSV</button><button className="btn primary" onClick={onNewOrder}>＋ New order</button></>} />
    {focus && <div className="order-focus-banner"><span>Filtered from Market Watch: <b>{focus.symbol}</b> · {focus.side ? `${focus.side.toUpperCase()} · ` : ""}{focus.status === "open" ? "Open orders" : "Order history"}</span><button onClick={() => { setStatusFilter("all"); setSideFilter("all"); onClearFocus?.(); }}>Clear market filter</button></div>}
    <div className="filter-row">
      <button className={`filter ${statusFilter === "all" ? "active" : ""}`} onClick={() => chooseStatus("all")}>All orders <b>{Object.values(facets.statuses).reduce((total, value) => total + value, 0)}</b></button>
      <button className={`filter ${statusFilter === "review" ? "active" : ""}`} onClick={() => chooseStatus("review")}>Pending review <b>{count(["pending_broker_review"])}</b></button>
      <button className={`filter ${statusFilter === "approved" ? "active" : ""}`} onClick={() => chooseStatus("approved")}>Approved <b>{count(["approved"])}</b></button>
      <button className={`filter ${statusFilter === "executed" ? "active" : ""}`} onClick={() => chooseStatus("executed")}>Executed <b>{count(["partially_filled", "filled", "settlement_pending", "settled"])}</b></button>
      <button className={`filter ${statusFilter === "exceptions" ? "active" : ""}`} onClick={() => chooseStatus("exceptions")}>Exceptions <b>{count(["validation_failed", "rejected", "cancelled", "expired", "failed"])}</b></button>
    </div>
    <div className="blotter-controls order-log-controls">
      <label>Side<BrandSelect className="bselect-inline" value={sideFilter} onChange={(next) => { setSideFilter(next as typeof sideFilter); setPage(1); }} ariaLabel="Filter by side" options={[{ value: "all", label: "All sides" }, { value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} /></label>
      <label>Order type<BrandSelect className="bselect-inline" value={orderTypeFilter} onChange={(next) => { setOrderTypeFilter(next); setPage(1); }} ariaLabel="Filter by order type" options={[{ value: "all", label: "All types" }, ...facets.orderTypes.map((type) => ({ value: type, label: displayLabel(type) }))]} /></label>
      <label>Validity<BrandSelect className="bselect-inline" value={validityFilter} onChange={(next) => { setValidityFilter(next); setPage(1); }} ariaLabel="Filter by validity" options={[{ value: "all", label: "All validity" }, ...facets.validities.map((validity) => ({ value: validity, label: orderValidityLabel(validity) }))]} /></label>
      <label>Source<BrandSelect className="bselect-inline" value={sourceFilter} onChange={(next) => { setSourceFilter(next); setPage(1); }} ariaLabel="Filter by source" options={[{ value: "all", label: "All sources" }, ...facets.sources.map((source) => ({ value: source, label: displayLabel(source) }))]} /></label>
      <label>Period<BrandSelect className="bselect-inline" value={periodFilter} onChange={(next) => { setPeriodFilter(next as typeof periodFilter); setPage(1); }} ariaLabel="Filter by period" options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]} /></label>
      <label>Risk<BrandSelect className="bselect-inline" value={riskFilter} onChange={(next) => { setRiskFilter(next as typeof riskFilter); setPage(1); }} ariaLabel="Filter by risk" options={[{ value: "all", label: "All risk levels" }, { value: "flagged", label: "Flagged only" }]} /></label>
      <label>Sort<BrandSelect className="bselect-inline" value={sort} onChange={(next) => { setSort(next as typeof sort); setPage(1); }} ariaLabel="Sort" options={[{ value: "newest", label: "Newest first" }, { value: "updated", label: "Recently updated" }, { value: "oldest", label: "Oldest first" }, { value: "value", label: "Highest value" }, { value: "validity", label: "Validity (Day, GTC, GTD)" }]} /></label>
      <span>{loading ? "Updating…" : `${pagination.total} matching orders`}</span>
    </div>
    <section className={`panel table-panel order-log-table${loading ? " loading" : ""}`}><OrderTable orders={rows} onOpen={onOpen} /></section>
    {pagination.pageCount > 1 && <div className="pagination"><button disabled={pagination.page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pageCount}</span><button disabled={pagination.page >= pagination.pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
  </>;
}

function OrderTable({ orders, onOpen }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  if (!orders.length) return <EmptyState title="No orders found" copy="Try another client, symbol, order ID, reference, or filter." />;
  return <div className="table-scroll"><table><thead><tr><th>Order / update</th><th>Client / account</th><th>Instrument / instruction</th><th>Validity</th><th>Side</th><th>Source</th><th className="num">Execution progress</th><th className="num">Value</th><th>Status / age</th><th>Owner / next action</th><th aria-label="Actions" /></tr></thead><tbody>{orders.map((order) => {
    const active = ACTIVE_ORDER_STATUSES.has(order.status);
    const value = (order.filledQuantity ?? 0) > 0 ? order.executedNet ?? 0 : order.estimatedNet;
    return <tr key={order.id} onClick={() => onOpen(order)}>
      <td><b>{order.id}</b><small>Submitted {new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small><small>Updated {new Date(order.updatedAt ?? order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td>
      <td><b>{order.client}</b><small>{order.clientCode} · {order.accountNumber ?? order.accountId.replace("acc_", "TRD-").toUpperCase()}</small></td>
      <td><b>{order.symbol} · {order.orderType}</b><small>{fmt.format(order.price)} ETB{order.triggerPrice ? ` · Trigger ${fmt.format(order.triggerPrice)}` : ""}</small></td>
      <td><b>{orderValidityLabel(order.validity)}</b>{order.goodTillDate && <small>Good till {order.goodTillDate}</small>}{order.instructionExpired && <small className="risk-note">Expired instruction</small>}</td>
      <td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td>
      <td><b>{displayLabel(order.source)}</b><small>Instruction source</small></td>
      <td className="num"><b>{fmt.format(order.filledQuantity ?? 0)} / {fmt.format(order.quantity)}</b><small>{fmt.format(order.remainingQuantity ?? order.quantity)} remaining</small></td>
      <td className="num"><b>{etb(value)}</b><small>{(order.filledQuantity ?? 0) > 0 ? "Executed value" : "Estimated incl. fees"}</small></td>
      <td><StatusBadge status={order.status} />{active && <small>{waitingTime(order.updatedAt ?? order.createdAt)}</small>}{order.riskFlag !== "none" && <small className="risk-note">◇ Risk review</small>}</td>
      <td><b>{order.actionOwner ?? "Operations review"}</b><small>{order.nextAction ?? "Review order"}</small></td>
      <td><button className="row-action" onClick={(event) => { event.stopPropagation(); onOpen(order); }}>•••</button></td>
    </tr>;
  })}</tbody></table></div>;
}
