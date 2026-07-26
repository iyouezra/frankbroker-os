"use client";

/* The logo dimensions are controlled by the portal and printable-note styles. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { demoAudit, initialOrders, type BrokerClient, type DemoOrder } from "../lib/demo-data";
import { CRM_PERMISSIONS, hasPermission, roleLabels, type OrderStatus, type Role } from "../lib/frank";
import type { Period } from "../lib/broker-analytics";
import { demoBrokerNotifications, timeAgo, type NotificationItem } from "../lib/notifications-demo";
import { isOrderEligibleClient } from "../lib/client-readiness";
import {
  BROKER_TENANT_ID,
  Icon,
  PENDING_CASH_STATUSES,
  calculateConfiguredAmounts,
  displayLabel,
  emptyReconBatch,
  etb,
  fallbackCashOperations,
  fallbackClients,
  fallbackCrmThreads,
  fallbackControls,
  fallbackFeatures,
  fallbackInstruments,
  fallbackReconBatch,
  fmt,
  hydrateOrders,
  initials,
  navGroups,
  navItems,
  navVisible,
  newClientDefaults,
  normalizedOrderType,
  queueVisible,
  roleNames,
  statusLabels,
  type AuditEntry,
  type BrokerCashInput,
  type BrokerInstrument,
  type CashOperationsData,
  type Drawer,
  type NewClientValue,
  type NewOrderValue,
  type CrmFocus,
  type CrmThreadsResponse,
  type NewThreadValue,
  type QueueItem,
  type ReconBatch,
  type TenantApiResult,
  type TenantControls,
  type TenantFeatures,
  type TenantInfo,
  type View,
} from "../features/broker/shared/broker-foundation";
import { Dashboard } from "../features/broker/dashboard/dashboard-screen";
import { ReconciliationPage, SettlementPage } from "../features/broker/operations/operations-screens";
import { SettingsPage, UsersPage } from "../features/broker/administration/administration-screens";
import { AuditPage, ReportsPage } from "../features/broker/oversight/reporting-screens";
import { PerformancePage } from "../features/broker/oversight/performance-screen";
import { OrdersPage } from "../features/broker/orders/order-log-screen";
import { CashOperationsPage } from "../features/broker/cash/cash-operations-screen";
import { ClientsPage } from "../features/broker/clients/client-directory-screen";
import { NewClientForm } from "../features/broker/clients/new-client-form";
import { ContractNote, NewOrderForm, OrderDetail, TradeForm } from "../features/broker/orders/order-drawers";
import { CrmInboxPage } from "../features/broker/crm/crm-inbox-screen";
import { MyTasksPage } from "../features/broker/crm/my-tasks-screen";
import { ComplaintsPage } from "../features/broker/crm/complaints-screen";
import { NewThreadForm } from "../features/broker/crm/thread-composer";
import { MarketWatchPage, type OrderFocus } from "../features/broker/market/market-watch-screen";
import { BrokerOrderOutcomeDialog } from "../features/broker/orders/order-submission-feedback";
import { BrandSelect } from "../features/shared/brand-select";
import {
  failedOutcome,
  heldOutcome,
  submittedOutcome,
  type OrderSubmissionOutcome,
} from "../lib/order-submission-ux";

export default function FrankBrokerApp() {
  const [view, setView] = useState<View>("dashboard");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState<string>(initialOrders[0].id);
  const [orders, setOrders] = useState<DemoOrder[]>(hydrateOrders(initialOrders));
  const [orderDetails, setOrderDetails] = useState<Record<string, DemoOrder>>({});
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>("broker_admin");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [clients, setClients] = useState<BrokerClient[]>(fallbackClients);
  const [selectedClientId, setSelectedClientId] = useState(fallbackClients[0].id);
  const [reconBatch, setReconBatch] = useState<ReconBatch>(fallbackReconBatch);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(demoAudit);
  const [cashOperations, setCashOperations] = useState<CashOperationsData>(fallbackCashOperations);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState<NewOrderValue>({ accountId: "acc_meron", instrumentId: "ins_tele", side: "buy", quantity: "1000", price: "312.5", orderType: "Limit", validity: "Day", notes: "", submissionReference: crypto.randomUUID(), source: "phone", verificationChannel: "sms", verificationId: "", verificationCode: "", demoCode: "" });
  const [newClient, setNewClient] = useState<NewClientValue>(newClientDefaults);
  const [checks, setChecks] = useState<{ label: string; passed: boolean; message: string }[] | null>(null);
  const [controls, setControls] = useState<TenantControls>(fallbackControls);
  const [features, setFeatures] = useState<TenantFeatures>(fallbackFeatures);
  const [instruments, setInstruments] = useState<BrokerInstrument[]>(fallbackInstruments);
  const [collapsed, setCollapsed] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [tenantInfo, setTenantInfo] = useState<TenantInfo>({ name: "Abyssinia Securities", license: "ESCA-BR-004", primaryColor: "#0C8189" });
  const [tradeForm, setTradeForm] = useState({ quantity: "", price: "", tradeDate: "2026-07-14", captureReference: "" });
  const [orderFocus, setOrderFocus] = useState<OrderFocus | null>(null);
  const [orderOutcome, setOrderOutcome] = useState<OrderSubmissionOutcome | null>(null);
  // Set when arriving at Clients from the queue so the directory opens pre-filtered.
  const [clientsFocus, setClientsFocus] = useState<{ status: string } | null>(null);
  const [crmFocus, setCrmFocus] = useState<CrmFocus>(null);
  const [crmUnread, setCrmUnread] = useState(0);
  const [newThread, setNewThread] = useState<NewThreadValue>({ clientId: "", category: "general", priority: "normal", subject: "", body: "", relatedType: "", relatedId: "" });
  const pendingOrderCount = orders.filter((order) => order.status === "pending_broker_review").length;
  const eligibleClients = clients.filter(isOrderEligibleClient);
  const pendingClientCount = clients.filter((client) => client.status === "pending_approval").length;
  const pendingCashCount = cashOperations.movements.filter((movement) => PENDING_CASH_STATUSES.includes(movement.status)).length;

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/orders?pageSize=100", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Order API unavailable")))
      .then((result: { orders?: Array<Omit<DemoOrder, "time">> }) => {
        if (!result.orders) return;
        setOrders(hydrateOrders(result.orders));
      })
      .catch(() => {
        // Keep the static demonstration surface available before a database is connected.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cash-movements", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Cash API unavailable")))
      .then((result: CashOperationsData) => setCashOperations(result))
      .catch(() => setCashOperations(fallbackCashOperations));
    return () => controller.abort();
  }, [role]);

  // Unread conversation count for the sidebar badge; the facet is cheap so the
  // list itself is not fetched here.
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/threads?pageSize=10", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("CRM API unavailable")))
      .then((result: CrmThreadsResponse) => setCrmUnread(result.facets.unreadThreads))
      .catch(() => setCrmUnread(fallbackCrmThreads.filter((thread) => thread.unread > 0).length));
    return () => controller.abort();
  }, [role, view]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/clients", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/reconciliation", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/tenant", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/audit", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([clientResult, reconResult, tenantResult, auditResult]: [{ clients?: BrokerClient[] }, { batches?: ReconBatch[] }, TenantApiResult, { events?: AuditEntry[] }]) => {
      if (clientResult.clients) {
        setClients(clientResult.clients);
        setSelectedClientId((current) => clientResult.clients!.some((client) => client.id === current) ? current : clientResult.clients![0]?.id ?? "");
      }
      if (reconResult.batches) setReconBatch(reconResult.batches[0] ?? emptyReconBatch);
      if (auditResult.events) setAuditEntries(auditResult.events);
      const nextControls = { ...fallbackControls, ...(tenantResult.tenant?.controls ?? {}) };
      const nextFeatures: TenantFeatures = { ...fallbackFeatures };
      Object.entries(tenantResult.tenant?.features ?? {}).forEach(([key, enabled]) => {
        if (typeof enabled === "boolean") nextFeatures[key] = enabled;
      });
      setControls(nextControls);
      setFeatures(nextFeatures);
      if (tenantResult.tenant?.tradingName) setTenantInfo({ name: tenantResult.tenant.tradingName, license: tenantResult.tenant.licenseNumber ?? "", primaryColor: tenantResult.tenant.primaryColor ?? "#0C8189" });

      if (tenantResult.instruments) {
        const nextInstruments = tenantResult.instruments.map((instrument): BrokerInstrument => ({
          id: instrument.id,
          symbol: instrument.symbol,
          name: instrument.name,
          asset: displayLabel(instrument.assetClass),
          issuer: instrument.issuer,
          status: displayLabel(instrument.status),
          currency: instrument.currency,
          lot: instrument.lotSize,
          tick: instrument.tickSize,
          cycle: nextControls.settlementCycle || instrument.settlementCycle,
          price: instrument.price,
        }));
        setInstruments(nextInstruments);
        setNewOrder((current) => {
          const instrument = nextInstruments.find((item) => item.id === current.instrumentId) ?? nextInstruments[0];
          const orderType = nextControls.allowedOrderTypes.find((item) => normalizedOrderType(item) === normalizedOrderType(current.orderType)) ?? nextControls.allowedOrderTypes[0] ?? "";
          return { ...current, instrumentId: instrument?.id ?? "", price: instrument && instrument.id !== current.instrumentId ? String(instrument.price) : current.price, orderType };
        });
      }
    }).catch(() => {
      // The synthetic fallback keeps the market-validation demo usable offline.
    });
    return () => controller.abort();
  }, []);

  const selected = orderDetails[selectedId] ?? orders.find((order) => order.id === selectedId) ?? orders[0];

  const notify = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("frank-theme", next); } catch { /* storage unavailable */ }
  };

  const loadOrderDetail = async (id: string) => {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
      if (!response.ok) throw new Error("Order detail unavailable");
      const result = await response.json() as { order: Omit<DemoOrder, "time"> };
      const detail = hydrateOrders([result.order])[0];
      setOrderDetails((current) => ({ ...current, [id]: detail }));
      return detail;
    } catch {
      return null;
    }
  };

  const openDetail = (order: DemoOrder) => {
    setSelectedId(order.id);
    setDrawer("detail");
    void loadOrderDetail(order.id);
  };

  // Cross-domain work queue: orders, onboarding, cash instructions, and
  // reconciliation breaks in one place, filtered to what this role can action.
  const queueItems = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    for (const order of orders) {
      if (order.status === "pending_broker_review") {
        items.push({
          key: `order-${order.id}`, permission: "approve", tone: order.riskFlag !== "none" ? "danger" : "warning", icon: "orders",
          title: order.riskFlag !== "none" ? "Order awaiting approval · enhanced review" : "Order awaiting approval",
          detail: `${order.id} · ${order.client} · ${order.side.toUpperCase()} ${fmt.format(order.quantity)} ${order.symbol}`,
          onOpen: () => openDetail(order),
        });
      } else if (order.status === "validation_failed") {
        items.push({
          key: `order-${order.id}`, permission: "create", tone: "danger", icon: "orders",
          title: "Order validation failed",
          detail: `${order.id} · ${order.client} · needs correction or cancellation`,
          onOpen: () => openDetail(order),
        });
      }
    }
    for (const client of clients) {
      if (client.status === "pending_approval") {
        items.push({
          key: `client-${client.id}`, permission: "report", roles: ["broker_admin", "relationship_officer", "service_officer", "operations"], tone: "warning", icon: "clients",
          title: "Client awaiting onboarding approval",
          detail: `${client.code} · ${client.name} · KYC ${displayLabel(client.kyc)}`,
          onOpen: () => { setClientsFocus({ status: "pending_approval" }); setSelectedClientId(client.id); setView("clients"); },
        });
      }
    }
    for (const movement of cashOperations.movements) {
      if (!PENDING_CASH_STATUSES.includes(movement.status)) continue;
      const isDeposit = movement.type === "deposit";
      items.push({
        key: `cash-${movement.id}`, permission: "adjust", tone: "warning", icon: "cash",
        title: movement.status === "approved" ? "Withdrawal awaiting payment" : isDeposit ? "Deposit awaiting verification" : "Withdrawal awaiting approval",
        detail: `${movement.id} · ${movement.client?.name ?? "Client"} · ${fmt.format(movement.amount)} ${movement.currency}`,
        onOpen: () => setView("cash"),
      });
    }
    if (reconBatch.exceptionRecords > 0) {
      items.push({
        key: "recon-exceptions", permission: "adjust", tone: "danger", icon: "reconciliation",
        title: `${reconBatch.exceptionRecords} reconciliation ${reconBatch.exceptionRecords === 1 ? "exception" : "exceptions"} open`,
        detail: `${reconBatch.id} · unresolved cash or securities breaks`,
        onOpen: () => setView("reconciliation"),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, clients, cashOperations, reconBatch]);
  const visibleQueue = queueItems.filter((item) => queueVisible(item, role));

  // Notifications are role-aware: switching the demo role reloads the feed so
  // approvers, traders, and settlement each see what they must act on.
  const notifyHeaders = { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role };
  useEffect(() => {
    const controller = new AbortController();
    const refreshBrokerAlerts = () => {
      void Promise.all([
        fetch("/api/notifications", { signal: controller.signal, headers: notifyHeaders })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline"))),
        fetch("/api/clients", { signal: controller.signal, headers: notifyHeaders })
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline"))),
      ]).then(([notificationResult, clientResult]: [{ notifications: NotificationItem[] }, { clients?: BrokerClient[] }]) => {
        setNotifications(notificationResult.notifications);
        if (clientResult.clients) setClients(clientResult.clients);
      }).catch(() => {
        if (!controller.signal.aborted) setNotifications(demoBrokerNotifications(role));
      });
    };
    refreshBrokerAlerts();
    const interval = window.setInterval(refreshBrokerAlerts, 10_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  // If the active role can't see the current view, fall back to the dashboard.
  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    const current = navItems.find((item) => item.id === view);
    if (current && !navVisible(current, nextRole)) setView("dashboard");
  };
  const unreadCount = notifications.filter((item) => !item.read).length;
  const markAllRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    void fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json", ...notifyHeaders }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  };
  const openNotification = (item: NotificationItem) => {
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
    void fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json", ...notifyHeaders }, body: JSON.stringify({ id: item.id }) }).catch(() => undefined);
    setBellOpen(false);
    if (item.entityType === "order" && item.entityId) {
      const order = orders.find((row) => row.id === item.entityId);
      if (order) { openDetail(order); return; }
      setView("orders");
    } else if (item.entityType === "communication_thread") {
      setCrmFocus(item.entityId ? { threadId: item.entityId } : null);
      setView("crm");
    } else if (item.entityType === "client") setView("clients");
    else if (item.entityType === "cash_movement") setView("cash");
    else if (item.entityType === "reconciliation") setView("reconciliation");
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
      return apiRequest<{ status: OrderStatus; contractNoteNumber?: string; trade?: { id: string; tradeDate: string; settlementDate: string; quantity: number; executionPrice: number; gross: number; fees: number; net: number; cashStatus: string; securitiesStatus: string; capturedBy: string }; filledQuantity?: number; remainingQuantity?: number; averageFillPrice?: number; executedGross?: number; executedFees?: number; executedNet?: number; blockedCash?: number; blockedQuantity?: number }>(`/api/orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify(payload),
      });
  };

  const refreshOrders = async () => {
    const result = await apiRequest<{ orders: Array<Omit<DemoOrder, "time">> }>("/api/orders?pageSize=100", {
      headers: { "x-frank-demo-role": role },
    });
    setOrders(hydrateOrders(result.orders));
    setOrderRefreshKey((current) => current + 1);
  };

  const refreshOmsData = async () => {
    try {
      const [, clientResult, auditResult] = await Promise.all([
        refreshOrders(),
        apiRequest<{ clients: BrokerClient[] }>("/api/clients", { headers: { "x-frank-demo-role": role } }),
        apiRequest<{ events: AuditEntry[] }>("/api/audit", { headers: { "x-frank-demo-role": role } }),
      ]);
      setClients(clientResult.clients);
      setAuditEntries(auditResult.events);
    } catch {
      // The workflow response remains authoritative even if a follow-up refresh fails.
    }
  };

  const refreshCashData = async () => {
    const result = await apiRequest<CashOperationsData>("/api/cash-movements", { headers: { "x-frank-demo-role": role } });
    setCashOperations(result);
  };

  const createCashInstruction = async (input: BrokerCashInput) => {
    setBusyAction("cash_create");
    try {
      await apiRequest("/api/cash-movements", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify(input) });
      await Promise.all([refreshCashData(), refreshOmsData()]);
      notify(`${displayLabel(input.movementType)} instruction recorded. Controlled review is now required.`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Cash instruction could not be recorded.", "error");
      return false;
    } finally { setBusyAction(null); }
  };

  const actOnCashInstruction = async (id: string, action: "verify" | "approve" | "complete" | "reject" | "fail", detail: { reason?: string; bankReference?: string }) => {
    setBusyAction(`cash_${id}_${action}`);
    try {
      await apiRequest(`/api/cash-movements/${encodeURIComponent(id)}/action`, { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ action, ...detail }) });
      await Promise.all([refreshCashData(), refreshOmsData()]);
      notify(`${id} updated. Account, pooled-bank, beneficial-owner, and audit records remain linked.`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Cash instruction could not be updated.", "error");
      return false;
    } finally { setBusyAction(null); }
  };

  const actionOrder = async (action: "approve" | "reject" | "cancel" | "settle" | "fail") => {
    const permission = action === "settle" ? "settle" : action === "cancel" ? "create" : action === "fail" ? "adjust" : action;
    if (!hasPermission(role, permission)) return notify(`${roleLabels[role]} cannot ${action} orders.`, "error");
    setBusyAction(action);
    try {
      const result = await persistAction(selected.id, {
        action,
        tradeId: action === "settle" ? selected.trades?.find((trade) => trade.settlementStatus !== "settled")?.id ?? selected.tradeId : undefined,
        reason: action === "reject"
          ? "Rejected after compliance review"
          : action === "cancel"
            ? "Cancelled by broker"
            : action === "fail"
              ? "Operational failure recorded by broker"
              : undefined,
      });
      updateStatus(selected.id, result.status);
      await refreshOmsData();
      await loadOrderDetail(selected.id);
      notify(`${selected.id} marked ${statusLabels[result.status].toLowerCase()}. Audit event recorded.`);
      setDrawer(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The workflow action failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const openTrade = (order: DemoOrder) => {
    if (!features.manualTradeCapture) return notify("Manual trade capture is disabled for this tenant in the admin console.", "error");
    if (!hasPermission(role, "trade")) return notify(`${roleLabels[role]} cannot capture trades.`, "error");
    setSelectedId(order.id);
    setTradeForm({ quantity: String(order.remainingQuantity ?? order.quantity), price: String(order.price), tradeDate: new Date().toISOString().slice(0, 10), captureReference: "" });
    setDrawer("trade");
  };

  const captureTrade = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(tradeForm.quantity);
    const price = Number(tradeForm.price);
    const remaining = selected.remainingQuantity ?? selected.quantity;
    if (!quantity || !price || quantity > remaining) return notify(`Enter a quantity up to the remaining ${fmt.format(remaining)} units.`, "error");
    if (!tradeForm.captureReference.trim()) return notify("Enter the official execution reference.", "error");
    setBusyAction("execute");
    try {
      const result = await persistAction(selected.id, { action: "execute", executionPrice: price, quantityFilled: quantity, tradeDate: tradeForm.tradeDate, captureReference: tradeForm.captureReference });
      updateStatus(selected.id, result.status, {
        tradeId: result.trade?.id,
        capturedBy: result.trade?.capturedBy,
        tradeDate: result.trade?.tradeDate,
        settlementDate: result.trade?.settlementDate,
        tradeQuantity: result.trade?.quantity,
        executionPrice: result.trade?.executionPrice,
        tradeGross: result.trade?.gross,
        tradeFees: result.trade?.fees,
        tradeNet: result.trade?.net,
        cashStatus: result.trade?.cashStatus,
        securitiesStatus: result.trade?.securitiesStatus,
        filledQuantity: result.filledQuantity,
        remainingQuantity: result.remainingQuantity,
        averageFillPrice: result.averageFillPrice,
        executedGross: result.executedGross,
        executedFees: result.executedFees,
        executedNet: result.executedNet,
        blockedCash: result.blockedCash,
        blockedQuantity: result.blockedQuantity,
      });
      await refreshOmsData();
      await loadOrderDetail(selected.id);
      setDrawer(null);
      notify(`${result.trade?.id ?? "Trade"} captured. Settlement is due ${result.trade?.settlementDate}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Trade capture failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const printContractNote = async () => {
    if (!selected.tradeId && !(selected.trades?.length)) return;
    setBusyAction("contract_note");
    try {
      const result = await persistAction(selected.id, { action: "contract_note" });
      updateStatus(selected.id, result.status, { contractNoteNumber: result.contractNoteNumber });
      await refreshOmsData();
      await loadOrderDetail(selected.id);
      window.print();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Contract note generation failed.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const runValidation = () => {
    const client = clients.find((item) => item.accountId === newOrder.accountId);
    const instrument = instruments.find((item) => item.id === newOrder.instrumentId);
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    const assetClass = instrument?.asset.toLowerCase().includes("bond") ? "bond" : "equity";
    const amounts = calculateConfiguredAmounts(newOrder.side, quantity, price, controls.brokerageFeePct, controls.minimumFee, controls.feeRules.find((rule) => rule.assetClass === assetClass));
    const owned = client && instrument ? client.holdings.find((holding) => holding.symbol === instrument.symbol)?.available ?? 0 : 0;
    const orderTypeAllowed = controls.allowedOrderTypes.some((item) => normalizedOrderType(item) === normalizedOrderType(newOrder.orderType));
    const results = [
      { label: "Client and account", passed: Boolean(client), message: client ? `${client.code} · ${client.status}` : "Select an available client account" },
      { label: "KYC approved", passed: client?.kyc === "approved", message: client?.kyc.replaceAll("_", " ") ?? "Client unavailable" },
      { label: "Account active", passed: client?.status === "active", message: client?.status ?? "Client unavailable" },
      { label: "Instrument tradable", passed: instrument?.status === "Tradable", message: instrument ? `${instrument.symbol} · ${instrument.status}` : "No instruments are enabled for this tenant" },
      { label: "Order type enabled", passed: orderTypeAllowed, message: orderTypeAllowed ? `${newOrder.orderType} is enabled` : "Enable an order type in the admin console" },
      { label: "Quantity valid", passed: Boolean(instrument && quantity > 0 && quantity % instrument.lot === 0), message: instrument ? `Lot size ${instrument.lot}` : "Instrument unavailable" },
      { label: "Price valid", passed: Boolean(instrument && price > 0 && Math.abs(price / instrument.tick - Math.round(price / instrument.tick)) < 0.001), message: instrument ? `Tick size ${instrument.tick} ETB` : "Instrument unavailable" },
      newOrder.side === "buy"
        ? { label: "Cash including fees", passed: Boolean(client && client.availableCash >= amounts.net), message: client ? `${etb(client.availableCash)} available` : "Client unavailable" }
        : { label: "Available, unblocked holdings", passed: Boolean(instrument && owned >= quantity), message: instrument ? `${fmt.format(owned)} ${instrument.symbol} available` : "Instrument unavailable" },
    ];
    setChecks(results);
    notify(results.every((item) => item.passed) ? "All pre-trade checks passed." : "Validation found checks that need attention.");
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!checks?.every((item) => item.passed)) return notify("Run validation and resolve failed checks before submission.", "error");
    const quantity = Number(newOrder.quantity);
    const price = Number(newOrder.price);
    let stage: "authorization" | "submission" = "authorization";
    setBusyAction("create");
    try {
      const verificationId = newOrder.verificationId;
      if (!verificationId) {
        const challenge = await apiRequest<{ id: string; demoCode?: string; destinationHint?: string }>("/api/verifications", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ action: "request_order", ...newOrder, quantity, price }) });
        setNewOrder((current) => ({ ...current, verificationId: challenge.id, demoCode: challenge.demoCode ?? "" }));
        notify(`Authorization code requested for ${challenge.destinationHint ?? "the registered contact"}. Enter it to submit the exact instruction.`);
        return;
      }
      if (newOrder.verificationCode.length !== 6) throw new Error("Enter the 6-digit client authorization code.");
      await apiRequest("/api/verifications", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ action: "confirm", accountId: newOrder.accountId, verificationId, code: newOrder.verificationCode }) });
      stage = "submission";
      const result = await apiRequest<{ order: DemoOrder; checks?: { code: string; label: string; passed: boolean; message: string }[] }>("/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ ...newOrder, verificationId, quantity, price }) });
      // Reflect the server's authoritative pre-trade checks (incl. daily limit).
      if (result.checks) setChecks(result.checks);
      const failed = result.checks?.filter((item) => !item.passed) ?? [];
      const created = { ...result.order, orderType: displayLabel(result.order.orderType), time: new Date(result.order.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), trader: "Unassigned" };
      setOrders((current) => [created, ...current]);
      await refreshOmsData();
      setDrawer(null);
      setChecks(null);
      setNewOrder((current) => ({ ...current, verificationId: "", verificationCode: "", demoCode: "", submissionReference: crypto.randomUUID() }));
      if (result.order.status === "validation_failed") {
        setView("orders");
        setOrderOutcome(heldOutcome({ audience: "broker", orderId: created.id, channel: newOrder.source, detail: failed[0]?.message }));
        return;
      }
      setView("orders");
      setOrderOutcome(submittedOutcome({ audience: "broker", orderId: created.id, channel: newOrder.source }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order submission failed.";
      setOrderOutcome(failedOutcome({ audience: "broker", stage, channel: newOrder.source, detail: message }));
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
    const firstEligible = eligibleClients.find((client) => client.accountId === newOrder.accountId) ?? eligibleClients[0];
    if (!firstEligible) {
      setView("clients");
      return notify("No approved, trade-ready client is available. Complete client approval first.", "error");
    }
    setChecks(null);
    setNewOrder((current) => ({ ...current, accountId: firstEligible.accountId, submissionReference: crypto.randomUUID() }));
    setDrawer("new");
  };

  const openNewClient = () => {
    if (!hasPermission(role, "create")) return notify(`${roleLabels[role]} cannot create clients.`, "error");
    setNewClient(newClientDefaults());
    setDrawer("client");
  };

  const openNewThread = () => {
    if (!hasPermission(role, CRM_PERMISSIONS.create)) return notify(`${roleLabels[role]} cannot start conversations.`, "error");
    setNewThread({ clientId: clients[0]?.id ?? "", category: "general", priority: "normal", subject: "", body: "", relatedType: "", relatedId: "" });
    setDrawer("crm_thread");
  };

  /** Jump from a conversation's related-record card to the underlying record. */
  const openRelatedRecord = (type: string, id: string) => {
    if (type === "order" || type === "trade") {
      const order = orders.find((item) => item.id === id);
      if (order) { openDetail(order); return; }
      setView("orders");
      return;
    }
    if (type === "cash_movement") { setView("cash"); return; }
    if (type === "service_request" || type === "account" || type === "kyc" || type === "document") setView("clients");
  };

  const submitThread = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("crm_thread");
    try {
      await apiRequest<{ thread: { id: string } }>("/api/crm/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-demo-role": role },
        body: JSON.stringify(newThread),
      });
      setDrawer(null);
      setView("crm");
      notify("Conversation started and the investor was notified.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "The conversation could not be started.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const submitClient = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction("create_client");
    try {
      const formData = new FormData();
      const { documentFiles, ...payload } = newClient;
      formData.set("payload", JSON.stringify(payload));
      Object.entries(documentFiles).forEach(([type, file]) => {
        if (file) formData.set(type, file);
      });
      const result = await apiRequest<{ client: { id: string; clientCode: string; status: string } }>("/api/clients", {
        method: "POST",
        headers: { "x-frank-demo-role": role },
        body: formData,
      });
      await refreshOmsData();
      setSelectedClientId(result.client.id);
      setView("clients");
      setDrawer(null);
      setNewClient(newClientDefaults());
      notify(`${result.client.clientCode} submitted for independent approval. It will appear in New Order after activation.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Client onboarding failed.", "error");
    } finally {
      setBusyAction(null);
    }
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
          {navGroups.map((group) => {
            const items = group.items.filter((item) => navVisible(item, role));
            if (!items.length) return null;
            return <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setDrawer(null); }} title={item.label}><i><Icon name={item.icon} size={20} /></i><span>{item.label}</span>{item.id === "orders" && pendingOrderCount > 0 && <em>{pendingOrderCount}</em>}{item.id === "clients" && pendingClientCount > 0 && <em className="warn">{pendingClientCount}</em>}{item.id === "cash" && pendingCashCount > 0 && <em className="warn">{pendingCashCount}</em>}{item.id === "crm" && crmUnread > 0 && <em className="warn">{crmUnread}</em>}{item.id === "reconciliation" && reconBatch.exceptionRecords > 0 && <em className="warn">{reconBatch.exceptionRecords}</em>}</button>)}
            </div>;
          })}
        </nav>
        <div className="sidebar-foot"><div className="sidebar-user"><span className="su-avatar">{initials(roleNames[role])}</span><div><b>{roleNames[role]}</b><div className="su-role"><BrandSelect className="bselect-bare" value={role} onChange={(next) => changeRole(next as Role)} ariaLabel="Active role" options={Object.entries(roleLabels).map(([id, label]) => ({ value: id, label }))} /></div></div></div></div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><img src="/frankscore-icon.png" alt="" /><b>FrankBroker</b></div>
          <div className="tenant-chip" title={`${tenantInfo.name}${tenantInfo.license ? ` · ${tenantInfo.license}` : ""}`}><span style={{ background: tenantInfo.primaryColor }}>{tenantInfo.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><div><small>TENANT</small><b>{tenantInfo.name}</b></div></div>
          <label className="search"><span><Icon name="search" size={17} /></span><input aria-label="Search orders or clients" placeholder="Search orders or clients…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><span className="business-date">Business date <b>14 JUL 2026</b></span><button className="icon-button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button><div className="notif-wrap"><button className="icon-button" aria-label="Notifications" onClick={() => {
            setBellOpen((value) => !value);
            if (!bellOpen) {
              void fetch("/api/notifications", { headers: notifyHeaders })
                .then((response) => response.ok ? response.json() : Promise.reject())
                .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
                .catch(() => undefined);
            }
          }}><Icon name="bell" size={18} />{unreadCount > 0 && <em>{unreadCount > 9 ? "9+" : unreadCount}</em>}</button>{bellOpen && <><div className="notif-scrim" onClick={() => setBellOpen(false)} /><div className="notif-panel" role="dialog" aria-label="Notifications"><div className="notif-head"><b>Notifications</b>{unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}</div><div className="notif-list">{notifications.length === 0 ? <div className="notif-empty">You&apos;re all caught up.</div> : notifications.map((item) => <button key={item.id} className={`notif-item${item.read ? "" : " unread"}`} onClick={() => openNotification(item)}><i className={`notif-dot sev-${item.severity}`} /><div><b>{item.title}</b><p>{item.body}</p><small>{item.category} · {timeAgo(item.createdAt)}</small></div></button>)}</div></div></>}</div></div>
        </header>

        <main>
          {view === "dashboard" && <Dashboard orders={orders} auditEntries={auditEntries} queue={visibleQueue} settlementCycle={controls.settlementCycle} manualTradeCapture={features.manualTradeCapture} onViewOrders={() => setView("orders")} onOpen={openDetail} onNewOrder={openNewOrder} onSettle={() => setView("settlement")} />}
          {view === "performance" && <PerformancePage orders={orders} clients={clients} period={period} setPeriod={setPeriod} onOpen={openDetail} />}
          {view === "market" && <MarketWatchPage role={role} orders={orders} onOpenOrder={openDetail} onViewOrders={(focus) => { setOrderFocus(focus); setQuery(""); setView("orders"); setDrawer(null); }} />}
          {view === "orders" && <OrdersPage orders={orders} query={query} role={role} refreshKey={orderRefreshKey} focus={orderFocus} onClearFocus={() => setOrderFocus(null)} onOpen={openDetail} onNewOrder={openNewOrder} />}
          {view === "clients" && <ClientsPage clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} orders={orders} instruments={instruments} role={role} focus={clientsFocus} onNewClient={openNewClient} onRefresh={refreshOmsData} onOpenOrder={openDetail} />}
          {view === "crm" && <CrmInboxPage key={crmFocus?.threadId ?? crmFocus?.clientId ?? "inbox"} role={role} focus={crmFocus} clients={clients} onNotify={notify} onNewThread={openNewThread} onOpenRelated={openRelatedRecord} />}
          {view === "crm_tasks" && <MyTasksPage role={role} onNotify={notify} onOpenClient={(clientId) => { setSelectedClientId(clientId); setView("clients"); }} />}
          {view === "crm_cases" && <ComplaintsPage role={role} onNotify={notify} onOpenThread={(threadId) => { setCrmFocus({ threadId }); setView("crm"); }} />}
          {view === "cash" && <CashOperationsPage data={cashOperations} clients={clients} role={role} busy={busyAction} onCreate={createCashInstruction} onAction={actOnCashInstruction} />}
          {view === "settlement" && <SettlementPage orders={orders} onOpen={openDetail} onExport={exportOrders} />}
          {view === "reconciliation" && <ReconciliationPage batch={reconBatch} busy={busyAction === "reconcile"} onFile={processReconFile} onDownload={downloadReconTemplate} onResolve={resolveReconException} resolvingId={busyAction} />}
          {view === "reports" && <ReportsPage orders={orders} clients={clients} audit={auditEntries} onDownloaded={(name) => notify(`${name} exported as CSV.`)} />}
          {view === "audit" && <AuditPage events={auditEntries} />}
          {view === "users" && <UsersPage role={role} />}
          {view === "settings" && <SettingsPage />}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.filter((item) => navVisible(item, role)).filter((item, index) => index < 5 || item.id === "market").map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i><Icon name={item.icon} size={21} /></i><span>{item.label.split(" ")[0]}</span></button>)}</nav>
      </div>

      {drawer && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className={`drawer ${drawer === "contract" ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={drawer === "new" ? "New order" : drawer === "client" ? "New client" : drawer === "crm_thread" ? "New conversation" : drawer === "trade" ? "Capture trade" : drawer === "contract" ? "Contract note" : "Order details"}>
          <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close">×</button>
          {drawer === "new" && <NewOrderForm value={newOrder} setValue={setNewOrder} clients={eligibleClients} instruments={instruments} controls={controls} checks={checks} busy={busyAction === "create"} onInstructionChange={() => setChecks(null)} onValidate={runValidation} onSubmit={submitOrder} />}
          {drawer === "client" && <NewClientForm value={newClient} setValue={setNewClient} busy={busyAction === "create_client"} onCancel={() => setDrawer(null)} onSubmit={submitClient} />}
          {drawer === "crm_thread" && <NewThreadForm value={newThread} setValue={setNewThread} clients={clients} busy={busyAction === "crm_thread"} onCancel={() => setDrawer(null)} onSubmit={submitThread} />}
          {drawer === "detail" && <OrderDetail order={selected} role={role} busy={busyAction} controls={controls} manualTradeCapture={features.manualTradeCapture} onApprove={() => actionOrder("approve")} onReject={() => actionOrder("reject")} onCancel={() => actionOrder("cancel")} onFail={() => actionOrder("fail")} onTrade={() => openTrade(selected)} onSettle={() => actionOrder("settle")} onContract={() => setDrawer("contract")} />}
          {drawer === "trade" && <TradeForm order={selected} role={role} value={tradeForm} setValue={setTradeForm} controls={controls} busy={busyAction === "execute"} onCancel={() => setDrawer(null)} onSubmit={captureTrade} />}
          {drawer === "contract" && <ContractNote order={selected} instruments={instruments} tenantInfo={tenantInfo} settlementCycle={controls.settlementCycle} busy={busyAction === "contract_note"} onPrint={printContractNote} />}
        </aside>
      </div>}
      {toast && <div className={`toast${toast.tone === "error" ? " toast-error" : ""}`}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.message}</div>}
      {orderOutcome && <BrokerOrderOutcomeDialog
        outcome={orderOutcome}
        onClose={() => { setOrderOutcome(null); setDrawer(null); }}
        onReturnToEntry={() => { setOrderOutcome(null); setDrawer("new"); }}
        onViewOrder={() => {
          const order = orderOutcome.orderId ? orders.find((item) => item.id === orderOutcome.orderId) : undefined;
          setOrderOutcome(null);
          setView("orders");
          if (order) openDetail(order);
        }}
      />}
    </div>
  );
}
