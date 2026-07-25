"use client";

import { useEffect, useState } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { hasPermission, type Role } from "../../../lib/frank";
import {
  BROKER_TENANT_ID,
  EmptyState,
  Icon,
  Metric,
  SectionHeader,
  StatusBadge,
  displayLabel,
  etb,
  fmt,
  type BrokerInstrument,
  type Client360Detail,
  type Client360Tab,
  type ClientDirectoryResponse,
} from "../shared/broker-foundation";

export function ClientsPage({ clients, selectedId, onSelect, orders, instruments, role, focus, onNewClient, onRefresh, onOpenOrder }: { clients: BrokerClient[]; selectedId: string; onSelect: (id: string) => void; orders: DemoOrder[]; instruments: BrokerInstrument[]; role: Role; focus: { status: string } | null; onNewClient: () => void; onRefresh: () => Promise<void>; onOpenOrder: (order: DemoOrder) => void }) {
  const [directoryRows, setDirectoryRows] = useState<BrokerClient[]>(clients);
  const [directorySelection, setDirectorySelection] = useState<BrokerClient | null>(null);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [debouncedDirectoryQuery, setDebouncedDirectoryQuery] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState<"all" | "individual" | "corporate" | "institution">("all");
  const [clientStatusFilter, setClientStatusFilter] = useState(focus?.status ?? "all");
  const [clientKycFilter, setClientKycFilter] = useState("all");
  const [clientSort, setClientSort] = useState<"name" | "newest">("name");
  // Arriving from the control queue pre-filters the directory to that status.
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryPageSize, setDirectoryPageSize] = useState(25);
  const [directoryMeta, setDirectoryMeta] = useState<ClientDirectoryResponse["pagination"]>({ page: 1, pageSize: 25, total: clients.length, pageCount: 1 });
  const [directoryFacets, setDirectoryFacets] = useState<ClientDirectoryResponse["facets"]>({
    types: {
      all: clients.length,
      individual: clients.filter((client) => client.type.toLowerCase() === "individual").length,
      corporate: clients.filter((client) => client.type.toLowerCase() === "corporate").length,
      institution: clients.filter((client) => client.type.toLowerCase() === "institution").length,
    },
    statuses: {},
  });
  const [tab, setTab] = useState<Client360Tab>("overview");
  const [detail, setDetail] = useState<Client360Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const selected = directoryRows.find((client) => client.id === selectedId)
    ?? clients.find((client) => client.id === selectedId)
    ?? (directorySelection?.id === selectedId ? directorySelection : null)
    ?? directoryRows[0]
    ?? clients[0];
  const fallbackOrders = orders.filter((order) => order.accountId === selected?.accountId);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedDirectoryQuery(directoryQuery.trim());
      setDirectoryPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [directoryQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(directoryPage),
      pageSize: String(directoryPageSize),
      sort: clientSort,
    });
    if (debouncedDirectoryQuery) params.set("query", debouncedDirectoryQuery);
    if (clientTypeFilter !== "all") params.set("type", clientTypeFilter);
    if (clientStatusFilter !== "all") params.set("status", clientStatusFilter);
    if (clientKycFilter !== "all") params.set("kyc", clientKycFilter);
    void fetch(`/api/clients/directory?${params.toString()}`, {
      headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result: ClientDirectoryResponse) => {
        setDirectoryRows(result.clients);
        setDirectoryMeta(result.pagination);
        setDirectoryFacets(result.facets);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const needle = debouncedDirectoryQuery.toLowerCase();
        const filtered = clients
          .filter((client) => clientTypeFilter === "all" || client.type.toLowerCase() === clientTypeFilter)
          .filter((client) => clientStatusFilter === "all" || client.status === clientStatusFilter)
          .filter((client) => clientKycFilter === "all" || client.kyc === clientKycFilter)
          .filter((client) => !needle || [client.name, client.code, client.accountNumber].some((value) => value.toLowerCase().includes(needle)))
          .sort((left, right) => clientSort === "newest"
            ? (right.submittedAt ?? "").localeCompare(left.submittedAt ?? "")
            : left.name.localeCompare(right.name));
        const pageCount = Math.max(1, Math.ceil(filtered.length / directoryPageSize));
        const safePage = Math.min(directoryPage, pageCount);
        const fallbackTypes = { all: clients.length, individual: 0, corporate: 0, institution: 0 };
        const fallbackStatuses: Record<string, number> = {};
        clients.forEach((client) => {
          const type = client.type.toLowerCase();
          if (type === "individual" || type === "corporate" || type === "institution") fallbackTypes[type] += 1;
          fallbackStatuses[client.status] = (fallbackStatuses[client.status] ?? 0) + 1;
        });
        setDirectoryRows(filtered.slice((safePage - 1) * directoryPageSize, safePage * directoryPageSize));
        setDirectoryMeta({ page: safePage, pageSize: directoryPageSize, total: filtered.length, pageCount });
        setDirectoryFacets({ types: fallbackTypes, statuses: fallbackStatuses });
      });
    return () => controller.abort();
  }, [clientKycFilter, clientSort, clientStatusFilter, clientTypeFilter, clients, debouncedDirectoryQuery, directoryPage, directoryPageSize, refreshKey, role]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/clients/${encodeURIComponent(selected.id)}`, {
      headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: Client360Detail) => setDetail(data))
      .catch(() => setDetail(null));
    return () => controller.abort();
  }, [selected, role, refreshKey]);

  if (!selected) return <EmptyState title="No client accounts" copy="Client records will appear here when they are created." />;

  const fallbackTrades = fallbackOrders.flatMap((order) => (order.trades ?? []).map((trade) => ({
    id: trade.id,
    orderId: order.id,
    tradeDate: trade.tradeDate,
    settlementDate: trade.settlementDate,
    instrumentId: order.instrumentId,
    symbol: order.symbol,
    side: order.side,
    quantity: trade.quantity,
    executionPrice: trade.executionPrice,
    gross: trade.gross,
    fees: trade.fees,
    net: trade.net,
    settlementStatus: trade.settlementStatus,
    cashStatus: trade.cashStatus,
    securitiesStatus: trade.securitiesStatus,
    exceptionNotes: null,
    contractNoteNumber: order.contractNoteNumber ?? null,
    contractNoteGeneratedAt: order.contractNoteGeneratedAt ?? null,
    capturedBy: trade.capturedBy,
  })));
  const fallbackReady = selected.kyc === "approved" && selected.status === "active" && Boolean(selected.termsAcceptedVersion);
  const model: Client360Detail = detail ?? {
    client: {
      id: selected.id,
      code: selected.code,
      name: selected.name,
      type: selected.type,
      phone: null,
      email: null,
      broker: "Abyssinia Securities",
      branch: null,
      openedAt: "2026-07-14T08:00:00Z",
      lastActivityAt: fallbackOrders[0]?.createdAt ?? null,
      kycStatus: selected.kyc,
      clientStatus: selected.status,
      accountStatus: selected.status,
      tradingStatus: fallbackReady ? "ready" : "not_ready",
      csdReference: null,
      riskRating: selected.risk,
      createdBy: selected.createdBy ?? null,
      submittedAt: selected.submittedAt ?? null,
      approvedBy: selected.approvedBy ?? null,
      approvedAt: selected.approvedAt ?? null,
      rejectionReason: selected.rejectionReason ?? null,
    },
    readiness: {
      canTrade: fallbackReady,
      blockingReasons: fallbackReady ? [] : ["Connect the database to load the full readiness record"],
      items: [
        { key: "kyc", label: "KYC approved", state: selected.kyc === "approved" ? "pass" : "fail", detail: displayLabel(selected.kyc) },
        { key: "documents", label: "Required documents uploaded", state: selected.proofOfAddressStatus === "received" ? "pass" : "warning", detail: selected.proofOfAddressStatus ?? "Demo evidence unavailable" },
        { key: "consent", label: "Required legal documents accepted", state: selected.termsAcceptedVersion ? "pass" : "fail", detail: selected.termsAcceptedVersion ? `Accepted ${selected.termsAcceptedVersion}` : "Consent required" },
        { key: "account", label: "Account active", state: selected.status === "active" ? "pass" : "fail", detail: displayLabel(selected.status) },
        { key: "cash", label: "Cash available", state: selected.availableCash > 0 ? "pass" : "warning", detail: etb(selected.availableCash) },
        { key: "restriction", label: "No account restriction", state: selected.restrictionReason ? "fail" : "pass", detail: selected.restrictionReason ?? "No active restriction" },
        { key: "buy", label: "Can place buy order", state: fallbackReady && selected.availableCash > 0 ? "pass" : "fail", detail: "Subject to pre-trade validation" },
        { key: "sell", label: "Can place sell order", state: fallbackReady && selected.holdings.some((holding) => holding.available > 0) ? "pass" : "warning", detail: "Subject to available holdings" },
      ],
    },
    cash: { total: selected.totalCash, available: selected.availableCash, blocked: selected.blockedCash, unsettled: 0, pendingDeposits: 0, pendingWithdrawals: 0, currency: "ETB" },
    holdings: selected.holdings.map((holding) => ({ id: `${selected.id}-${holding.symbol}`, instrumentId: instruments.find((item) => item.symbol === holding.symbol)?.id ?? "", symbol: holding.symbol, name: holding.name, assetClass: instruments.find((item) => item.symbol === holding.symbol)?.asset ?? "security", total: holding.total, available: holding.available, blocked: holding.blocked, unsettled: 0, averageCost: holding.averageCost, lastPrice: instruments.find((item) => item.symbol === holding.symbol)?.price ?? 0, marketValue: holding.total * (instruments.find((item) => item.symbol === holding.symbol)?.price ?? 0), updatedAt: "2026-07-14T12:00:00Z" })),
    orders: fallbackOrders.map((order) => ({ id: order.id, createdAt: order.createdAt, instrumentId: order.instrumentId, symbol: order.symbol, side: order.side, quantity: order.quantity, price: order.price, filledQuantity: order.filledQuantity ?? 0, remainingQuantity: order.remainingQuantity ?? order.quantity, status: order.status, source: order.source, trader: order.trader, actionRequired: order.status === "pending_broker_review" ? "Broker review" : null, availableActions: order.availableActions ?? [] })),
    trades: fallbackTrades,
    transactions: selected.ledger.map((entry) => ({ id: entry.id, ledger: "cash", createdAt: `${entry.valueDate}T12:00:00Z`, type: entry.type, instrument: null, debit: entry.amount < 0 ? Math.abs(entry.amount) : 0, credit: entry.amount > 0 ? entry.amount : 0, amount: Math.abs(entry.amount), quantity: null, availableImpact: entry.amount, blockedImpact: 0, unsettledImpact: 0, runningBalance: entry.runningBalance, reference: entry.reference, orderId: null, tradeId: null, status: "posted", createdBy: "System", notes: "Demo ledger record" })),
    settlements: fallbackTrades.map((trade) => ({ id: `STL-${trade.id}`, tradeId: trade.id, orderId: trade.orderId, symbol: trade.symbol, tradeDate: trade.tradeDate, settlementDate: trade.settlementDate, cashStatus: trade.cashStatus, securitiesStatus: trade.securitiesStatus, status: trade.settlementStatus, exception: false, notes: null })),
    legal: { required: true, accepted: Boolean(selected.termsAcceptedVersion), latestRequiredVersion: "1.0", latestAcceptedVersion: selected.termsAcceptedVersion ?? null, lastAcceptedAt: null, missingDocuments: selected.termsAcceptedVersion ? [] : ["Brokerage account terms"] },
    restrictions: { restricted: Boolean(selected.restrictionReason || selected.status !== "active"), reason: selected.restrictionReason ?? null, restrictedAt: null, flags: selected.kyc !== "approved" ? ["Missing or incomplete KYC"] : selected.termsAcceptedVersion ? [] : ["Missing current legal consent"] },
    documents: { expected: selected.type === "individual" ? ["proof_of_address"] : ["business_license", "tin_certificate", "certificate_of_incorporation", "article_of_association"], kyc: [], legal: [], contractNotes: fallbackOrders.filter((order) => order.trades?.length).map((order) => ({ orderId: order.id, number: order.contractNoteNumber ?? null, generatedAt: order.contractNoteGeneratedAt ?? null, status: order.contractNoteNumber ? "available" : "not_generated" })), statements: [{ type: "Account statement", status: "not_implemented" }, { type: "Cash statement", status: "not_implemented" }, { type: "Holdings statement", status: "not_implemented" }] },
    linkedBanks: [],
    requests: selected.serviceRequests ?? [],
    notes: [],
    auditTrail: [],
  };

  const openOrder = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (order) onOpenOrder(order);
  };
  const canAdjust = hasPermission(role, "adjust");
  const act = async (action: "approve_client" | "reject_client" | "restrict" | "restore" | "resolve_request" | "approve_closure" | "reject_request" | "add_note", requestId?: string) => {
    if (action === "approve_client") {
      const outstandingDocuments = (model.documents.expected ?? []).filter((type) => !model.documents.kyc.some((document) => document.type === type));
      const pendingBanks = (model.linkedBanks ?? []).filter((bank) => bank.status !== "approved");
      if ((outstandingDocuments.length || pendingBanks.length) && !window.confirm(`Approve this client with ${outstandingDocuments.length} document item(s) not received and ${pendingBanks.length} bank account(s) not approved?`)) return;
    }
    const key = requestId ?? action;
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(selected.id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify({
          action,
          requestId,
          noteText: action === "add_note" ? noteText : undefined,
          category: action === "add_note" ? noteCategory : undefined,
          reason: action === "restrict" ? "Restricted pending compliance review" : action === "reject_client" ? "Client onboarding rejected after compliance review" : undefined,
          resolutionNotes: action === "reject_request" ? "Request rejected after broker review." : "Reviewed and resolved by broker operations.",
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Client action failed.");
      if (action === "add_note") setNoteText("");
      setRefreshKey((current) => current + 1);
      await onRefresh();
      setMessage(action === "add_note" ? "Internal note added and audit logged." : action === "approve_client" ? "Client approved and activated. The account is now eligible for New Order." : action === "reject_client" ? "Client onboarding rejected and retained in the audit trail." : "Control action recorded in the client audit trail.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Client action failed.");
    } finally {
      setBusy(null);
    }
  };
  const reviewEvidence = async (kind: "documents" | "bank-accounts", id: string, action: "approve" | "reject") => {
    const reason = action === "reject" ? window.prompt("Why was this not approved?")?.trim() ?? "" : "";
    if (action === "reject" && reason.length < 5) return setMessage("Enter a clear reason before rejecting this item.");
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(selected.id)}/${kind}/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify({ action, reason }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Review action failed.");
      setRefreshKey((current) => current + 1);
      await onRefresh();
      setMessage(action === "approve" ? "Item approved." : "Item not approved. The reason was recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setBusy(null);
    }
  };
  const tabs: Array<{ id: Client360Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "assets", label: "Cash & holdings" },
    { id: "orders", label: "Orders", count: model.orders.length },
    { id: "trades", label: "Trades", count: model.trades.length },
    { id: "transactions", label: "Transactions", count: model.transactions.length },
    { id: "settlements", label: "Settlements", count: model.settlements.filter((item) => item.status !== "settled").length },
    { id: "documents", label: "Documents" },
    { id: "notes", label: "Notes", count: model.notes.length },
    { id: "audit", label: "Audit trail", count: model.auditTrail.length },
  ];

  return <>
    <SectionHeader eyebrow="CLIENT DIRECTORY" title="Clients & accounts" copy="Search and segment the full client book, then open a controlled Client 360 workspace." action={<><span className="demo-control-badge">{directoryMeta.total.toLocaleString("en-US")} CLIENTS</span>{hasPermission(role, "create") && <button className="btn primary" onClick={onNewClient}>＋ Add client</button>}</>} />
    <section className="panel client-directory">
      <div className="client-directory-tabs" role="tablist" aria-label="Client type">
        {([
          ["all", "All clients"],
          ["individual", "Individual"],
          ["corporate", "Corporate"],
          ["institution", "Institutional"],
        ] as const).map(([id, label]) => <button role="tab" aria-selected={clientTypeFilter === id} className={clientTypeFilter === id ? "active" : ""} key={id} onClick={() => { setClientTypeFilter(id); setDirectoryPage(1); }}>{label}<b>{directoryFacets.types[id]}</b></button>)}
      </div>
      <div className="client-directory-controls">
        <label className="client-directory-search"><Icon name="search" size={16} /><input aria-label="Search client directory" placeholder="Search name, client code, or account…" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} /></label>
        <label>Status<select value={clientStatusFilter} onChange={(event) => { setClientStatusFilter(event.target.value); setDirectoryPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="pending_approval">Pending approval</option><option value="restricted">Restricted</option><option value="rejected">Rejected</option></select></label>
        <label>KYC<select value={clientKycFilter} onChange={(event) => { setClientKycFilter(event.target.value); setDirectoryPage(1); }}><option value="all">All KYC states</option><option value="approved">Approved</option><option value="pending_review">Pending review</option><option value="review_due">Review due</option><option value="rejected">Rejected</option></select></label>
        <label>Sort<select value={clientSort} onChange={(event) => { setClientSort(event.target.value as "name" | "newest"); setDirectoryPage(1); }}><option value="name">Name A–Z</option><option value="newest">Newest first</option></select></label>
      </div>
      <div className="client-directory-summary"><span>{directoryMeta.total.toLocaleString("en-US")} matching clients</span><span>Active <b>{directoryFacets.statuses.active ?? 0}</b></span><span>Pending approval <b>{directoryFacets.statuses.pending_approval ?? 0}</b></span><span>Restricted <b>{directoryFacets.statuses.restricted ?? 0}</b></span></div>
      {directoryRows.length ? <div className="table-scroll"><table className="client-directory-table"><thead><tr><th>Client</th><th>Category</th><th>Trading account</th><th>KYC</th><th>Account status</th><th className="num">Available cash</th><th className="num">Holdings</th><th className="num">Orders</th><th /></tr></thead><tbody>{directoryRows.map((client) => <tr className={client.id === selected.id ? "selected" : ""} key={client.id} onClick={() => { setDirectorySelection(client); onSelect(client.id); setTab("overview"); setMessage(""); setDetail(null); }}><td><span className="directory-client-cell"><i>{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><span><b>{client.name}</b><small>{client.code}</small></span></span></td><td><span className={`client-type-badge type-${client.type.toLowerCase()}`}>{displayLabel(client.type)}</span></td><td><b>{client.accountNumber}</b><small>{client.accountId ? "Cash brokerage account" : "No account"}</small></td><td><span className={`directory-state ${client.kyc === "approved" ? "ready" : client.kyc === "rejected" ? "blocked" : "review"}`}><i />{displayLabel(client.kyc)}</span></td><td><span className={`directory-state ${client.status === "active" ? "ready" : client.status === "rejected" ? "blocked" : "review"}`}><i />{displayLabel(client.status)}</span></td><td className="num"><b>{etb(client.availableCash)}</b><small>{client.blockedCash ? `${etb(client.blockedCash)} blocked` : "No cash blocked"}</small></td><td className="num"><b>{client.holdingCount ?? client.holdings.length}</b></td><td className="num"><b>{client.orderCount}</b></td><td><button className="directory-open" onClick={(event) => { event.stopPropagation(); setDirectorySelection(client); onSelect(client.id); setTab("overview"); setMessage(""); setDetail(null); }}>Open →</button></td></tr>)}</tbody></table></div> : <EmptyState title="No clients match these filters" copy="Try a different category, status, KYC state, or search term." />}
      <footer className="client-directory-pagination"><label>Rows<select value={directoryPageSize} onChange={(event) => { setDirectoryPageSize(Number(event.target.value)); setDirectoryPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span>Page {directoryMeta.page} of {directoryMeta.pageCount}</span><div><button disabled={directoryMeta.page <= 1} onClick={() => setDirectoryPage((page) => Math.max(1, page - 1))}>Previous</button><button disabled={directoryMeta.page >= directoryMeta.pageCount} onClick={() => setDirectoryPage((page) => Math.min(directoryMeta.pageCount, page + 1))}>Next</button></div></footer>
    </section>
    <div className="client-workspace-label"><span>CLIENT 360 WORKSPACE</span><b>{selected.name}</b><small>{selected.code} · {displayLabel(selected.type)}</small></div>
    <section className="panel client-360-hero">
      <div className="client-360-identity"><span>{model.client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><small>{displayLabel(model.client.type)} · {model.client.code}</small><h2>{model.client.name}</h2><p>{model.client.phone ?? "Phone not recorded"} · {model.client.email ?? "Email not recorded"}</p></div></div>
      <div className="client-360-statuses"><span className={`status ${model.readiness.canTrade ? "status-success" : "status-danger"}`}><i />{model.readiness.canTrade ? "Trade ready" : "Not trade ready"}</span><span className={`status ${model.client.kycStatus === "approved" ? "status-success" : "status-warning"}`}><i />KYC {displayLabel(model.client.kycStatus)}</span><span className={`status ${model.client.accountStatus === "active" ? "status-success" : "status-warning"}`}><i />{displayLabel(model.client.accountStatus)}</span></div>
      <div className="client-360-meta"><span><small>Account</small><b>{selected.accountNumber}</b></span><span><small>CSD reference</small><b>{model.client.csdReference ?? "Not recorded"}</b></span><span><small>Broker / branch</small><b>{model.client.broker}{model.client.branch ? ` · ${model.client.branch}` : ""}</b></span><span><small>Opened</small><b>{new Date(model.client.openedAt).toLocaleDateString("en-GB")}</b></span><span><small>Last activity</small><b>{model.client.lastActivityAt ? new Date(model.client.lastActivityAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "No activity"}</b></span></div>
      <div className="client-360-hero-actions">{model.client.clientStatus === "pending_approval" ? <>{hasPermission(role, "reject") && <button className="btn danger small" disabled={Boolean(busy)} onClick={() => void act("reject_client")}>Reject onboarding</button>}{hasPermission(role, "approve") && <button className="btn primary small" disabled={Boolean(busy)} onClick={() => void act("approve_client")}>{busy === "approve_client" ? "Approving…" : "Approve client"}</button>}</> : canAdjust && (model.restrictions.restricted ? <button className="btn secondary small" disabled={busy === "restore"} onClick={() => void act("restore")}>Restore account</button> : <button className="btn secondary small" disabled={busy === "restrict"} onClick={() => void act("restrict")}>Restrict account</button>)}</div>
    </section>
    <nav className="client-360-tabs" aria-label="Client 360 sections">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</nav>
    {message && <p className="control-message client-360-message">{message}</p>}

    {tab === "overview" && <div className="client-360-grid">
      <section className="panel onboarding-record"><div className="panel-head"><div><span className="eyebrow">ONBOARDING RECORD</span><h2>Submitted client details</h2></div><span className="account-number">{displayLabel(model.client.onboardingChannel ?? "in_person")}</span></div><dl><div><dt>Email</dt><dd>{model.client.email ?? "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{model.client.phone ?? "Not recorded"}</dd></div><div><dt>Fayda FIN</dt><dd>{model.client.identityMasked ?? "Not recorded"}</dd></div><div><dt>TIN</dt><dd>{model.client.taxIdMasked ?? "Not recorded"}</dd></div>{model.client.type !== "individual" && <><div><dt>Registered address</dt><dd>{model.client.address ?? "Not recorded"}</dd></div><div><dt>Registration number</dt><dd>{model.client.businessRegistrationNumber ?? "Not recorded"}</dd></div><div><dt>Authorized representative</dt><dd>{model.client.authorizedRepresentativeName ?? "Not recorded"}</dd></div><div><dt>Signatory authority</dt><dd>{model.client.signatoryAuthorityConfirmed ? "Confirmed" : "Not confirmed"}</dd></div></>}</dl></section>
      <section className="panel readiness-panel"><div className="panel-head"><div><span className="eyebrow">TRADING READINESS</span><h2>{model.readiness.canTrade ? "Client can trade" : "Action required"}</h2></div><span className={`readiness-score ${model.readiness.canTrade ? "ready" : "blocked"}`}>{model.readiness.items.filter((item) => item.state === "pass").length}/{model.readiness.items.length}</span></div>{!model.readiness.canTrade && model.readiness.blockingReasons.length > 0 && <div className="readiness-callout"><b>Trading is blocked</b><span>{model.readiness.blockingReasons.join(" · ")}</span></div>}<div className="readiness-list">{model.readiness.items.map((item) => <div key={item.key}><i className={item.state}>{item.state === "pass" ? "✓" : item.state === "fail" ? "!" : "—"}</i><span><b>{item.label}</b><small>{item.detail}</small></span></div>)}</div></section>
      <section className="panel overview-cash"><div className="panel-head"><div><span className="eyebrow">CASH POSITION</span><h2>Available to trade</h2></div><button onClick={() => setTab("assets")}>View ledger →</button></div><strong>{etb(model.cash?.available ?? 0)}</strong><div><span><small>Total cash</small><b>{etb(model.cash?.total ?? 0)}</b></span><span><small>Blocked</small><b>{etb(model.cash?.blocked ?? 0)}</b></span><span><small>Unsettled</small><b>{etb(model.cash?.unsettled ?? 0)}</b></span></div></section>
      <section className="panel legal-status-card"><div className="panel-head"><div><span className="eyebrow">LEGAL & DOCUMENTS</span><h2>Consent status</h2></div><span className={`status ${model.legal.accepted ? "status-success" : "status-warning"}`}><i />{model.legal.accepted ? "Accepted" : "Consent required"}</span></div><div className="legal-status-body"><span><small>Required version</small><b>{model.legal.latestRequiredVersion ?? "None configured"}</b></span><span><small>Accepted version</small><b>{model.legal.latestAcceptedVersion ?? "Not accepted"}</b></span><span><small>Last accepted</small><b>{model.legal.lastAcceptedAt ? new Date(model.legal.lastAcceptedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</b></span></div>{model.legal.missingDocuments.length > 0 && <div className="missing-docs"><small>MISSING / ACTION REQUIRED</small>{model.legal.missingDocuments.map((item) => <span key={item}>{item}</span>)}</div>}</section>
      <section className="panel flags-card"><div className="panel-head"><div><span className="eyebrow">RESTRICTIONS & FLAGS</span><h2>Control indicators</h2></div></div>{model.restrictions.flags.length || model.restrictions.restricted ? <div className="flag-list">{model.restrictions.restricted && <div className="serious"><i>!</i><span><b>Account restricted</b><small>{model.restrictions.reason ?? "Reason not recorded"}</small></span></div>}{model.restrictions.flags.map((flag) => <div key={flag}><i>◇</i><span><b>{flag}</b><small>Review the relevant client record before activity.</small></span></div>)}</div> : <EmptyState title="No active flags" copy="No client, KYC, consent, or account restriction is currently blocking activity." />}</section>
      <section className="panel request-panel client-360-requests"><div className="panel-head"><div><span className="eyebrow">CLIENT INSTRUCTIONS</span><h2>Requests and discrepancies</h2></div><span className="exception-count">{model.requests.filter((item) => ["open", "under_review"].includes(item.status)).length} open</span></div>{model.requests.length ? model.requests.map((item) => { const open = ["open", "under_review"].includes(item.status); return <div className="client-request-row" key={item.id}><span><b>{item.subject}</b><small>{item.description}</small>{item.orderId && <em>{item.orderId}</em>}</span><strong>{displayLabel(item.status)}</strong>{open && canAdjust && <div>{item.requestType === "account_closure" && <button className="btn primary small" disabled={busy === item.id} onClick={() => void act("approve_closure", item.id)}>Approve closure</button>}<button className="btn secondary small" disabled={busy === item.id} onClick={() => void act("resolve_request", item.id)}>Resolve</button><button className="btn secondary small" disabled={busy === item.id} onClick={() => void act("reject_request", item.id)}>Reject</button></div>}</div>; }) : <EmptyState title="No client requests" copy="Investor discrepancies, corrections, and closure requests will appear here." />}</section>
    </div>}

    {tab === "assets" && <div className="client-360-stack"><section className="client-cash-metrics"><Metric label="Total cash" value={etb(model.cash?.total ?? 0)} note="Ledger-backed balance" /><Metric label="Available cash" value={etb(model.cash?.available ?? 0)} note="Available for validated orders" tone="success" /><Metric label="Blocked cash" value={etb(model.cash?.blocked ?? 0)} note="Reserved against open buy orders" tone="warning" /><Metric label="Unsettled cash" value={etb(model.cash?.unsettled ?? 0)} note="Pending settlement" tone="purple" /></section><section className="panel holdings-panel"><div className="panel-head"><div><span className="eyebrow">SECURITIES POSITION</span><h2>Holdings and availability</h2></div></div>{model.holdings.length ? <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Asset class</th><th className="num">Total</th><th className="num">Available</th><th className="num">Blocked</th><th className="num">Unsettled</th><th className="num">Average cost</th><th className="num">Market value</th><th>Updated</th></tr></thead><tbody>{model.holdings.map((holding) => <tr key={holding.id}><td><b>{holding.symbol}</b><small>{holding.name}</small></td><td>{displayLabel(holding.assetClass)}</td><td className="num"><b>{fmt.format(holding.total)}</b></td><td className="num positive">{fmt.format(holding.available)}</td><td className={`num ${holding.blocked > 0 ? "negative" : ""}`}>{fmt.format(holding.blocked)}</td><td className="num">{fmt.format(holding.unsettled)}</td><td className="num">{fmt.format(holding.averageCost)} ETB</td><td className="num"><b>{etb(holding.marketValue)}</b></td><td>{new Date(holding.updatedAt).toLocaleDateString("en-GB")}</td></tr>)}</tbody></table></div> : <EmptyState title="No holdings yet" copy="This client has no securities position. Available, blocked, and unsettled quantities will appear after custody activity." />}</section></div>}

    {tab === "orders" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">ORDER WORKFLOW</span><h2>Open and recent orders</h2></div></div>{model.orders.length ? <div className="table-scroll"><table><thead><tr><th>Order / time</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Price</th><th className="num">Filled</th><th className="num">Remaining</th><th>Status</th><th>Source / trader</th><th>Action required</th><th /></tr></thead><tbody>{model.orders.map((order) => <tr key={order.id} onClick={() => openOrder(order.id)}><td><b>{order.id}</b><small>{new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td><td><b>{order.symbol}</b></td><td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td><td className="num">{fmt.format(order.quantity)}</td><td className="num">{fmt.format(order.price)}</td><td className="num">{fmt.format(order.filledQuantity)}</td><td className="num"><b>{fmt.format(order.remainingQuantity)}</b></td><td><StatusBadge status={order.status} /></td><td><b>{displayLabel(order.source)}</b><small>{order.trader}</small></td><td>{order.actionRequired ?? "None"}</td><td><button className="btn secondary small" onClick={(event) => { event.stopPropagation(); openOrder(order.id); }}>Open workflow</button></td></tr>)}</tbody></table></div> : <EmptyState title="No open or recent orders" copy="Client instructions will appear here after they are created through the controlled order workflow." />}</section>}

    {tab === "trades" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">EXECUTION HISTORY</span><h2>Captured trades</h2></div></div>{model.trades.length ? <div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Dates</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Execution price</th><th className="num">Gross</th><th className="num">Fees</th><th className="num">Net</th><th>Settlement</th><th>Contract note</th></tr></thead><tbody>{model.trades.map((trade) => <tr key={trade.id} onClick={() => openOrder(trade.orderId)}><td><b>{trade.id}</b><small>{trade.orderId}</small></td><td><b>{trade.tradeDate}</b><small>Settle {trade.settlementDate}</small></td><td><b>{trade.symbol}</b></td><td><span className={`side side-${trade.side}`}>{trade.side.toUpperCase()}</span></td><td className="num">{fmt.format(trade.quantity)}</td><td className="num">{fmt.format(trade.executionPrice)}</td><td className="num">{etb(trade.gross)}</td><td className="num">{etb(trade.fees)}</td><td className="num"><b>{etb(trade.net)}</b></td><td>{displayLabel(trade.settlementStatus)}</td><td>{trade.contractNoteNumber ? <button className="btn secondary small" onClick={() => openOrder(trade.orderId)}>{trade.contractNoteNumber}</button> : <span className="muted-label">Not generated</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No trades executed" copy="Full and partial fills captured through the trade service will appear here." />}</section>}

    {tab === "transactions" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">AUDITABLE LEDGERS</span><h2>Transaction history</h2></div><span className="account-number">Cash + securities</span></div>{model.transactions.length ? <div className="table-scroll"><table><thead><tr><th>Date / type</th><th>Ledger</th><th>Instrument</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Quantity</th><th className="num">Available Δ</th><th className="num">Blocked Δ</th><th className="num">Running balance</th><th>Reference</th><th>Created by / reason</th></tr></thead><tbody>{model.transactions.map((entry) => <tr key={entry.id}><td><b>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><small>{displayLabel(entry.type)}</small></td><td>{displayLabel(entry.ledger)}</td><td>{entry.instrument ?? "—"}</td><td className="num negative">{entry.debit ? fmt.format(entry.debit) : "—"}</td><td className="num positive">{entry.credit ? fmt.format(entry.credit) : "—"}</td><td className="num">{entry.quantity !== null ? fmt.format(entry.quantity) : "—"}</td><td className="num">{fmt.format(entry.availableImpact)}</td><td className="num">{fmt.format(entry.blockedImpact)}</td><td className="num"><b>{fmt.format(entry.runningBalance)}</b></td><td><b>{entry.reference}</b><small>{entry.status}</small></td><td><b>{entry.createdBy}</b><small>{entry.notes}</small></td></tr>)}</tbody></table></div> : <EmptyState title="No transactions yet" copy="Cash and securities ledger events will be combined here without overwriting authoritative balances." />}</section>}

    {tab === "settlements" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">POST-TRADE CONTROL</span><h2>Settlement items</h2></div></div>{model.settlements.length ? <div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Instrument</th><th>Trade date</th><th>Settlement date</th><th>Cash</th><th>Securities</th><th>Overall</th><th>Exception / notes</th><th /></tr></thead><tbody>{model.settlements.map((item) => <tr key={item.id} onClick={() => openOrder(item.orderId)}><td><b>{item.tradeId}</b><small>{item.orderId}</small></td><td><b>{item.symbol}</b></td><td>{item.tradeDate}</td><td><b>{item.settlementDate}</b></td><td><span className={`leg ${item.cashStatus === "settled" ? "done" : "pending"}`}>{displayLabel(item.cashStatus)}</span></td><td><span className={`leg ${item.securitiesStatus === "settled" ? "done" : "pending"}`}>{displayLabel(item.securitiesStatus)}</span></td><td>{displayLabel(item.status)}</td><td>{item.exception ? <span className="negative">{item.notes ?? "Exception requires review"}</span> : "None"}</td><td><button className="btn secondary small" onClick={(event) => { event.stopPropagation(); openOrder(item.orderId); }}>View settlement</button></td></tr>)}</tbody></table></div> : <EmptyState title="No settlement items" copy="Settlement records will appear after an execution is captured." />}</section>}

    {tab === "documents" && <div className="documents-grid">
      <section className="panel document-card onboarding-documents"><div className="panel-head"><div><span className="eyebrow">ONBOARDING DOCUMENTS</span><h2>Identity and authority</h2></div><span className="account-number">{model.documents.kyc.length} received</span></div>
        {(model.documents.expected ?? []).map((type) => {
          const document = model.documents.kyc.find((item) => item.type === type);
          return <div className="document-review-row" key={type}><span><b>{displayLabel(type)}</b><small>{document ? `${document.name}${document.sizeBytes ? ` · ${(document.sizeBytes / 1024).toFixed(0)} KB` : ""}${document.uploadedAt ? ` · ${new Date(document.uploadedAt).toLocaleDateString("en-GB")}` : ""}` : "Not received"}</small>{document?.rejectionReason && <em>{document.rejectionReason}</em>}</span><strong data-status={document?.status ?? "not_received"}>{document ? displayLabel(document.status) : "Not received"}</strong>{document && <div>{document.hasFile && <a className="btn secondary small" href={`/api/clients/${encodeURIComponent(selected.id)}/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Open</a>}{hasPermission(role, "approve") && document.status !== "approved" && <button className="btn primary small" disabled={busy === document.id} onClick={() => void reviewEvidence("documents", document.id, "approve")}>Approve</button>}{hasPermission(role, "reject") && document.status !== "rejected" && <button className="btn danger small" disabled={busy === document.id} onClick={() => void reviewEvidence("documents", document.id, "reject")}>Not approve</button>}</div>}</div>;
        })}
      </section>
      <section className="panel document-card linked-bank-review"><div className="panel-head"><div><span className="eyebrow">LINKED BANKS</span><h2>Withdrawal destinations</h2></div><span className="account-number">{model.linkedBanks?.length ?? 0} of 3</span></div>{model.linkedBanks?.length ? model.linkedBanks.map((bank) => <div className="document-review-row" key={bank.id}><span><b>{bank.bankName}</b><small>{bank.accountNumberMasked} · {bank.accountHolderName}</small>{bank.rejectionReason && <em>{bank.rejectionReason}</em>}</span><strong data-status={bank.status}>{displayLabel(bank.status)}</strong><div>{hasPermission(role, "approve") && bank.status !== "approved" && <button className="btn primary small" disabled={busy === bank.id} onClick={() => void reviewEvidence("bank-accounts", bank.id, "approve")}>Approve</button>}{hasPermission(role, "reject") && bank.status !== "rejected" && <button className="btn danger small" disabled={busy === bank.id} onClick={() => void reviewEvidence("bank-accounts", bank.id, "reject")}>Not approve</button>}</div></div>) : <EmptyState title="No linked banks" copy="Linked bank accounts will appear here when the client submits them." />}</section>
      <section className="panel document-card"><div className="panel-head"><div><span className="eyebrow">LEGAL ACCEPTANCE</span><h2>Accepted agreements</h2></div></div>{model.documents.legal.length ? model.documents.legal.map((document) => <div className="document-row" key={document.id}><span><b>{document.name}</b><small>Version {document.version} · {new Date(document.acceptedAt).toLocaleDateString("en-GB")}</small></span><strong>{displayLabel(document.status)}</strong></div>) : <EmptyState title="No legal acceptance" copy="The current brokerage terms have not been accepted by this client." />}</section>
      <section className="panel document-card"><div className="panel-head"><div><span className="eyebrow">CONTRACT NOTES</span><h2>Trade documents</h2></div></div>{model.documents.contractNotes.length ? model.documents.contractNotes.map((document) => <button className="document-row" key={document.orderId} onClick={() => openOrder(document.orderId)}><span><b>{document.number ?? `Contract note for ${document.orderId}`}</b><small>{document.generatedAt ? new Date(document.generatedAt).toLocaleString("en-GB") : "Generation required"}</small></span><strong>{displayLabel(document.status)}</strong></button>) : <EmptyState title="No contract notes" copy="Contract notes become available after trade capture and controlled generation." />}</section>
    </div>}

    {tab === "notes" && <div className="notes-layout"><section className="panel note-composer"><div className="panel-head"><div><span className="eyebrow">INTERNAL ONLY</span><h2>Add broker note</h2></div></div>{canAdjust ? <div className="note-form"><label>Category<select value={noteCategory} onChange={(event) => setNoteCategory(event.target.value)}>{["general", "compliance", "support", "trading", "settlement"].map((category) => <option key={category} value={category}>{displayLabel(category)}</option>)}</select></label><label>Note<textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Record a concise operational fact, decision, or follow-up…" rows={5} /></label><small>Internal notes are visible only to broker staff and are permanently audit logged.</small><button className="btn primary" disabled={busy === "add_note" || noteText.trim().length < 3} onClick={() => void act("add_note")}>{busy === "add_note" ? "Adding note…" : "Add internal note"}</button></div> : <div className="permission-note">Read-only role: internal notes can be viewed but not created.</div>}</section><section className="panel notes-list"><div className="panel-head"><div><span className="eyebrow">BROKER RECORD</span><h2>Internal notes</h2></div></div>{model.notes.length ? model.notes.map((note) => <article key={note.id}><span>{displayLabel(note.category)}</span><p>{note.text}</p><footer><b>{note.createdBy}</b><time>{new Date(note.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time><em>{displayLabel(note.visibility)}</em></footer></article>) : <EmptyState title="No internal notes" copy="Authorized broker users can record general, compliance, support, trading, or settlement notes." />}</section></div>}

    {tab === "audit" && <section className="panel client-audit"><div className="panel-head"><div><span className="eyebrow">CLIENT CONTROL RECORD</span><h2>Audit trail</h2></div></div>{model.auditTrail.length ? model.auditTrail.map((entry) => <div key={entry.id}><i /><time>{new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<b>{new Date(entry.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b></time><span><small>{entry.user} · {displayLabel(entry.entityType)} {entry.entityId ?? ""}</small><h3>{displayLabel(entry.action)}</h3><p>{entry.reason}</p>{(entry.oldValue || entry.newValue) && <details><summary>Recorded change</summary><pre>{entry.oldValue ? `Before: ${entry.oldValue}\n` : ""}{entry.newValue ? `After: ${entry.newValue}` : ""}</pre></details>}</span></div>) : <EmptyState title="No client audit events" copy="Sensitive client, order, trade, ledger, settlement, consent, restriction, and note events will appear here." />}</section>}
  </>;
}
