"use client";

/* The logo dimensions are controlled by the portal and printable-note styles. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { demoAudit, initialOrders, type BrokerClient, type DemoOrder } from "../lib/demo-data";
import { CRM_PERMISSIONS, hasPermission, roleLabels, type OrderStatus, type Role } from "../lib/frank";
import type { Period } from "../lib/broker-analytics";
import type { AppTarget, WorkItem } from "../lib/back-office";
import { demoBrokerNotifications, timeAgo, type NotificationItem } from "../lib/notifications-demo";
import { isOrderEligibleClient } from "../lib/client-readiness";
import {
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
  fallbackModules,
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
  roleNames,
  setDemoBrokerTenantId,
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
  type ReconBatch,
  type TenantApiResult,
  type TenantControls,
  type TenantFeatures,
  type TenantInfo,
  type TenantModules,
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
import { UniversalSearch } from "../features/broker/shared/universal-search";
import { AdvisoryWorkspace } from "../features/broker/advisory/advisory-workspace";
import {
  failedOutcome,
  heldOutcome,
  submittedOutcome,
  type OrderSubmissionOutcome,
} from "../lib/order-submission-ux";

type DemoTenantSummary = {
  id: string;
  tradingName: string;
  licenseNumber: string;
  primaryColor: string;
  businessType: string;
  modules: TenantModules;
  availableRoles: Role[];
};

export default function FrankBrokerApp() {
  const insecureDemoUiEnabled = true;
  const demoTenantSwitcherEnabled = insecureDemoUiEnabled;
  const [view, setView] = useState<View>("dashboard");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState<string>(initialOrders[0].id);
  const [orders, setOrders] = useState<DemoOrder[]>(hydrateOrders(initialOrders));
  const [orderDetails, setOrderDetails] = useState<Record<string, DemoOrder>>({});
  const [orderRefreshKey, setOrderRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>(insecureDemoUiEnabled ? "broker_admin" : "management");
  const [tenantId, setTenantId] = useState("brk_abyssinia");
  const [modules, setModules] = useState<TenantModules>(fallbackModules);
  const [businessType, setBusinessType] = useState("securities_dealer");
  const [availableRoles, setAvailableRoles] = useState<Role[]>(Object.keys(roleLabels).filter((item) => item !== "super_admin" && item !== "advisory_lead" && item !== "advisory_analyst") as Role[]);
  const [demoTenants, setDemoTenants] = useState<DemoTenantSummary[]>([]);
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [tenantInfo, setTenantInfo] = useState<TenantInfo>({ name: "Abyssinia Securities", license: "ESCA-BR-004", primaryColor: "#0C8189" });
  const [currentUserName, setCurrentUserName] = useState("");
  const [tradeForm, setTradeForm] = useState({ quantity: "", price: "", tradeDate: "2026-07-14", captureReference: "" });
  const [orderFocus, setOrderFocus] = useState<OrderFocus | null>(null);
  // A dashboard metric card can deep-link into the order log at a status tab.
  const [ordersStatusFocus, setOrdersStatusFocus] = useState<"all" | "review" | "executed" | "exceptions" | null>(null);
  const [orderOutcome, setOrderOutcome] = useState<OrderSubmissionOutcome | null>(null);
  // Set when arriving at Clients from the queue so the directory opens pre-filtered.
  const [clientsFocus, setClientsFocus] = useState<{ status?: string; clientId?: string; tab?: "overview" | "documents" } | null>(null);
  const [crmFocus, setCrmFocus] = useState<CrmFocus>(null);
  const [taskFocus, setTaskFocus] = useState<string | null>(null);
  const [caseFocus, setCaseFocus] = useState<string | null>(null);
  const [cashFocus, setCashFocus] = useState<string | null>(null);
  const [reconciliationFocus, setReconciliationFocus] = useState<string | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [crmUnread, setCrmUnread] = useState(0);
  const [newThread, setNewThread] = useState<NewThreadValue>({ clientId: "", category: "general", priority: "normal", subject: "", body: "", relatedType: "", relatedId: "" });
  const pendingOrderCount = orders.filter((order) => order.status === "pending_broker_review").length;
  const eligibleClients = clients.filter(isOrderEligibleClient);
  const pendingClientCount = clients.filter((client) => client.status === "pending_approval").length;
  const pendingCashCount = cashOperations.movements.filter((movement) => PENDING_CASH_STATUSES.includes(movement.status)).length;

  useEffect(() => {
    if (!demoTenantSwitcherEnabled) return;
    void fetch("/api/demo/tenants")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { tenants?: DemoTenantSummary[] }) => setDemoTenants(data.tenants ?? []))
      .catch(() => setDemoTenants([
        { id: "brk_abyssinia", tradingName: "Abyssinia Securities", licenseNumber: "ESCA-BR-004", primaryColor: "#0C8189", businessType: "securities_dealer", modules: fallbackModules, availableRoles },
        { id: "brk_blue_nile", tradingName: "Addis Capital", licenseNumber: "ESCA-BR-011", primaryColor: "#2277C8", businessType: "investment_bank", modules: { dealer_operations: true, investor_servicing: true, issuer_advisory: true }, availableRoles: ["broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "advisory_lead", "advisory_analyst", "management"] },
        { id: "brk_sheba", tradingName: "Sheba Advisory", licenseNumber: "PILOT-023", primaryColor: "#0E9F5B", businessType: "securities_investment_adviser", modules: { dealer_operations: false, investor_servicing: false, issuer_advisory: true }, availableRoles: ["broker_admin", "advisory_lead", "advisory_analyst", "compliance", "management"] },
      ]));
    // The demo tenant catalogue is static for the browser session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoTenantSwitcherEnabled]);

  const changeTenant = (nextTenantId: string) => {
    const next = demoTenants.find((item) => item.id === nextTenantId);
    setCurrentUserName("");
    setDemoBrokerTenantId(nextTenantId);
    setTenantId(nextTenantId);
    setDrawer(null); setQuery(""); setOrderFocus(null); setClientsFocus(null); setCrmFocus(null);
    if (next) {
      setModules(next.modules); setBusinessType(next.businessType); setAvailableRoles(next.availableRoles);
      if (!next.availableRoles.includes(role)) setRole(next.availableRoles.includes("advisory_lead") ? "advisory_lead" : next.availableRoles[0] ?? "broker_admin");
      setView(next.modules.dealer_operations ? "dashboard" : next.modules.issuer_advisory ? "advisory" : "dashboard");
      setTenantInfo({ name: next.tradingName, license: next.licenseNumber, primaryColor: next.primaryColor });
      notify(`Switched to ${next.tradingName}.`);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/orders?pageSize=100", { signal: controller.signal, headers: { "x-frank-tenant-id": tenantId } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Order API unavailable")))
      .then((result: { orders?: Array<Omit<DemoOrder, "time">> }) => {
        if (!result.orders) return;
        setOrders(hydrateOrders(result.orders));
      })
      .catch(() => {
        // Keep the static demonstration surface available before a database is connected.
      });

    return () => controller.abort();
  }, [tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cash-movements", { signal: controller.signal, headers: { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Cash API unavailable")))
      .then((result: CashOperationsData) => setCashOperations(result))
      .catch(() => setCashOperations(fallbackCashOperations));
    return () => controller.abort();
  }, [role, tenantId]);

  // Unread conversation count for the sidebar badge; the facet is cheap so the
  // list itself is not fetched here.
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/threads?pageSize=10", { signal: controller.signal, headers: { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("CRM API unavailable")))
      .then((result: CrmThreadsResponse) => setCrmUnread(result.facets.unreadThreads))
      .catch(() => setCrmUnread(fallbackCrmThreads.filter((thread) => thread.unread > 0).length));
    return () => controller.abort();
  }, [role, view, tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    const brokerHeaders = { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role };
    void Promise.all([
      fetch("/api/clients", { signal: controller.signal, headers: brokerHeaders }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/reconciliation", { signal: controller.signal, headers: brokerHeaders }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/tenant", { signal: controller.signal, headers: brokerHeaders }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/audit", { signal: controller.signal, headers: brokerHeaders }).then((response) => response.ok ? response.json() : Promise.reject()),
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
      setModules({ ...fallbackModules, ...(tenantResult.tenant?.modules ?? {}) });
      setBusinessType(tenantResult.tenant?.profile?.businessType ?? "securities_dealer");
      if (tenantResult.tenant?.availableRoles?.length) setAvailableRoles(tenantResult.tenant.availableRoles);
      if (tenantResult.tenant?.currentUser?.fullName) setCurrentUserName(tenantResult.tenant.currentUser.fullName);
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
  }, [role, tenantId]);

  const selected = orderDetails[selectedId] ?? orders.find((order) => order.id === selectedId) ?? orders[0];

  const refreshWorkItems = useCallback(() => {
    void fetch("/api/work-items", { headers: { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { items: WorkItem[] }) => setWorkItems(data.items))
      .catch(() => setWorkItems([]));
  }, [role, tenantId]);
  useEffect(() => {
    refreshWorkItems();
    const interval = window.setInterval(refreshWorkItems, 10_000);
    return () => window.clearInterval(interval);
  }, [refreshWorkItems]);

  const notify = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    if (tone === "success") refreshWorkItems();
    window.setTimeout(() => setToast(null), 3600);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  const loadOrderDetail = async (id: string) => {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { headers: { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role } });
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

  const navigateToTarget = useCallback((target: AppTarget) => {
    setDrawer(null);
    if (target.view === "orders" || target.view === "settlement") {
      const orderReference = target.view === "settlement" ? target.orderId : target.entityId;
      const order = orders.find((item) => item.id === orderReference || item.tradeId === orderReference);
      if (order) openDetail(order);
      else setView(target.view);
      return;
    }
    if (target.view === "clients") {
      setSelectedClientId(target.entityId);
      setClientsFocus({ clientId: target.entityId, tab: target.tab });
    } else if (target.view === "crm") {
      setCrmFocus({ threadId: target.entityId });
    } else if (target.view === "crm_tasks") {
      setTaskFocus(target.entityId);
    } else if (target.view === "crm_cases") {
      setCaseFocus(target.entityId);
    } else if (target.view === "cash") {
      setCashFocus(target.entityId);
    } else if (target.view === "reconciliation") {
      setReconciliationFocus(target.entityId);
    }
    setView(target.view);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Notifications are role-aware: switching the demo role reloads the feed so
  // approvers, traders, and settlement each see what they must act on.
  const notifyHeaders = { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role };
  useEffect(() => {
    const controller = new AbortController();
    // Poll only the lightweight notifications here. The client book is heavy to
    // load and rarely changes second to second, so it is fetched once on mount
    // and refreshed after each mutation via refreshOmsData rather than every 10s.
    const refreshBrokerAlerts = () => {
      void fetch("/api/notifications", { signal: controller.signal, headers: notifyHeaders })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
        .then((result: { notifications: NotificationItem[] }) => setNotifications(result.notifications))
        .catch(() => {
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
    setCurrentUserName("");
    setRole(nextRole);
    if (nextRole === "access_admin") { setView("users"); return; }
    const current = navItems.find((item) => item.id === view);
    if (current && !navVisible(current, nextRole, modules)) setView("dashboard");
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
    if (!item.entityId) return;
    if (item.entityType === "order") navigateToTarget({ view: "orders", entityType: "order", entityId: item.entityId });
    else if (item.entityType === "communication_thread") navigateToTarget({ view: "crm", entityType: "communication_thread", entityId: item.entityId });
    else if (item.entityType === "crm_task") navigateToTarget({ view: "crm_tasks", entityType: "crm_task", entityId: item.entityId });
    else if (item.entityType === "service_case") navigateToTarget({ view: "crm_cases", entityType: "service_case", entityId: item.entityId });
    else if (item.entityType === "client") navigateToTarget({ view: "clients", entityType: "client", entityId: item.entityId });
    else if (item.entityType === "cash_movement") navigateToTarget({ view: "cash", entityType: "cash_movement", entityId: item.entityId });
    else if (item.entityType === "reconciliation_exception") navigateToTarget({ view: "reconciliation", entityType: "reconciliation_exception", entityId: item.entityId });
    else if (item.entityType === "reconciliation" || item.entityType === "reconciliation_batch") navigateToTarget({ view: "reconciliation", entityType: "reconciliation_batch", entityId: item.entityId });
    else if (item.entityType === "settlement") navigateToTarget({ view: "settlement", entityType: "settlement", entityId: item.entityId });
  };

  const updateStatus = (id: string, status: OrderStatus, extra: Partial<DemoOrder> = {}) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status, ...extra } : order));
  };

  const apiRequest = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, { ...init, headers: { "x-frank-tenant-id": tenantId, ...(init?.headers as Record<string, string> | undefined) } });
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
      { label: "Platform fee schedule", passed: Boolean(controls.marketFeeScheduleConfigured && controls.feeRules.some((rule) => rule.assetClass === assetClass)), message: controls.marketFeeScheduleConfigured ? "Active Platform Admin schedule applies to this tenant and asset class" : "Publish a Platform Admin schedule and confirm tenant licence, entitlement, and module eligibility" },
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
    if (type === "order" || type === "trade") navigateToTarget({ view: "orders", entityType: type, entityId: id });
    else if (type === "cash_movement") navigateToTarget({ view: "cash", entityType: "cash_movement", entityId: id });
    else if (type === "account") navigateToTarget({ view: "clients", entityType: "account", entityId: selectedClientId });
    else if (type === "kyc" || type === "document") navigateToTarget({ view: "clients", entityType: "client", entityId: selectedClientId, tab: "documents" });
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

  const signOffReconciliation = async (evidenceReference: string) => {
    setBusyAction("signoff");
    try {
      const response = await fetch(`/api/reconciliation/${encodeURIComponent(reconBatch.id)}/sign-off`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": tenantId, "x-frank-demo-role": role },
        body: JSON.stringify({ evidenceReference }),
      });
      const result = await response.json() as { error?: string; reviewedAt?: string };
      if (!response.ok) throw new Error(result.error || "Reconciliation sign-off failed.");
      setReconBatch((current) => ({ ...current, status: "signed_off", reviewedAt: result.reviewedAt ?? new Date().toISOString(), reviewedBy: roleNames[role], evidenceReference }));
      notify("Reconciliation independently signed off and audit logged.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Reconciliation sign-off failed.", "error");
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
            // Show an item when the role can see it, or when it only owns
            // sub-nav the role can see (e.g. trader/settlement reach the CRM
            // sub-nav without the client directory).
            const items = group.items.filter((item) => navVisible(item, role, modules) || (item.children ?? []).some((child) => navVisible(child, role, modules)));
            if (!items.length) return null;
            return <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {items.map((item) => {
                const children = item.children?.filter((child) => navVisible(child, role, modules)) ?? [];
                const canOpenSelf = navVisible(item, role, modules);
                // If the role cannot open the parent's own view, its click lands
                // on the first sub-nav item it is allowed to see.
                const target = canOpenSelf ? item.id : children[0]?.id ?? item.id;
                const inSection = view === item.id || children.some((child) => child.id === view);
                return <div className="nav-item" key={item.id}>
                  <button className={view === item.id ? "active" : ""} onClick={() => { setView(target); setDrawer(null); }} title={item.label}><i><Icon name={item.icon} size={20} /></i><span>{item.label}</span>{item.id === "orders" && pendingOrderCount > 0 && <em>{pendingOrderCount}</em>}{item.id === "clients" && canOpenSelf && pendingClientCount > 0 && <em className="warn">{pendingClientCount}</em>}{item.id === "cash" && pendingCashCount > 0 && <em className="warn">{pendingCashCount}</em>}{item.id === "reconciliation" && reconBatch.exceptionRecords > 0 && <em className="warn">{reconBatch.exceptionRecords}</em>}</button>
                  {children.length > 0 && inSection && <div className="nav-subnav">
                    {children.map((child) => <button key={child.id} className={`nav-sub${view === child.id ? " active" : ""}`} onClick={() => { setView(child.id); setDrawer(null); }} title={child.label}><i><Icon name={child.icon} size={17} /></i><span>{child.label}</span>{child.id === "crm" && crmUnread > 0 && <em className="warn">{crmUnread}</em>}</button>)}
                  </div>}
                </div>;
              })}
            </div>;
          })}
        </nav>
        <div className="sidebar-foot"><div className="sidebar-user"><span className="su-avatar">{initials(roleNames[role])}</span><div><b>{roleNames[role]}</b><div className="su-role">{insecureDemoUiEnabled
          ? <BrandSelect className="bselect-bare" menuClassName="role-switcher-menu" value={role} onChange={(next) => changeRole(next as Role)} ariaLabel="Demo role" options={availableRoles.map((id) => ({ value: id, label: id === "broker_admin" && businessType !== "securities_dealer" ? "Tenant admin" : roleLabels[id] }))} />
          : <span>{roleLabels[role]}</span>}
        </div></div></div></div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><img src="/frankscore-icon.png" alt="" /><b>FrankBroker</b></div>
          <div className={`tenant-chip${demoTenantSwitcherEnabled && demoTenants.length > 0 ? " demo-tenant-chip" : ""}`} title={`${tenantInfo.name}${tenantInfo.license ? ` · ${tenantInfo.license}` : ""}`}>
            <span style={{ background: tenantInfo.primaryColor }}>{tenantInfo.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span>
            <div className="tenant-chip-copy">
              <small>{demoTenantSwitcherEnabled && demoTenants.length > 0 ? "DEMO TENANT" : "TENANT"}</small>
              {demoTenantSwitcherEnabled && demoTenants.length > 0
                ? <BrandSelect className="bselect-bare tenant-switcher" menuClassName="tenant-switcher-menu" value={tenantId} onChange={changeTenant} ariaLabel="Active demo tenant" options={demoTenants.map((item) => ({ value: item.id, label: item.tradingName }))} />
                : <b>{tenantInfo.name}</b>}
            </div>
          </div>
          <UniversalSearch role={role} onSelect={navigateToTarget} />
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
          {view === "dashboard" && (modules.dealer_operations ? <Dashboard userName={currentUserName} orders={orders} auditEntries={auditEntries} queue={workItems} settlementCycle={controls.settlementCycle} manualTradeCapture={features.manualTradeCapture} onViewOrders={() => setView("orders")} onNewOrder={openNewOrder} onSettle={() => setView("settlement")} onOpenWork={(item) => navigateToTarget(item.target)} onOpenStatus={(status) => { setOrdersStatusFocus(status); setOrderFocus(null); setQuery(""); setView("orders"); setDrawer(null); }} /> : <AdvisoryWorkspace role={role} tenantId={tenantId} mode="pipeline" onNotify={notify} />)}
          {view === "performance" && <PerformancePage orders={orders} clients={clients} period={period} setPeriod={setPeriod} onOpen={openDetail} />}
          {view === "market" && <MarketWatchPage role={role} orders={orders} onOpenOrder={openDetail} onViewOrders={(focus) => { setOrderFocus(focus); setQuery(""); setView("orders"); setDrawer(null); }} />}
          {view === "orders" && <OrdersPage orders={orders} query={query} role={role} refreshKey={orderRefreshKey} focus={orderFocus} initialStatus={ordersStatusFocus} onInitialStatusConsumed={() => setOrdersStatusFocus(null)} onClearFocus={() => setOrderFocus(null)} onOpen={openDetail} onNewOrder={openNewOrder} />}
          {view === "clients" && <ClientsPage key={`${clientsFocus?.clientId ?? ""}:${clientsFocus?.tab ?? ""}`} clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} orders={orders} instruments={instruments} role={role} focus={clientsFocus} onNewClient={openNewClient} onRefresh={refreshOmsData} onOpenOrder={openDetail} onOpenConversation={(threadId) => navigateToTarget({ view: "crm", entityType: "communication_thread", entityId: threadId })} />}
          {view === "crm" && <CrmInboxPage key={crmFocus?.threadId ?? crmFocus?.clientId ?? "inbox"} role={role} focus={crmFocus} clients={clients} onNotify={notify} onNewThread={openNewThread} onOpenRelated={openRelatedRecord} />}
          {view === "crm_tasks" && <MyTasksPage role={role} focusId={taskFocus} onNotify={notify} onOpenClient={(clientId) => navigateToTarget({ view: "clients", entityType: "client", entityId: clientId })} />}
          {view === "crm_cases" && <ComplaintsPage role={role} focusId={caseFocus} onNotify={notify} onOpenThread={(threadId) => navigateToTarget({ view: "crm", entityType: "communication_thread", entityId: threadId })} />}
          {view === "cash" && <CashOperationsPage data={cashOperations} clients={clients} role={role} busy={busyAction} focusId={cashFocus} onCreate={createCashInstruction} onAction={actOnCashInstruction} />}
          {view === "settlement" && <SettlementPage orders={orders} onOpen={openDetail} onExport={exportOrders} />}
          {view === "reconciliation" && <ReconciliationPage batch={reconBatch} busy={busyAction === "reconcile"} role={role} focusId={reconciliationFocus} onFile={processReconFile} onDownload={downloadReconTemplate} onResolve={resolveReconException} onSignOff={signOffReconciliation} resolvingId={busyAction} />}
          {view === "advisory" && <AdvisoryWorkspace role={role} tenantId={tenantId} mode="pipeline" onNotify={notify} />}
          {view === "issuers" && <AdvisoryWorkspace role={role} tenantId={tenantId} mode="issuers" onNotify={notify} />}
          {view === "reports" && <ReportsPage orders={orders} clients={clients} audit={auditEntries} role={role} onDownloaded={(name) => notify(`${name} exported.`)} onNotify={notify} />}
          {view === "audit" && <AuditPage events={auditEntries} />}
          {view === "users" && <UsersPage role={role} />}
          {view === "settings" && <SettingsPage />}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.filter((item) => navVisible(item, role, modules)).filter((item, index) => index < 5 || item.id === "market").map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i><Icon name={item.icon} size={21} /></i><span>{item.label.split(" ")[0]}</span></button>)}</nav>
      </div>

      {drawer && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className={`drawer ${drawer === "contract" ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={drawer === "new" ? "New order" : drawer === "client" ? "New client" : drawer === "crm_thread" ? "New conversation" : drawer === "trade" ? "Capture trade" : drawer === "contract" ? "Contract note" : "Order details"}>
          <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close">×</button>
          {drawer === "new" && <NewOrderForm value={newOrder} setValue={setNewOrder} clients={eligibleClients} instruments={instruments} controls={controls} checks={checks} busy={busyAction === "create"} onInstructionChange={() => setChecks(null)} onValidate={runValidation} onSubmit={submitOrder} />}
          {drawer === "client" && <NewClientForm value={newClient} setValue={setNewClient} busy={busyAction === "create_client"} onCancel={() => setDrawer(null)} onSubmit={submitClient} />}
          {drawer === "crm_thread" && <NewThreadForm value={newThread} setValue={setNewThread} clients={clients} busy={busyAction === "crm_thread"} onCancel={() => setDrawer(null)} onSubmit={submitThread} />}
          {drawer === "detail" && <OrderDetail order={selected} client={clients.find((client) => client.accountId === selected.accountId) ?? null} role={role} busy={busyAction} controls={controls} manualTradeCapture={features.manualTradeCapture} onApprove={() => actionOrder("approve")} onReject={() => actionOrder("reject")} onCancel={() => actionOrder("cancel")} onFail={() => actionOrder("fail")} onTrade={() => openTrade(selected)} onSettle={() => actionOrder("settle")} onContract={() => setDrawer("contract")} />}
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
