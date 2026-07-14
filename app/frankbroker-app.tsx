"use client";

/* The logo dimensions are controlled by the portal and printable-note styles. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { demoAudit, demoClients, demoInstruments, initialOrders, type BrokerClient, type DemoOrder } from "../lib/demo-data";
import { calculateOrderAmounts, hasPermission, roleLabels, type OrderStatus, type Role } from "../lib/frank";
import { computeBrokerAnalytics, PERIODS, type Period } from "../lib/broker-analytics";

type View = "dashboard" | "performance" | "orders" | "clients" | "settlement" | "reconciliation" | "reports" | "audit";
type Drawer = "new" | "detail" | "trade" | "contract" | null;
type NewOrderValue = { accountId: string; instrumentId: string; side: "buy" | "sell"; quantity: string; price: string; orderType: string; validity: string; notes: string };
type TradeValue = { quantity: string; price: string; tradeDate: string };
type ReconException = { id: string; reference: string; exceptionType: string; expectedValue: string | null; actualValue: string | null; status: string; resolutionNotes: string | null };
type ReconBatch = { id: string; batchDate: string; fileName: string | null; totalRecords: number; matchedRecords: number; exceptionRecords: number; status: string; exceptions: ReconException[] };

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "performance", label: "Performance", icon: "performance" },
  { id: "orders", label: "Order log", icon: "orders" },
  { id: "clients", label: "Clients & accounts", icon: "clients" },
  { id: "settlement", label: "Settlement", icon: "settlement" },
  { id: "reconciliation", label: "Reconciliation", icon: "reconciliation" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "audit", label: "Audit trail", icon: "audit" },
];

// Lucide-style line icons (24×24, stroke 1.8) — matches the Frank design system.
const ICON_PATHS: Record<string, string> = {
  dashboard: "M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 21h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 9h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z M4 21h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z",
  orders: "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1 M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M8 11h8 M8 15h5",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  settlement: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  reconciliation: "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M13 6h3a2 2 0 0 1 2 2v7 M11 18H8a2 2 0 0 1-2-2V9",
  reports: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M16 13H8 M16 17H8 M10 9H8",
  audit: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2",
  performance: "M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M21 21l-4.3-4.3",
  bell: "M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  collapse: "M9 3v18 M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] ?? "";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.split(" M").map((segment, index) => <path key={index} d={(index ? "M" : "") + segment.trim()} />)}</svg>;
}

const fallbackClients: BrokerClient[] = demoClients.map((client) => ({
  id: client.id,
  code: client.code,
  name: client.name,
  type: client.type,
  kyc: client.kyc.toLowerCase().replaceAll(" ", "_"),
  status: client.status.toLowerCase(),
  risk: client.risk.toLowerCase(),
  totalCash: client.cash,
  availableCash: client.available,
  blockedCash: client.blocked,
  accountId: client.accountId,
  accountNumber: client.accountId.replace("acc_", "TRD-").toUpperCase(),
  holdings: client.accountId === "acc_meron"
    ? [{ symbol: "WGBX", name: "Wegagen Bank", total: 3_200, available: 2_000, blocked: 1_200, averageCost: 1_685 }]
    : client.accountId === "acc_blue"
      ? [{ symbol: "WGBX", name: "Wegagen Bank", total: 8_200, available: 5_200, blocked: 3_000, averageCost: 1_710 }]
      : client.accountId === "acc_wegagen"
        ? [{ symbol: "TELE", name: "Ethio Telecom", total: 18_000, available: 18_000, blocked: 0, averageCost: 294.1 }]
        : [],
  ledger: [],
  orderCount: initialOrders.filter((order) => order.accountId === client.accountId).length,
}));

const fallbackReconBatch: ReconBatch = {
  id: "REC-2026-0714-A",
  batchDate: "2026-07-14",
  fileName: "cash-confirmations-2026-07-14.csv",
  totalRecords: 248,
  matchedRecords: 246,
  exceptionRecords: 2,
  status: "exceptions",
  exceptions: [
    { id: "rec_exc_1", reference: "TRD-2026-0759", exceptionType: "cash_variance", expectedValue: "418250.00", actualValue: "400000.00", status: "open", resolutionNotes: null },
    { id: "rec_exc_2", reference: "TELE", exceptionType: "quantity_mismatch", expectedValue: "12500", actualValue: "12495", status: "open", resolutionNotes: null },
  ],
};

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
const compactEtb = (value: number) => {
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `ETB ${Math.round(value / 1_000)}K`;
  return `ETB ${Math.round(value)}`;
};

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

const BROKER_TENANT_ID = "brk_abyssinia";

export default function FrankBrokerApp({ userName }: { userName: string }) {
  const [view, setView] = useState<View>("dashboard");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState<string>(initialOrders[0].id);
  const [orders, setOrders] = useState<DemoOrder[]>(initialOrders);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>("broker_admin");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [clients, setClients] = useState<BrokerClient[]>(fallbackClients);
  const [selectedClientId, setSelectedClientId] = useState(fallbackClients[0].id);
  const [reconBatch, setReconBatch] = useState<ReconBatch>(fallbackReconBatch);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState({ accountId: "acc_meron", instrumentId: "ins_tele", side: "buy" as "buy" | "sell", quantity: "1000", price: "312.5", orderType: "Limit", validity: "Day", notes: "" });
  const [checks, setChecks] = useState<{ label: string; passed: boolean; message: string }[] | null>(null);
  const [controls, setControls] = useState<{ makerChecker: boolean; approvalThreshold: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [tenantInfo, setTenantInfo] = useState<{ name: string; license: string }>({ name: "Abyssinia Securities", license: "ESCA-BR-004" });
  const [tradeForm, setTradeForm] = useState({ quantity: "", price: "", tradeDate: "2026-07-14" });

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/orders", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Order API unavailable")))
      .then((result: { orders?: Array<Omit<DemoOrder, "time">> }) => {
        if (!result.orders) return;
        const persisted = result.orders.map((order) => ({
          ...order,
          time: new Date(order.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
          orderType: order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1),
          source: order.source.charAt(0).toUpperCase() + order.source.slice(1),
          trader: order.trader ?? "Unassigned",
        })) as DemoOrder[];
        const persistedIds = new Set(persisted.map((order) => order.id));
        setOrders([...persisted, ...initialOrders.filter((order) => !persistedIds.has(order.id))]);
      })
      .catch(() => {
        // Keep the static demonstration surface available before a database is connected.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/clients", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/reconciliation", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/tenant", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([clientResult, reconResult, tenantResult]: [{ clients?: BrokerClient[] }, { batches?: ReconBatch[] }, { tenant?: { tradingName?: string; licenseNumber?: string; controls?: { makerChecker: boolean; approvalThreshold: number } } }]) => {
      if (clientResult.clients?.length) {
        setClients(clientResult.clients);
        setSelectedClientId((current) => clientResult.clients!.some((client) => client.id === current) ? current : clientResult.clients![0].id);
      }
      if (reconResult.batches?.[0]) setReconBatch(reconResult.batches[0]);
      if (tenantResult.tenant?.controls) setControls({ makerChecker: tenantResult.tenant.controls.makerChecker, approvalThreshold: tenantResult.tenant.controls.approvalThreshold });
      if (tenantResult.tenant?.tradingName) setTenantInfo({ name: tenantResult.tenant.tradingName, license: tenantResult.tenant.licenseNumber ?? "" });
    }).catch(() => {
      // The synthetic fallback keeps the market-validation demo usable offline.
    });
    return () => controller.abort();
  }, []);

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => [order.id, order.client, order.clientCode, order.symbol, order.status].some((value) => String(value).toLowerCase().includes(needle)));
  }, [orders, query]);

  const notify = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  };

  const openDetail = (order: DemoOrder) => {
    setSelectedId(order.id);
    setDrawer("detail");
  };

  const updateStatus = (id: string, status: OrderStatus, extra: Partial<DemoOrder> = {}) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status, ...extra } : order));
  };

  const apiRequest = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, { ...init, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, ...(init?.headers as Record<string, string> | undefined) } });
    const result = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "The operation could not be completed.");
    return result;
  };

  const persistAction = async (id: string, payload: Record<string, unknown>) => {
      return apiRequest<{ status: OrderStatus; trade?: { id: string; settlementDate: string }; filledQuantity?: number; remainingQuantity?: number }>(`/api/orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify(payload),
      });
  };

  const actionOrder = async (action: "approve" | "reject" | "cancel" | "settle") => {
    const permission = action === "settle" ? "settle" : action === "cancel" ? "create" : action;
    if (!hasPermission(role, permission)) return notify(`${roleLabels[role]} cannot ${action} orders.`, "error");
    setBusyAction(action);
    try {
      const result = await persistAction(selected.id, { action, reason: action === "reject" ? "Rejected after compliance review" : action === "cancel" ? "Cancelled by broker" : undefined });
      updateStatus(selected.id, result.status);
      notify(`${selected.id} marked ${statusLabels[result.status].toLowerCase()}. Audit event recorded.`);
      setDrawer(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The workflow action failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const openTrade = (order: DemoOrder) => {
    if (!hasPermission(role, "trade")) return notify(`${roleLabels[role]} cannot capture trades.`, "error");
    setSelectedId(order.id);
    setTradeForm({ quantity: String(order.remainingQuantity ?? order.quantity), price: String(order.price), tradeDate: "2026-07-14" });
    setDrawer("trade");
  };

  const captureTrade = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(tradeForm.quantity);
    const price = Number(tradeForm.price);
    const remaining = selected.remainingQuantity ?? selected.quantity;
    if (!quantity || !price || quantity > remaining) return notify(`Enter a quantity up to the remaining ${fmt.format(remaining)} units.`, "error");
    setBusyAction("execute");
    try {
      const result = await persistAction(selected.id, { action: "execute", executionPrice: price, quantityFilled: quantity, tradeDate: tradeForm.tradeDate });
      updateStatus(selected.id, result.status, {
        price,
        tradeId: result.trade?.id,
        settlementDate: result.trade?.settlementDate,
        filledQuantity: result.filledQuantity,
        remainingQuantity: result.remainingQuantity,
      });
      setDrawer(null);
      notify(`${result.trade?.id ?? "Trade"} captured. Settlement is due ${result.trade?.settlementDate}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Trade capture failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const runValidation = () => {
    const client = clients.find((item) => item.accountId === newOrder.accountId)!;
    const instrument = demoInstruments.find((item) => item.id === newOrder.instrumentId)!;
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    const amounts = calculateOrderAmounts(newOrder.side, quantity, price);
    const owned = client.holdings.find((holding) => holding.symbol === instrument.symbol)?.available ?? 0;
    const results = [
      { label: "Client and account", passed: Boolean(client), message: `${client.code} · ${client.status}` },
      { label: "KYC approved", passed: client.kyc === "approved", message: client.kyc.replaceAll("_", " ") },
      { label: "Account active", passed: client.status === "active", message: client.status },
      { label: "Instrument tradable", passed: instrument.status === "Tradable", message: `${instrument.symbol} · ${instrument.status}` },
      { label: "Quantity valid", passed: quantity > 0 && quantity % instrument.lot === 0, message: `Lot size ${instrument.lot}` },
      { label: "Price valid", passed: price > 0 && Math.abs(price / instrument.tick - Math.round(price / instrument.tick)) < 0.001, message: `Tick size ${instrument.tick} ETB` },
      newOrder.side === "buy"
        ? { label: "Cash including fees", passed: client.availableCash >= amounts.net, message: `${etb(client.availableCash)} available` }
        : { label: "Available, unblocked holdings", passed: owned >= quantity, message: `${fmt.format(owned)} ${instrument.symbol} available` },
    ];
    setChecks(results);
    notify(results.every((item) => item.passed) ? "All pre-trade checks passed." : "Validation found checks that need attention.");
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!checks?.every((item) => item.passed)) return notify("Run validation and resolve failed checks before submission.", "error");
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    setBusyAction("create");
    try {
      const result = await apiRequest<{ order: DemoOrder; checks?: { code: string; label: string; passed: boolean; message: string }[] }>("/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ ...newOrder, quantity, price }) });
      // Reflect the server's authoritative pre-trade checks (incl. daily limit).
      if (result.checks) setChecks(result.checks);
      const failed = result.checks?.filter((item) => !item.passed) ?? [];
      const created = { ...result.order, time: new Date(result.order.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), trader: "Unassigned" };
      setOrders((current) => [created, ...current]);
      if (result.order.status === "validation_failed") {
        setView("orders");
        notify(failed[0] ? `${created.id} held — ${failed[0].message}` : `${created.id} held: pre-trade checks failed.`, "error");
        return;
      }
      setDrawer(null);
      setChecks(null);
      setView("orders");
      notify(`${created.id} submitted for broker review.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Order submission failed.", "error");
    } finally {
      setBusyAction(null);
    }
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
    if (!hasPermission(role, "create")) return notify(`${roleLabels[role]} has read-only access.`, "error");
    setChecks(null);
    setDrawer("new");
  };

  const downloadReconTemplate = () => {
    const csv = [
      "reference,type,actual_value",
      "TRD-2026-0772,cash,2508731.25",
      "TRD-2026-0772,securities,25000",
      "TRD-2026-0768,cash,303309.00",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "frankbroker-reconciliation-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string) => {
    const parseLine = (line: string) => {
      const values: string[] = [];
      let value = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
        else if (character === '"') quoted = !quoted;
        else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
        else value += character;
      }
      values.push(value.trim());
      return values;
    };
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("The CSV is empty.");
    const headers = parseLine(lines[0]).map((header) => header.toLowerCase().replaceAll(" ", "_"));
    const referenceIndex = headers.indexOf("reference");
    const typeIndex = headers.indexOf("type");
    const valueIndex = headers.indexOf("actual_value");
    if ([referenceIndex, typeIndex, valueIndex].includes(-1)) throw new Error("CSV columns must be reference, type, and actual_value.");
    return lines.slice(1).map(parseLine).map((row) => ({
      reference: row[referenceIndex],
      type: row[typeIndex]?.toLowerCase(),
      actualValue: Number(row[valueIndex]),
    })).filter((row) => row.reference && ["cash", "securities"].includes(row.type) && Number.isFinite(row.actualValue));
  };

  const processReconFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) return notify("Use the CSV template for this demonstration importer.", "error");
    setBusyAction("reconcile");
    try {
      const rows = parseCsv(await file.text());
      const result = await apiRequest<{ batch: ReconBatch; matchRate: number }>("/api/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify({ fileName: file.name, rows }),
      });
      setReconBatch(result.batch);
      notify(`${result.batch.matchedRecords}/${result.batch.totalRecords} records matched (${result.matchRate}%).`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Reconciliation processing failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const resolveReconException = async (id: string) => {
    setBusyAction(id);
    try {
      await apiRequest(`/api/reconciliation/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify({ notes: "Reviewed and accepted during end-of-day control" }),
      });
      setReconBatch((current) => ({
        ...current,
        exceptions: current.exceptions.map((item) => item.id === id ? { ...item, status: "resolved", resolutionNotes: "Reviewed and accepted during end-of-day control" } : item),
      }));
      notify("Exception resolved and audit event recorded.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Exception resolution failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><img src="/frankscore-icon.png" alt="FrankBroker" /></span>
          <span className="brand-words"><b>FrankBroker</b><small>OPERATING SYSTEM</small></span>
          <button className="sidebar-toggle" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand" : "Collapse"}><Icon name="collapse" size={18} /></button>
        </div>
        <nav aria-label="Main navigation">
          <span className="nav-label">OPERATIONS</span>
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setDrawer(null); }} title={item.label}><i><Icon name={item.icon} size={20} /></i><span>{item.label}</span>{item.id === "orders" && <em>3</em>}{item.id === "reconciliation" && <em className="warn">2</em>}</button>)}
        </nav>
        <div className="sidebar-foot"><div className="system-state"><i /><span><b>Manual market mode</b><small>ESX / CSD disconnected by design</small></span></div><p>FrankBroker OS <b>MVP 0.1</b></p></div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><img src="/frankscore-icon.png" alt="" /><b>FrankBroker</b></div>
          <div className="tenant-chip" title={`${tenantInfo.name}${tenantInfo.license ? ` · ${tenantInfo.license}` : ""}`}><span>{tenantInfo.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><div><small>TENANT</small><b>{tenantInfo.name}</b></div></div>
          <label className="search"><span><Icon name="search" size={17} /></span><input aria-label="Search orders or clients" placeholder="Search orders or clients…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><span className="business-date">Business date <b>14 JUL 2026</b></span><button className="icon-button" aria-label="Notifications"><Icon name="bell" size={18} /><em>3</em></button><div className="user-control"><span>MT</span><label><b>{userName}</b><select aria-label="Demo role" value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div></div>
        </header>

        <main>
          {view === "dashboard" && <Dashboard orders={orders} onViewOrders={() => setView("orders")} onOpen={openDetail} onNewOrder={openNewOrder} onSettle={() => setView("settlement")} />}
          {view === "performance" && <PerformancePage orders={orders} clients={clients} period={period} setPeriod={setPeriod} onOpen={openDetail} />}
          {view === "orders" && <OrdersPage orders={filteredOrders} onOpen={openDetail} onNewOrder={openNewOrder} onExport={exportOrders} />}
          {view === "clients" && <ClientsPage clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} orders={orders} onOpenOrder={openDetail} />}
          {view === "settlement" && <SettlementPage orders={orders} onOpen={openDetail} onExport={exportOrders} />}
          {view === "reconciliation" && <ReconciliationPage batch={reconBatch} busy={busyAction === "reconcile"} onFile={processReconFile} onDownload={downloadReconTemplate} onResolve={resolveReconException} resolvingId={busyAction} />}
          {view === "reports" && <ReportsPage onExport={exportOrders} />}
          {view === "audit" && <AuditPage onExport={exportOrders} />}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.slice(0, 5).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i><Icon name={item.icon} size={21} /></i><span>{item.label.split(" ")[0]}</span></button>)}</nav>
      </div>

      {drawer && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className={`drawer ${drawer === "contract" ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={drawer === "new" ? "New order" : drawer === "trade" ? "Capture trade" : drawer === "contract" ? "Contract note" : "Order details"}>
          <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close">×</button>
          {drawer === "new" && <NewOrderForm value={newOrder} setValue={setNewOrder} clients={clients} checks={checks} busy={busyAction === "create"} onValidate={runValidation} onSubmit={submitOrder} />}
          {drawer === "detail" && <OrderDetail order={selected} role={role} busy={busyAction} controls={controls} onApprove={() => actionOrder("approve")} onReject={() => actionOrder("reject")} onCancel={() => actionOrder("cancel")} onTrade={() => openTrade(selected)} onSettle={() => actionOrder("settle")} onContract={() => setDrawer("contract")} />}
          {drawer === "trade" && <TradeForm order={selected} value={tradeForm} setValue={setTradeForm} busy={busyAction === "execute"} onCancel={() => setDrawer(null)} onSubmit={captureTrade} />}
          {drawer === "contract" && <ContractNote order={selected} onPrint={() => window.print()} />}
        </aside>
      </div>}
      {toast && <div className={`toast${toast.tone === "error" ? " toast-error" : ""}`}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.message}</div>}
    </div>
  );
}

function Dashboard({ orders, onViewOrders, onOpen, onNewOrder, onSettle }: { orders: DemoOrder[]; onViewOrders: () => void; onOpen: (order: DemoOrder) => void; onNewOrder: () => void; onSettle: () => void }) {
  const pending = orders.filter((order) => order.status === "pending_broker_review");
  const settlement = orders.filter((order) => order.status === "settlement_pending" || order.status === "partially_filled");
  return <>
    <SectionHeader eyebrow="TUESDAY · 14 JULY 2026" title="Good morning, Mekdes" copy="Here’s the control picture for today’s brokerage operations." action={<><button className="btn secondary" onClick={onViewOrders}>View order log</button><button className="btn primary" onClick={onNewOrder}><span>＋</span> New order</button></>} />
    <div className="manual-banner"><span>MANUAL MARKET MODE</span><p>Orders are entered and sent to ESX manually. Settlement confirmations are updated by operations.</p></div>
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
  const [statusFilter, setStatusFilter] = useState<"all" | "review" | "approved" | "executed" | "exceptions">("all");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [riskFilter, setRiskFilter] = useState<"all" | "flagged">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "value">("newest");
  const [page, setPage] = useState(1);
  const statusMatches = (order: DemoOrder) => statusFilter === "all"
    || (statusFilter === "review" && order.status === "pending_broker_review")
    || (statusFilter === "approved" && order.status === "approved")
    || (statusFilter === "executed" && ["partially_filled", "filled", "settlement_pending", "settled"].includes(order.status))
    || (statusFilter === "exceptions" && ["validation_failed", "rejected"].includes(order.status));
  const filtered = orders
    .filter((order) => statusMatches(order) && (sideFilter === "all" || order.side === sideFilter) && (riskFilter === "all" || order.riskFlag !== "none"))
    .sort((left, right) => sort === "value" ? right.estimatedNet - left.estimatedNet : sort === "oldest" ? left.createdAt.localeCompare(right.createdAt) : right.createdAt.localeCompare(left.createdAt));
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const chooseStatus = (value: typeof statusFilter) => { setStatusFilter(value); setPage(1); };
  return <>
    <SectionHeader eyebrow="ORDER MANAGEMENT" title="Order log" copy="Capture, review, execute, and trace every client instruction." action={<><button className="btn secondary" onClick={onExport}>Export CSV</button><button className="btn primary" onClick={onNewOrder}>＋ New order</button></>} />
    <div className="filter-row">
      <button className={`filter ${statusFilter === "all" ? "active" : ""}`} onClick={() => chooseStatus("all")}>All orders <b>{orders.length}</b></button>
      <button className={`filter ${statusFilter === "review" ? "active" : ""}`} onClick={() => chooseStatus("review")}>Pending review <b>{orders.filter((order) => order.status === "pending_broker_review").length}</b></button>
      <button className={`filter ${statusFilter === "approved" ? "active" : ""}`} onClick={() => chooseStatus("approved")}>Approved</button>
      <button className={`filter ${statusFilter === "executed" ? "active" : ""}`} onClick={() => chooseStatus("executed")}>Executed</button>
      <button className={`filter ${statusFilter === "exceptions" ? "active" : ""}`} onClick={() => chooseStatus("exceptions")}>Exceptions</button>
    </div>
    <div className="blotter-controls">
      <label>Side<select value={sideFilter} onChange={(event) => { setSideFilter(event.target.value as typeof sideFilter); setPage(1); }}><option value="all">All sides</option><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
      <label>Risk<select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value as typeof riskFilter); setPage(1); }}><option value="all">All risk levels</option><option value="flagged">Flagged only</option></select></label>
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="value">Highest value</option></select></label>
      <span>{filtered.length} matching orders</span>
    </div>
    <section className="panel table-panel"><OrderTable orders={visible} onOpen={onOpen} /></section>
    {pageCount > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {Math.min(page, pageCount)} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
  </>;
}

function OrderTable({ orders, onOpen }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  if (!orders.length) return <EmptyState title="No orders found" copy="Try another client, symbol, order ID, or status." />;
  return <div className="table-scroll"><table><thead><tr><th>Order / time</th><th>Client</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Limit price</th><th className="num">Est. value</th><th>Status</th><th>Trader</th><th aria-label="Actions" /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.id}</b><small>{order.time} · {order.source}</small></td><td><b>{order.client}</b><small>{order.clientCode}</small></td><td><b>{order.symbol}</b><small>{demoInstruments.find((item) => item.id === order.instrumentId)?.asset}</small></td><td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td><td className="num"><b>{fmt.format(order.quantity)}</b></td><td className="num">{fmt.format(order.price)}</td><td className="num"><b>{fmt.format(order.estimatedNet)}</b><small>ETB incl. fees</small></td><td><StatusBadge status={order.status} />{order.riskFlag !== "none" && <small className="risk-note">◇ Risk review</small>}</td><td><b>{order.trader}</b></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); onOpen(order); }}>•••</button></td></tr>)}</tbody></table></div>;
}

function ClientsPage({ clients, selectedId, onSelect, orders, onOpenOrder }: { clients: BrokerClient[]; selectedId: string; onSelect: (id: string) => void; orders: DemoOrder[]; onOpenOrder: (order: DemoOrder) => void }) {
  const selected = clients.find((client) => client.id === selectedId) ?? clients[0];
  const clientOrders = orders.filter((order) => order.accountId === selected?.accountId).slice(0, 6);
  return <>
    <SectionHeader eyebrow="CLIENT & ACCOUNT MANAGEMENT" title="Client accounts" copy="KYC, cash, holdings, and trading history in one controlled record." action={<span className="demo-control-badge">SYNTHETIC DEMO DATA</span>} />
    <div className="client-grid">{clients.map((client) => <article className={`panel client-card ${selected?.id === client.id ? "selected" : ""}`} key={client.id}><div className="client-head"><span>{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><h3>{client.name}</h3><p>{client.code} · {client.type.replaceAll("_", " ")}</p></div><span className={`status ${client.status === "active" ? "status-success" : "status-warning"}`}><i />{client.status}</span></div><div className="client-money"><span><small>Total cash</small><b>{etb(client.totalCash)}</b></span><span><small>Available</small><b>{etb(client.availableCash)}</b></span></div><div className="client-meta"><span>KYC <b>{client.kyc.replaceAll("_", " ")}</b></span><span>Risk <b>{client.risk}</b></span><span>Orders <b>{client.orderCount}</b></span></div><button onClick={() => onSelect(client.id)}>Open account <span>→</span></button></article>)}</div>
    {selected && <div className="account-workspace">
      <section className="panel account-summary"><div className="panel-head"><div><span className="eyebrow">TRADING ACCOUNT</span><h2>{selected.name}</h2></div><span className="account-number">{selected.accountNumber}</span></div><div className="account-balance-grid"><span><small>Total cash</small><b>{etb(selected.totalCash)}</b></span><span><small>Available</small><b className="positive">{etb(selected.availableCash)}</b></span><span><small>Blocked</small><b>{etb(selected.blockedCash)}</b></span><span><small>Open orders</small><b>{clientOrders.filter((order) => !["settled", "cancelled", "rejected"].includes(order.status)).length}</b></span></div></section>
      <section className="panel holdings-panel"><div className="panel-head"><div><span className="eyebrow">CUSTODY POSITION</span><h2>Holdings</h2></div></div>{selected.holdings.length ? <div className="table-scroll"><table><thead><tr><th>Instrument</th><th className="num">Total</th><th className="num">Available</th><th className="num">Blocked</th><th className="num">Average cost</th></tr></thead><tbody>{selected.holdings.map((holding) => <tr key={holding.symbol}><td><b>{holding.symbol}</b><small>{holding.name}</small></td><td className="num">{fmt.format(holding.total)}</td><td className="num positive">{fmt.format(holding.available)}</td><td className="num">{fmt.format(holding.blocked)}</td><td className="num">{fmt.format(holding.averageCost)} ETB</td></tr>)}</tbody></table></div> : <EmptyState title="No securities positions" copy="This account currently holds cash only." />}</section>
      <section className="panel client-orders"><div className="panel-head"><div><span className="eyebrow">ORDER HISTORY</span><h2>Recent instructions</h2></div></div><OrderTable orders={clientOrders} onOpen={onOpenOrder} /></section>
      <section className="panel ledger-panel"><div className="panel-head"><div><span className="eyebrow">CASH LEDGER</span><h2>Recent account movements</h2></div></div>{selected.ledger.length ? <div className="table-scroll"><table><thead><tr><th>Value date</th><th>Reference</th><th>Type</th><th className="num">Amount</th><th className="num">Running balance</th></tr></thead><tbody>{selected.ledger.map((entry) => <tr key={entry.id}><td>{entry.valueDate}</td><td><b>{entry.reference}</b></td><td>{entry.type.replaceAll("_", " ")}</td><td className={`num ${entry.amount >= 0 ? "positive" : "negative"}`}>{fmt.format(entry.amount)}</td><td className="num"><b>{fmt.format(entry.runningBalance)}</b></td></tr>)}</tbody></table></div> : <EmptyState title="No posted cash movements" copy="Ledger entries appear after settlement is confirmed." />}</section>
    </div>}
  </>;
}

function SettlementPage({ orders, onOpen, onExport }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void; onExport: () => void }) {
  const queue = orders.filter((order) => ["settlement_pending", "partially_filled", "settled"].includes(order.status));
  return <><SectionHeader eyebrow="POST-TRADE CONTROL" title="Settlement tracking" copy="Confirm cash and securities legs, value dates, and operational exceptions." action={<button className="btn secondary" onClick={onExport}>Export queue</button>} /><section className="metric-grid settlement-metrics"><Metric label="Due today" value="3" note="ETB 1.84M net" tone="warning" /><Metric label="Cash confirmed" value="7 / 10" note="3 awaiting confirmation" tone="success" /><Metric label="Securities confirmed" value="6 / 10" note="4 awaiting confirmation" tone="purple" /><Metric label="Exceptions" value="1" note="Age: 2h 14m" tone="danger" /></section><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Client</th><th>Instrument</th><th>Value date</th><th className="num">Net amount</th><th>Cash</th><th>Securities</th><th>Overall</th></tr></thead><tbody>{queue.map((order) => <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.tradeId ?? "Trade pending"}</b><small>{order.id}</small></td><td><b>{order.client}</b></td><td><b>{order.symbol}</b><small>{order.side.toUpperCase()} {fmt.format(order.quantity)}</small></td><td><b>{order.settlementDate ?? "Pending"}</b></td><td className="num"><b>{fmt.format(order.estimatedNet)}</b><small>ETB</small></td><td><span className={`leg ${order.status === "settled" ? "done" : "pending"}`}>{order.status === "settled" ? "Confirmed" : "Pending"}</span></td><td><span className={`leg ${order.status === "settled" ? "done" : "pending"}`}>{order.status === "settled" ? "Confirmed" : "Pending"}</span></td><td><StatusBadge status={order.status} /></td></tr>)}</tbody></table></div></section></>;
}

function ReconciliationPage({ batch, busy, onFile, onDownload, onResolve, resolvingId }: { batch: ReconBatch; busy: boolean; onFile: (file: File) => void; onDownload: () => void; onResolve: (id: string) => void; resolvingId: string | null }) {
  const openExceptions = batch.exceptions.filter((exception) => exception.status !== "resolved");
  const matchRate = batch.totalRecords ? (batch.matchedRecords / batch.totalRecords) * 100 : 0;
  return <>
    <SectionHeader eyebrow="END-OF-DAY CONTROL" title="Reconciliation" copy="Import external confirmations, match them to captured trades, and resolve cash or securities breaks." action={<button className="btn secondary" onClick={onDownload}>Download CSV template</button>} />
    <div className="recon-grid">
      <label className={`upload-card ${busy ? "processing" : ""}`}><input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /><span>{busy ? "···" : "⇧"}</span><h3>{busy ? "Matching records…" : "Upload trade confirmations"}</h3><p>CSV · reference, type, actual_value · up to 1,000 rows</p><b>{busy ? "Processing safely" : "Choose CSV file"}</b></label>
      <section className="panel recon-summary"><span className="eyebrow">LATEST BATCH</span><h2>{batch.id}</h2><small>{batch.fileName ?? "Demonstration seed"}</small><div><span><small>Records</small><b>{batch.totalRecords}</b></span><span><small>Matched</small><b className="positive">{batch.matchedRecords}</b></span><span><small>Exceptions</small><b className={batch.exceptionRecords ? "negative" : "positive"}>{batch.exceptionRecords}</b></span></div><i><em style={{ width: `${matchRate}%` }} /></i><p>{matchRate.toFixed(1)}% automatically matched</p></section>
    </div>
    <section className="panel exception-panel"><div className="panel-head"><div><span className="eyebrow">OPEN EXCEPTIONS</span><h2>Items requiring resolution</h2></div><span className="exception-count">{openExceptions.length} open</span></div>{openExceptions.length ? openExceptions.map((exception) => {
      const expected = Number(exception.expectedValue ?? 0);
      const actual = Number(exception.actualValue ?? 0);
      const difference = Math.abs(expected - actual);
      return <div className="exception-row" key={exception.id}><span className={`queue-icon ${exception.exceptionType === "cash_variance" ? "danger" : "warning"}`}>!</span><div><b>{exception.exceptionType.replaceAll("_", " ")} · {exception.reference}</b><small>{exception.expectedValue === null ? "No internal trade matched this reference" : `Expected ${fmt.format(expected)} · File ${fmt.format(actual)}`}</small></div><strong>{exception.expectedValue === null ? "Unmatched" : exception.exceptionType === "cash_variance" ? `${etb(difference)}` : `${fmt.format(difference)} units`}</strong><button className="btn secondary small" disabled={resolvingId === exception.id} onClick={() => onResolve(exception.id)}>{resolvingId === exception.id ? "Resolving…" : "Resolve"}</button></div>;
    }) : <EmptyState title="Reconciliation is clear" copy="Every uploaded record matched the internal trade book." />}</section>
  </>;
}

function ReportsPage({ onExport }: { onExport: () => void }) {
  const reports = ["Daily order report", "Daily trade report", "Pending approvals", "Pending settlement", "Client cash", "Client holdings", "Fees report", "Audit log report"];
  return <><SectionHeader eyebrow="CONTROL REPORTING" title="Reports" copy="Operational, client asset, fee, and audit exports for management and oversight." /><div className="report-grid">{reports.map((report, index) => <button className="panel report-card" key={report} onClick={onExport}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{report}</h3><p>{index < 2 ? "Business date · 14 Jul 2026" : index < 4 ? "Open items as of now" : "All active accounts"}</p></div><em>CSV <b>↓</b></em></button>)}</div><section className="panel fee-summary"><div><span className="eyebrow">MONTH TO DATE</span><h2>Brokerage fee summary</h2><p>Indicative demo calculation; fee rules remain configurable.</p></div><strong>ETB 184,620.50<small>+12.4% vs previous period</small></strong></section></>;
}

function AuditPage({ onExport }: { onExport: () => void }) {
  return <><SectionHeader eyebrow="IMMUTABLE CONTROL RECORD" title="Audit trail" copy="Sensitive actions, actors, timestamps, and before-and-after state for every workflow." action={<button className="btn secondary" onClick={onExport}>Export audit log</button>} /><section className="panel audit-timeline">{demoAudit.map((item) => <div key={item.time}><span className="audit-dot" /><time>14 Jul 2026<br /><b>{item.time}</b></time><div><span className="asset-chip">{item.entity}</span><h3>{item.action.replaceAll("_", " ")}</h3><p>{item.detail}</p></div><strong>{item.actor}<small>Addis Ababa · Workspace</small></strong></div>)}</section></>;
}

function NewOrderForm({ value, setValue, clients, checks, busy, onValidate, onSubmit }: { value: NewOrderValue; setValue: (value: NewOrderValue) => void; clients: BrokerClient[]; checks: { label: string; passed: boolean; message: string }[] | null; busy: boolean; onValidate: () => void; onSubmit: (event: FormEvent) => void }) {
  const client = clients.find((item) => item.accountId === value.accountId) ?? clients[0];
  const instrument = demoInstruments.find((item) => item.id === value.instrumentId)!;
  const amounts = calculateOrderAmounts(value.side, Number(value.quantity) || 0, Number(value.price) || 0);
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL ORDER ENTRY</span><h2>Create client order</h2><p>Capture the instruction, run server-side controls, then submit for approval.</p></div><div className="stepper"><span className="active">1 <b>Instruction</b></span><i /><span className={checks ? "active" : ""}>2 <b>Validation</b></span><i /><span>3 <b>Review</b></span></div><div className="form-section"><h3>Client instruction</h3><label>Client account<select value={value.accountId} onChange={(event) => { setValue({ ...value, accountId: event.target.value }); }}>{clients.map((item) => <option key={item.id} value={item.accountId}>{item.code} · {item.name}</option>)}</select><small>{etb(client.availableCash)} available cash · KYC {client.kyc.replaceAll("_", " ")}</small></label><label>Instrument<select value={value.instrumentId} onChange={(event) => { const next = demoInstruments.find((item) => item.id === event.target.value)!; setValue({ ...value, instrumentId: event.target.value, price: String(next.price) }); }} >{demoInstruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select><small>{instrument.asset} · {instrument.status} · Lot {instrument.lot} · {instrument.cycle}</small></label><div className="segmented"><button type="button" className={value.side === "buy" ? "active buy" : ""} onClick={() => setValue({ ...value, side: "buy" })}>BUY</button><button type="button" className={value.side === "sell" ? "active sell" : ""} onClick={() => setValue({ ...value, side: "sell" })}>SELL</button></div><div className="field-row"><label>Quantity<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /></label><label>Limit price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><div className="field-row"><label>Order type<select value={value.orderType} onChange={(event) => setValue({ ...value, orderType: event.target.value })}><option>Limit</option><option>Market</option></select></label><label>Validity<select value={value.validity} onChange={(event) => setValue({ ...value, validity: event.target.value })}><option>Day</option><option>Good till date</option><option>Immediate or cancel</option></select></label></div><label>Dealer notes<textarea rows={3} placeholder="Optional client instruction details" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label></div><div className="estimate-card"><span><small>Gross consideration</small><b>{etb(amounts.gross)}</b></span><span><small>Estimated fees (0.50%)</small><b>{etb(amounts.fees)}</b></span><span><small>Estimated net</small><strong>{etb(amounts.net)}</strong></span></div><div className="validation-card"><div><h3>Pre-trade validation</h3><button type="button" className="btn secondary small" onClick={onValidate}>Run validation</button></div>{checks ? <ul>{checks.map((check) => <li key={check.label} className={check.passed ? "pass" : "fail"}><span>{check.passed ? "✓" : "!"}</span><b>{check.label}</b><small>{check.message}</small></li>)}</ul> : <p>Run all cash, holdings, KYC, account, tradability, lot, and tick-size controls before submission.</p>}</div><div className="drawer-actions"><button type="button" className="btn secondary" disabled>Save draft</button><button type="submit" className="btn primary" disabled={busy || !checks?.every((item) => item.passed)}>{busy ? "Submitting…" : "Submit for review"} <span>→</span></button></div></form>;
}

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

function PerformancePage({ orders, clients, period, setPeriod, onOpen }: { orders: DemoOrder[]; clients: BrokerClient[]; period: Period; setPeriod: (period: Period) => void; onOpen: (order: DemoOrder) => void }) {
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

function OrderDetail({ order, role, busy, controls, onApprove, onReject, onCancel, onTrade, onSettle, onContract }: { order: DemoOrder; role: Role; busy: string | null; controls: { makerChecker: boolean; approvalThreshold: number } | null; onApprove: () => void; onReject: () => void; onCancel: () => void; onTrade: () => void; onSettle: () => void; onContract: () => void }) {
  const remaining = order.remainingQuantity ?? order.quantity;
  const events = order.events?.length ? order.events : [
    { id: `${order.id}-created`, fromStatus: null, toStatus: "submitted", reason: "Order created and pre-trade controls recorded", actor: "Mekdes Tadesse", createdAt: order.createdAt },
    { id: `${order.id}-current`, fromStatus: null, toStatus: order.status, reason: statusLabels[order.status], actor: order.trader, createdAt: order.createdAt },
  ];
  const maker = events.find((event) => event.fromStatus === null)?.actor;
  // Mirror the server rule: four-eyes applies only when the tenant has maker-checker
  // on and the order value meets the approval threshold. Default strict when unknown.
  const requiresFourEyes = controls ? controls.makerChecker && order.estimatedNet >= controls.approvalThreshold : true;
  return <div className="drawer-content">
    <div className="drawer-title"><span className="eyebrow">ORDER CONTROL</span><h2>{order.id}</h2><div className="title-badges"><StatusBadge status={order.status} /><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></div></div>
    <div className="order-hero"><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · {order.accountId.replace("acc_", "TRD-").toUpperCase()}</span></div><strong>{fmt.format(order.quantity)} <small>{order.symbol}</small></strong><p>@ {fmt.format(order.price)} ETB · {order.orderType}</p></div>
    {(order.filledQuantity ?? 0) > 0 && <div className="fill-progress"><span><b>{fmt.format(order.filledQuantity ?? 0)}</b> filled</span><span><b>{fmt.format(remaining)}</b> remaining</span><i><em style={{ width: `${Math.min(100, ((order.filledQuantity ?? 0) / order.quantity) * 100)}%` }} /></i></div>}
    <dl className="detail-grid"><div><dt>Gross consideration</dt><dd>{etb(order.estimatedGross)}</dd></div><div><dt>Estimated fees</dt><dd>{etb(order.estimatedFees)}</dd></div><div className="total"><dt>Estimated net</dt><dd>{etb(order.estimatedNet)}</dd></div><div><dt>Source</dt><dd>{order.source}</dd></div><div><dt>Assigned trader</dt><dd>{order.trader}</dd></div><div><dt>Risk flag</dt><dd>{order.riskFlag === "none" ? "No flags" : "Enhanced review"}</dd></div></dl>
    <div className="workflow-card"><h3>Workflow history</h3><ol>{events.map((event, index) => <li className={index === events.length - 1 ? "current" : "done"} key={event.id}><i>{index === events.length - 1 ? index + 1 : "✓"}</i><div><b>{statusLabels[event.toStatus as OrderStatus] ?? event.toStatus.replaceAll("_", " ")}</b><small>{new Date(event.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {event.actor}{event.reason ? ` · ${event.reason}` : ""}</small></div></li>)}</ol></div>
    {role === "management" && <div className="permission-note">Read-only management mode: workflow actions are disabled.</div>}
    {order.status === "pending_broker_review" && requiresFourEyes && <div className="permission-note">{controls ? `Four-eyes control: at or above ${etb(controls.approvalThreshold)} the maker${maker ? ` (${maker})` : ""} cannot approve this order — a second authorized approver is required.` : `Four-eyes control: the order maker${maker ? ` (${maker})` : ""} cannot approve this order; a second authorized approver is required.`}</div>}
    {order.status === "pending_broker_review" && !requiresFourEyes && <div className="permission-note" style={{ background: "#e8f8f2", borderColor: "#bfe6d5", color: "#17765b" }}>Below the four-eyes threshold — a single authorized approver may release this order.</div>}
    <div className="drawer-actions stacked">
      {order.status === "pending_broker_review" && <><button className="btn secondary" onClick={onCancel} disabled={Boolean(busy) || !hasPermission(role, "create")}>Cancel</button><button className="btn danger" onClick={onReject} disabled={Boolean(busy) || !hasPermission(role, "reject")}>Reject</button><button className="btn primary" onClick={onApprove} disabled={Boolean(busy) || !hasPermission(role, "approve")}>{busy === "approve" ? "Approving…" : "Approve & block assets"}</button></>}
      {order.status === "approved" && <><button className="btn secondary" onClick={onCancel} disabled={Boolean(busy) || !hasPermission(role, "create")}>Cancel & release</button><button className="btn primary" onClick={onTrade} disabled={Boolean(busy) || !hasPermission(role, "trade")}>Capture execution <span>→</span></button></>}
      {order.status === "partially_filled" && <><button className="btn secondary" onClick={onContract}>Contract note</button>{remaining > 0 && <button className="btn primary" onClick={onTrade} disabled={Boolean(busy) || !hasPermission(role, "trade")}>Capture remaining fill</button>}{order.tradeId && <button className="btn primary" onClick={onSettle} disabled={Boolean(busy) || !hasPermission(role, "settle")}>Settle next fill</button>}</>}
      {order.status === "settlement_pending" && <><button className="btn secondary" onClick={onContract}>Contract note</button><button className="btn primary" onClick={onSettle} disabled={Boolean(busy) || !hasPermission(role, "settle")}>{busy === "settle" ? "Settling…" : "Confirm next settlement"}</button></>}
      {order.status === "settled" && <button className="btn secondary full" onClick={onContract}>View contract note</button>}
    </div>
  </div>;
}

function TradeForm({ order, value, setValue, busy, onSubmit, onCancel }: { order: DemoOrder; value: TradeValue; setValue: (value: TradeValue) => void; busy: boolean; onSubmit: (event: FormEvent) => void; onCancel: () => void }) {
  const amount = calculateOrderAmounts(order.side, Number(value.quantity) || 0, Number(value.price) || 0);
  const remaining = order.remainingQuantity ?? order.quantity;
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL TRADE CAPTURE</span><h2>Record execution</h2><p>Link a full or partial fill to {order.id}. No ESX message will be sent.</p></div><div className="manual-callout"><span>MANUAL</span><p>Confirm these details against the official external execution record before capture.</p></div><div className="order-reference"><span>{order.side.toUpperCase()}</span><div><b>{fmt.format(remaining)} {order.symbol} remaining</b><small>{order.client} · Limit {fmt.format(order.price)} ETB</small></div></div><div className="form-section"><div className="field-row"><label>Quantity filled<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /><small>Maximum remaining {fmt.format(remaining)}</small></label><label>Execution price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><label>Trade date<input type="date" value={value.tradeDate} onChange={(event) => setValue({ ...value, tradeDate: event.target.value })} /></label></div><div className="estimate-card"><span><small>Gross amount</small><b>{etb(amount.gross)}</b></span><span><small>Fees</small><b>{etb(amount.fees)}</b></span><span><small>Net amount</small><strong>{etb(amount.net)}</strong></span></div><div className="drawer-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{busy ? "Capturing…" : "Capture trade & open settlement"}</button></div></form>;
}

function ContractNote({ order, onPrint }: { order: DemoOrder; onPrint: () => void }) {
  return <div className="drawer-content contract-wrapper"><div className="contract-toolbar"><div><span className="eyebrow">PRINTABLE CONTRACT NOTE</span><h2>{order.tradeId ?? "Trade pending"}</h2></div><button className="btn primary" onClick={onPrint}>Print / Save PDF</button></div><article className="contract-note"><header><div className="contract-brand"><img src="/frankscore-icon.png" alt="" /><span><b>Abyssinia Securities S.C.</b><small>Licensed securities broker · ESCA-BR-004</small></span></div><div><b>CONTRACT NOTE</b><small>Original · Client copy</small></div></header><section><div><small>CLIENT</small><b>{order.client}</b><span>{order.clientCode} · Addis Ababa, Ethiopia</span></div><div><small>CONTRACT NOTE NO.</small><b>CN-2026-{order.id.slice(-4)}</b><span>Trade date · 14 July 2026</span></div></section><table><thead><tr><th>Security</th><th>Side</th><th className="num">Quantity</th><th className="num">Price (ETB)</th><th className="num">Gross (ETB)</th></tr></thead><tbody><tr><td><b>{order.symbol}</b><small>{demoInstruments.find((item) => item.id === order.instrumentId)?.name}</small></td><td>{order.side.toUpperCase()}</td><td className="num">{fmt.format(order.quantity)}</td><td className="num">{fmt.format(order.price)}</td><td className="num"><b>{fmt.format(order.estimatedGross)}</b></td></tr></tbody></table><div className="contract-totals"><span><small>Gross consideration</small><b>{etb(order.estimatedGross)}</b></span><span><small>Brokerage & market fees</small><b>{etb(order.estimatedFees)}</b></span><span><small>{order.side === "buy" ? "Amount payable" : "Net proceeds"}</small><strong>{etb(order.estimatedNet)}</strong></span></div><div className="contract-meta"><span><small>ORDER ID</small><b>{order.id}</b></span><span><small>TRADE ID</small><b>{order.tradeId ?? "Pending"}</b></span><span><small>SETTLEMENT DATE</small><b>{order.settlementDate ?? "Pending"}</b></span><span><small>SETTLEMENT CYCLE</small><b>{demoInstruments.find((item) => item.id === order.instrumentId)?.cycle}</b></span></div><footer><p>This contract note records a manually captured execution in FrankBroker OS. It is subject to confirmation against the broker’s official books and external market records.</p><div><span>Authorized by</span><b>Mekdes Tadesse</b><small>Broker administrator</small></div></footer></article></div>;
}
