"use client";

import { useEffect, useState } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { COMPLIANCE_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { ClientConversationsTab } from "../crm/client-conversations-tab";
import { ActivityTimeline } from "../crm/activity-timeline";
import { BrandSelect } from "../../shared/brand-select";
import { RelationshipOfficerCard } from "../crm/relationship-officer-card";
import { TaskCard } from "../crm/my-tasks-screen";
import { isTaskClosed } from "../../../lib/crm/tasks";
import { addisBusinessDate } from "../../../lib/addis-date";
import {
  evaluateRestorationControls,
  inferRestrictionCategory,
  restrictionCategoryLabels,
  restrictionResolutionGuidance,
} from "../../../lib/restriction-resolution";
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

function currentQuarterDates() {
  const [year, month] = addisBusinessDate().split("-").map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3;
  const from = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10);
  return { from, to };
}

function TradingMandatePanel({ clientId, mandate, canAdjust, role, onSaved }: { clientId: string; mandate: NonNullable<Client360Detail["tradingMandate"]> | undefined; canAdjust: boolean; role: Role; onSaved: () => void }) {
  const initial = mandate ?? { status: "active", buyEnabled: true, sellEnabled: true, maxOrderValue: null, dailyGrossLimit: null, effectiveDailyGrossLimit: 0, allowedAssetClasses: [], allowedMarketSegments: [], allowedOrderTypes: [], commissionSource: "tenant_default" as const, version: 1 };
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = (field: "allowedAssetClasses" | "allowedOrderTypes", item: string) => setValue((current) => ({ ...current, [field]: current[field].includes(item) ? current[field].filter((entry) => entry !== item) : [...current[field], item] }));
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/trading-mandate`, { method: "PATCH", headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role }, body: JSON.stringify(value) });
      const result = await response.json().catch(() => ({})) as { error?: string; tradingMandate?: typeof value };
      if (!response.ok || !result.tradingMandate) throw new Error(result.error ?? "Unable to save the trading mandate.");
      setValue((current) => ({ ...current, ...result.tradingMandate })); setMessage("Trading mandate saved and audit logged."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the trading mandate."); }
    finally { setBusy(false); }
  };
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">CLIENT TRADING CONTROL</span><h2>Mandate and limits</h2><p>Blank client limits inherit the tenant policy. Commission always uses the active tenant schedule, including value tiers.</p></div>{canAdjust && <button className="btn primary small" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save mandate"}</button>}</div><div className="form-grid"><label>Status<BrandSelect value={value.status} onChange={(status) => setValue((current) => ({ ...current, status }))} ariaLabel="Trading mandate status" options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} /></label><label>Maximum order value (ETB)<input type="number" min="0" disabled={!canAdjust} placeholder="No client-specific cap" value={value.maxOrderValue ?? ""} onChange={(event) => setValue((current) => ({ ...current, maxOrderValue: event.target.value === "" ? null : Number(event.target.value) }))} /></label><label>Daily gross limit (ETB)<input type="number" min="0" disabled={!canAdjust} placeholder={`Tenant default ${value.effectiveDailyGrossLimit}`} value={value.dailyGrossLimit ?? ""} onChange={(event) => setValue((current) => ({ ...current, dailyGrossLimit: event.target.value === "" ? null : Number(event.target.value) }))} /></label><label>Allowed market segments<input disabled={!canAdjust} placeholder="Blank means all; comma-separated" value={value.allowedMarketSegments.join(", ")} onChange={(event) => setValue((current) => ({ ...current, allowedMarketSegments: event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) }))} /></label></div><div className="order-types"><span>Directions</span><label><input type="checkbox" disabled={!canAdjust} checked={value.buyEnabled} onChange={(event) => setValue((current) => ({ ...current, buyEnabled: event.target.checked }))} /><i />Buy</label><label><input type="checkbox" disabled={!canAdjust} checked={value.sellEnabled} onChange={(event) => setValue((current) => ({ ...current, sellEnabled: event.target.checked }))} /><i />Sell</label></div><div className="order-types"><span>Asset classes <small>(none means all)</small></span>{[["equity", "Equity"], ["bond", "Government bond"]].map(([id, label]) => <label key={id}><input type="checkbox" disabled={!canAdjust} checked={value.allowedAssetClasses.includes(id)} onChange={() => toggle("allowedAssetClasses", id)} /><i />{label}</label>)}</div><div className="order-types"><span>Order types <small>(none means tenant defaults)</small></span>{[["market", "Market"], ["limit", "Limit"], ["stop_loss", "Stop-loss"]].map(([id, label]) => <label key={id}><input type="checkbox" disabled={!canAdjust} checked={value.allowedOrderTypes.includes(id)} onChange={() => toggle("allowedOrderTypes", id)} /><i />{label}</label>)}</div><div className="settings-note"><b>Commission schedule</b><span>Inherits the tenant&apos;s active default commission schedule and its order-value tiers.</span></div>{message && <p className="control-message">{message}</p>}</section>;
}

export function ClientsPage({ clients, selectedId, onSelect, orders, instruments, role, focus, onNewClient, onRefresh, onOpenOrder, onOpenConversation }: { clients: BrokerClient[]; selectedId: string; onSelect: (id: string) => void; orders: DemoOrder[]; instruments: BrokerInstrument[]; role: Role; focus: { status?: string; clientId?: string; tab?: "overview" | "documents" } | null; onNewClient: () => void; onRefresh: () => Promise<void>; onOpenOrder: (order: DemoOrder) => void; onOpenConversation?: (threadId: string) => void }) {
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
  const [workspaceView, setWorkspaceView] = useState<"directory" | "client360">(focus?.clientId ? "client360" : "directory");
  const [tab, setTab] = useState<Client360Tab>(focus?.tab ?? "overview");
  const [detail, setDetail] = useState<Client360Detail | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "live" | "offline" | "not_found" | "error">("loading");
  const [detailClientId, setDetailClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [applicationReviewOpen, setApplicationReviewOpen] = useState(false);
  const [applicationReviewStep, setApplicationReviewStep] = useState(0);
  const [onboardingRejectionReason, setOnboardingRejectionReason] = useState("");
  const [evidenceRejection, setEvidenceRejection] = useState<{ kind: "documents" | "bank-accounts"; id: string; label: string } | null>(null);
  const [evidenceRejectionReason, setEvidenceRejectionReason] = useState("");
  const [restrictionOpen, setRestrictionOpen] = useState(false);
  const [restrictionCategory, setRestrictionCategory] = useState("compliance_review");
  const [restrictionNote, setRestrictionNote] = useState("");
  const [restorationOpen, setRestorationOpen] = useState(false);
  const [restorationStep, setRestorationStep] = useState(0);
  const [restorationOutcome, setRestorationOutcome] = useState("");
  const [restorationEvidence, setRestorationEvidence] = useState("");
  const [restorationConfirmed, setRestorationConfirmed] = useState(false);
  const [termsEvidenceOpen, setTermsEvidenceOpen] = useState(false);
  const [termsEvidence, setTermsEvidence] = useState("");
  const [screeningResult, setScreeningResult] = useState("clear");
  const [screeningProvider, setScreeningProvider] = useState("");
  const [screeningReference, setScreeningReference] = useState("");
  const [screeningNotes, setScreeningNotes] = useState("");
  const [statementFrom, setStatementFrom] = useState(() => currentQuarterDates().from);
  const [statementTo, setStatementTo] = useState(() => currentQuarterDates().to);
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
      .then(async (response) => {
        if (response.ok) return response.json() as Promise<Client360Detail>;
        const payload = await response.json().catch(() => ({})) as { offline?: boolean };
        throw { status: response.status, offline: payload.offline === true };
      })
      .then((data) => {
        setDetail(data);
        setDetailClientId(selected.id);
        setDetailState("live");
      })
      .catch((error: { status?: number; offline?: boolean } | undefined) => {
        if (controller.signal.aborted) return;
        setDetail(null);
        setDetailClientId(selected.id);
        setDetailState(error?.offline || error?.status === 503 ? "offline" : error?.status === 404 ? "not_found" : "error");
      });
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
  const activeDetailState = detailClientId === selected.id ? detailState : "loading";
  const fallbackBlockingReasons = [
    ...(selected.kyc === "approved" ? [] : ["KYC approval is required"]),
    ...(selected.termsAcceptedVersion ? [] : ["Current legal terms have not been accepted"]),
    ...(selected.status === "active" ? [] : [`Client account is ${displayLabel(selected.status).toLowerCase()}`]),
    ...(selected.restrictionReason ? [selected.restrictionReason] : []),
  ];
  const model: Client360Detail = (detailClientId === selected.id ? detail : null) ?? {
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
      blockingReasons: fallbackReady ? [] : fallbackBlockingReasons,
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
    screenings: [],
    linkedBanks: [],
    requests: selected.serviceRequests ?? [],
    notes: [],
    auditTrail: [],
  };

  const openOrder = (orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (order) onOpenOrder(order);
  };
  const openClientWorkspace = (client: BrokerClient) => {
    setDirectorySelection(client);
    onSelect(client.id);
    setTab("overview");
    setMessage("");
    setDetail(null);
    setDetailClientId(null);
    setDetailState("loading");
    setWorkspaceView("client360");
    window.scrollTo({ top: 0 });
  };
  const canAdjust = hasPermission(role, "adjust");
  const canApproveClient = hasPermission(role, "approve");
  const canRejectClient = hasPermission(role, "reject");
  const pendingOnboardingDecision = model.client.clientStatus === "pending_approval";
  const canRestoreRestriction = model.client.clientStatus === "restricted" && model.client.accountStatus === "restricted";
  const canPlaceRestriction = model.client.clientStatus === "active" && model.client.accountStatus === "active";
  const expectedDocuments = model.documents.expected ?? [];
  const missingDocuments = expectedDocuments.filter((type) => !model.documents.kyc.some((document) => document.type === type));
  const documentsAwaitingApproval = model.documents.kyc.filter((document) => Boolean(document.type && expectedDocuments.includes(document.type)) && document.status !== "approved");
  const banksAwaitingApproval = (model.linkedBanks ?? []).filter((bank) => bank.status !== "approved");
  // These mirror the server-side gates in approveClient (lib/client-service.ts).
  // Any gate missing here lets the Approve button enable and the API then reject
  // with a 409, which is how the screening gate used to be missed.
  const latestScreening = model.screenings[0] ?? null;
  const institutionalClient = model.client.type === "institution" || model.client.type === "corporate";
  const approvalBlockers = [
    ...(!model.client.identityMasked ? ["Fayda FAN has not been recorded"] : []),
    ...(!model.client.taxIdMasked ? ["TIN has not been recorded"] : []),
    ...(institutionalClient && !model.client.businessRegistrationNumber ? ["Business registration number has not been recorded"] : []),
    ...(institutionalClient && !model.client.authorizedRepresentativeName ? ["Authorized representative has not been recorded"] : []),
    ...(institutionalClient && !model.client.signatoryAuthorityConfirmed ? ["Signatory authority has not been confirmed"] : []),
    ...missingDocuments.map((type) => `${displayLabel(type)} has not been received`),
    ...documentsAwaitingApproval.map((document) => `${displayLabel(document.type ?? document.name)} is ${displayLabel(document.status).toLowerCase()}`),
    ...(model.linkedBanks?.length ? banksAwaitingApproval.map((bank) => `${bank.bankName} account is ${displayLabel(bank.status).toLowerCase()}`) : ["No linked bank account has been submitted"]),
    ...(!model.legal.accepted ? ["Brokerage terms have not been accepted"] : []),
    ...(latestScreening?.result !== "clear"
      ? [latestScreening
        ? `Sanctions and PEP screening result is ${displayLabel(latestScreening.result).toLowerCase()}, so the client cannot be activated`
        : "Sanctions and PEP screening evidence has not been recorded"]
      : []),
  ];
  const applicationReadyForApproval = approvalBlockers.length === 0;
  const restorationCategory = inferRestrictionCategory(model.restrictions.reason);
  const restorationGuidance = restrictionResolutionGuidance(restorationCategory);
  const restoration = evaluateRestorationControls({
    kycStatus: model.client.kycStatus,
    screeningStatus: model.screenings[0]?.result ?? null,
    expectedDocuments,
    approvedDocuments: model.documents.kyc.filter((document) => document.status === "approved").flatMap((document) => document.type ? [document.type] : []),
    consentReady: model.legal.accepted,
  });
  const restorationSubmissionReady = restoration.ready
    && restorationOutcome.trim().length >= 10
    && restorationEvidence.trim().length >= 5
    && restorationConfirmed;
  const act = async (action: "approve_client" | "reject_client" | "restrict" | "restore" | "record_terms_acceptance" | "complete_kyc_review" | "resolve_request" | "approve_closure" | "reject_request" | "add_note", requestId?: string, decisionReason?: string, actionData: Record<string, unknown> = {}) => {
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
          reason: action === "reject_client" ? decisionReason ?? "Client onboarding rejected after compliance review" : decisionReason,
          resolutionNotes: action === "reject_request" ? "Request rejected after broker review." : "Reviewed and resolved by broker operations.",
          ...actionData,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; blockers?: string[] };
      if (!response.ok) throw new Error([result.error, ...(result.blockers ?? [])].filter(Boolean).join(" · ") || "Client action failed.");
      if (action === "add_note") setNoteText("");
      if (action === "approve_client" || action === "reject_client") setApplicationReviewOpen(false);
      if (action === "restrict") setRestrictionOpen(false);
      if (action === "restore") setRestorationOpen(false);
      if (action === "record_terms_acceptance") setTermsEvidenceOpen(false);
      setRefreshKey((current) => current + 1);
      await onRefresh();
      setMessage(action === "add_note" ? "Internal note added and audit logged." : action === "approve_client" ? "Client approved and activated. The account is now eligible for New Order." : action === "reject_client" ? "Client onboarding rejected and retained in the audit trail." : "Control action recorded in the client audit trail.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Client action failed.");
    } finally {
      setBusy(null);
    }
  };
  // Servicing actions. They post to the CRM APIs rather than the client action
  // route, then reuse the same refresh key so Client 360 reloads in one place.
  const openTasks = (model.tasks ?? []).filter((task) => !isTaskClosed(task.status));

  const crmPost = async (url: string, body: Record<string, unknown>, key: string, success: string) => {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The change could not be saved.");
      setRefreshKey((current) => current + 1);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const assignOfficer = (primaryOfficerId: string | null) =>
    crmPost("/api/crm/assignments", { clientId: selected.id, primaryOfficerId }, "assign", primaryOfficerId ? "Relationship officer assigned." : "Relationship officer cleared.");

  const taskAction = (taskId: string, body: Record<string, unknown>) =>
    crmPost(`/api/crm/tasks/${encodeURIComponent(taskId)}/action`, body, taskId, "Task updated.");

  const reviewEvidence = async (kind: "documents" | "bank-accounts", id: string, action: "approve" | "reject", rejectionReason = "") => {
    const reason = action === "reject" ? rejectionReason.trim() : "";
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
      setEvidenceRejection(null);
      setEvidenceRejectionReason("");
      setMessage(action === "approve" ? "Item approved." : "Item not approved. The reason was recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setBusy(null);
    }
  };
  const uploadClientDocument = async (documentType: string, file: File) => {
    setBusy(`upload-${documentType}`);
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("documentType", documentType);
      formData.set("file", file);
      const response = await fetch(`/api/clients/${encodeURIComponent(selected.id)}/documents`, {
        method: "POST",
        headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: formData,
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Document upload failed.");
      setRefreshKey((current) => current + 1);
      await onRefresh();
      setMessage(`${displayLabel(documentType)} uploaded on the client's behalf and added to the audit trail.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const recordScreening = async () => {
    setBusy("screening");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(selected.id)}/screenings`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify({ result: screeningResult, provider: screeningProvider, reference: screeningReference, notes: screeningNotes }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Screening evidence could not be recorded.");
      setScreeningProvider("");
      setScreeningReference("");
      setScreeningNotes("");
      setMessage("Screening evidence recorded in the client audit trail.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Screening evidence could not be recorded.");
    } finally {
      setBusy(null);
    }
  };

  const downloadStatement = async () => {
    setBusy("statement");
    try {
      const params = new URLSearchParams({ from: statementFrom, to: statementTo });
      const response = await fetch(`/api/clients/${encodeURIComponent(selected.id)}/statement?${params.toString()}`, { headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "Statement could not be generated.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `client-statement-${selected.code}-${statementFrom}-${statementTo}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Client statement generated and audit logged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Statement could not be generated.");
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
    { id: "conversations", label: "Conversations" },
    { id: "timeline", label: "Timeline" },
    { id: "settlements", label: "Settlements", count: model.settlements.filter((item) => item.status !== "settled").length },
    { id: "documents", label: "Documents" },
    { id: "notes", label: "Notes", count: model.notes.length },
    { id: "audit", label: "Audit trail", count: model.auditTrail.length },
  ];

  return <>
    <SectionHeader eyebrow="CLIENT MANAGEMENT" title="Clients & accounts" copy="Search the client book or work inside a selected client’s controlled 360 record." action={<><span className="demo-control-badge">{directoryMeta.total.toLocaleString("en-US")} CLIENTS</span>{hasPermission(role, "create") && <button className="btn primary" onClick={onNewClient}>＋ Add client</button>}</>} />
    <nav className="client-page-tabs" role="tablist" aria-label="Clients and accounts views">
      <button role="tab" aria-selected={workspaceView === "directory"} className={workspaceView === "directory" ? "active" : ""} onClick={() => { setWorkspaceView("directory"); window.scrollTo({ top: 0 }); }}><Icon name="clients" size={16} /><span><b>Client Directory</b><small>Search and select clients</small></span></button>
      <button role="tab" aria-selected={workspaceView === "client360"} className={workspaceView === "client360" ? "active" : ""} onClick={() => { setWorkspaceView("client360"); window.scrollTo({ top: 0 }); }}><Icon name="users" size={16} /><span><b>Client 360 Workspace</b><small>{selected.name} · {selected.code}</small></span></button>
    </nav>
    {workspaceView === "directory" && <>
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
        <label>Status<BrandSelect className="bselect-inline" value={clientStatusFilter} onChange={(next) => { setClientStatusFilter(next); setDirectoryPage(1); }} ariaLabel="Filter by status" options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "pending_approval", label: "Pending approval" }, { value: "restricted", label: "Restricted" }, { value: "rejected", label: "Rejected" }]} /></label>
        <label>KYC<BrandSelect className="bselect-inline" value={clientKycFilter} onChange={(next) => { setClientKycFilter(next); setDirectoryPage(1); }} ariaLabel="Filter by KYC state" options={[{ value: "all", label: "All KYC states" }, { value: "approved", label: "Approved" }, { value: "pending_review", label: "Pending review" }, { value: "review_due", label: "Review due" }, { value: "rejected", label: "Rejected" }]} /></label>
        <label>Sort<BrandSelect className="bselect-inline" value={clientSort} onChange={(next) => { setClientSort(next as "name" | "newest"); setDirectoryPage(1); }} ariaLabel="Sort" options={[{ value: "name", label: "Name A–Z" }, { value: "newest", label: "Newest first" }]} /></label>
      </div>
      <div className="client-directory-summary"><span>{directoryMeta.total.toLocaleString("en-US")} matching clients</span><span>Active <b>{directoryFacets.statuses.active ?? 0}</b></span><span>Pending approval <b>{directoryFacets.statuses.pending_approval ?? 0}</b></span><span>Restricted <b>{directoryFacets.statuses.restricted ?? 0}</b></span></div>
      {directoryRows.length ? <div className="table-scroll"><table className="client-directory-table"><thead><tr><th>Client</th><th>Category</th><th>Trading account</th><th>KYC</th><th>Account status</th><th className="num">Available cash</th><th className="num">Holdings</th><th className="num">Orders</th><th /></tr></thead><tbody>{directoryRows.map((client) => <tr className={client.id === selected.id ? "selected" : ""} key={client.id} onClick={() => openClientWorkspace(client)}><td><span className="directory-client-cell"><i>{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><span><b>{client.name}</b><small>{client.code}</small></span></span></td><td><span className={`client-type-badge type-${client.type.toLowerCase()}`}>{displayLabel(client.type)}</span></td><td><b>{client.accountNumber}</b><small>{client.accountId ? "Cash brokerage account" : "No account"}</small></td><td><span className={`directory-state ${client.kyc === "approved" ? "ready" : client.kyc === "rejected" ? "blocked" : "review"}`}><i />{displayLabel(client.kyc)}</span></td><td><span className={`directory-state ${client.status === "active" ? "ready" : client.status === "rejected" ? "blocked" : "review"}`}><i />{displayLabel(client.status)}</span></td><td className="num"><b>{etb(client.availableCash)}</b><small>{client.blockedCash ? `${etb(client.blockedCash)} blocked` : "No cash blocked"}</small></td><td className="num"><b>{client.holdingCount ?? client.holdings.length}</b></td><td className="num"><b>{client.orderCount}</b></td><td><button className="directory-open" onClick={(event) => { event.stopPropagation(); openClientWorkspace(client); }}>Open →</button></td></tr>)}</tbody></table></div> : <EmptyState title="No clients match these filters" copy="Try a different category, status, KYC state, or search term." />}
      <footer className="client-directory-pagination"><label>Rows<BrandSelect className="bselect-mini" value={String(directoryPageSize)} onChange={(next) => { setDirectoryPageSize(Number(next)); setDirectoryPage(1); }} ariaLabel="Rows per page" options={[{ value: "25", label: "25" }, { value: "50", label: "50" }, { value: "100", label: "100" }]} /></label><span>Page {directoryMeta.page} of {directoryMeta.pageCount}</span><div><button disabled={directoryMeta.page <= 1} onClick={() => setDirectoryPage((page) => Math.max(1, page - 1))}>Previous</button><button disabled={directoryMeta.page >= directoryMeta.pageCount} onClick={() => setDirectoryPage((page) => Math.min(directoryMeta.pageCount, page + 1))}>Next</button></div></footer>
    </section>
    </>}
    {workspaceView === "client360" && <>
    <div className="client-workspace-label"><span>CLIENT 360 WORKSPACE</span><b>{selected.name}</b><small>{selected.code} · {displayLabel(selected.type)}</small></div>
    <section className="panel client-360-hero">
      <div className="client-360-identity"><span>{model.client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><small>{displayLabel(model.client.type)} · {model.client.code}</small><h2>{model.client.name}</h2><p>{model.client.phone ?? "Phone not recorded"} · {model.client.email ?? "Email not recorded"}</p></div></div>
      <div className="client-360-statuses"><span className={`status ${model.readiness.canTrade ? "status-success" : "status-danger"}`}><i />{model.readiness.canTrade ? "Trade ready" : "Not trade ready"}</span><span className={`status ${model.client.kycStatus === "approved" ? "status-success" : "status-warning"}`}><i />KYC {displayLabel(model.client.kycStatus)}</span><span className={`status ${model.client.accountStatus === "active" ? "status-success" : "status-warning"}`}><i />{displayLabel(model.client.accountStatus)}</span></div>
      <div className="client-360-meta"><span><small>Account</small><b>{selected.accountNumber}</b></span><span><small>CSD reference</small><b>{model.client.csdReference ?? "Not recorded"}</b></span><span><small>Broker / branch</small><b>{model.client.broker}{model.client.branch ? ` · ${model.client.branch}` : ""}</b></span><span><small>Opened</small><b>{new Date(model.client.openedAt).toLocaleDateString("en-GB")}</b></span><span><small>Last activity</small><b>{model.client.lastActivityAt ? new Date(model.client.lastActivityAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "No activity"}</b></span></div>
      {pendingOnboardingDecision ? <div className="client-360-review-bar">
        <div><small>ONBOARDING DECISION · FOUR-EYES CONTROL</small><b>Application review required</b><span>Complete the guided identity, document and bank review before making a final decision.</span></div>
        <div className="client-360-review-buttons">
          {(canApproveClient || canRejectClient) && <button className="btn primary" disabled={Boolean(busy)} onClick={() => { setApplicationReviewStep(0); setOnboardingRejectionReason(""); setApplicationReviewOpen(true); }}>Review application</button>}
          {!canApproveClient && !canRejectClient && <span>Your role can review this record but cannot make the onboarding decision.</span>}
        </div>
      </div> : canAdjust && (canRestoreRestriction || canPlaceRestriction) && <div className="client-360-secondary-action">{canRestoreRestriction ? <button className="btn secondary small" disabled={busy === "restore"} onClick={() => { setRestorationStep(0); setRestorationOutcome(""); setRestorationEvidence(""); setRestorationConfirmed(false); setRestorationOpen(true); }}>Resolve restriction</button> : <button className="btn secondary small" disabled={busy === "restrict"} onClick={() => { setRestrictionCategory("compliance_review"); setRestrictionNote(""); setRestrictionOpen(true); }}>Restrict account</button>}</div>}
    </section>
    <nav className="client-360-tabs" aria-label="Client 360 sections">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</nav>
    {message && <p className="control-message client-360-message">{message}</p>}
    {applicationReviewOpen && <div className="application-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setApplicationReviewOpen(false); }}>
      <section className="application-review-dialog" role="dialog" aria-modal="true" aria-labelledby="application-review-title">
        <header className="application-review-head">
          <div><span className="eyebrow">CONTROLLED ONBOARDING REVIEW</span><h2 id="application-review-title">Review {model.client.name}</h2><p>Confirm each part of the application before making the four-eyes decision.</p></div>
          <button className="application-review-close" aria-label="Close application review" disabled={Boolean(busy)} onClick={() => setApplicationReviewOpen(false)}>×</button>
        </header>
        <ol className="application-review-steps" aria-label="Application review progress">
          {["Applicant", "Documents", "Bank accounts", "Screening", "Decision"].map((label, index) => <li key={label} className={index === applicationReviewStep ? "active" : index < applicationReviewStep ? "complete" : ""}><button onClick={() => setApplicationReviewStep(index)}><i>{index < applicationReviewStep ? "✓" : index + 1}</i><span>{label}</span></button></li>)}
        </ol>
        <div className="application-review-body">
          {applicationReviewStep === 0 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 1 OF 5</small><h3>Applicant details</h3><p>Compare these details with the submitted identity and authority evidence.</p></span><strong data-state={model.client.identityMasked ? "ready" : "attention"}>{model.client.identityMasked ? "Details supplied" : "Needs attention"}</strong></div>
            <dl className="application-review-details">
              <div><dt>Client type</dt><dd>{displayLabel(model.client.type)}</dd></div>
              <div><dt>Full legal name</dt><dd>{model.client.name}</dd></div>
              <div><dt>Email</dt><dd>{model.client.email ?? "Not recorded"}</dd></div>
              <div><dt>Mobile number</dt><dd>{model.client.phone ?? "Not recorded"}</dd></div>
              <div><dt>Fayda FAN</dt><dd>{model.client.identityMasked ?? "Not recorded"}</dd></div>
              <div><dt>TIN</dt><dd>{model.client.taxIdMasked ?? "Not recorded"}</dd></div>
              {model.client.type !== "individual" && <><div><dt>Registration number</dt><dd>{model.client.businessRegistrationNumber ?? "Not recorded"}</dd></div><div><dt>Authorized representative</dt><dd>{model.client.authorizedRepresentativeName ?? "Not recorded"}</dd></div><div><dt>Signatory authority</dt><dd>{model.client.signatoryAuthorityConfirmed ? "Confirmed" : "Not confirmed"}</dd></div></>}
            </dl>
            <div className="application-review-note"><i>i</i><span><b>Review responsibility</b><small>Confirm that the applicant details match the evidence before continuing. All final decisions are recorded in the audit trail.</small></span></div>
          </div>}
          {applicationReviewStep === 1 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 2 OF 5</small><h3>Documents and agreements</h3><p>Open each received file, compare it with the application, then record your review.</p></span><strong data-state={missingDocuments.length || documentsAwaitingApproval.length || !model.legal.accepted ? "attention" : "ready"}>{expectedDocuments.length - missingDocuments.length}/{expectedDocuments.length} received</strong></div>
            <div className="application-review-list">
              {expectedDocuments.map((type) => {
                const document = model.documents.kyc.find((item) => item.type === type);
                return <article key={type} className="application-review-item">
                  <span className="application-review-item-icon">DOC</span>
                  <span><b>{displayLabel(type)}</b><small>{document ? `${document.name}${document.uploadedAt ? ` · Uploaded ${new Date(document.uploadedAt).toLocaleDateString("en-GB")}` : ""}` : "Not received from applicant"}</small>{document?.rejectionReason && <em>{document.rejectionReason}</em>}</span>
                  <strong data-status={document?.status ?? "not_received"}>{document ? displayLabel(document.status) : "Not received"}</strong>
                  {document && <div className="application-review-item-actions">{document.hasFile && <a className="btn secondary small" href={`/api/clients/${encodeURIComponent(selected.id)}/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Open document</a>}{canApproveClient && document.status !== "approved" && <button className="btn primary small" disabled={busy === document.id} onClick={() => void reviewEvidence("documents", document.id, "approve")}>Approve</button>}{canRejectClient && document.status !== "rejected" && <button className="btn danger small" disabled={busy === document.id} onClick={() => { setEvidenceRejection({ kind: "documents", id: document.id, label: displayLabel(type) }); setEvidenceRejectionReason(""); }}>Not approve</button>}</div>}
                </article>;
              })}
              <article className="application-review-item"><span className="application-review-item-icon">T&C</span><span><b>Brokerage terms</b><small>{model.legal.accepted ? `Accepted version ${model.legal.latestAcceptedVersion ?? model.legal.latestRequiredVersion}` : "Current terms have not been accepted"}</small></span><strong data-status={model.legal.accepted ? "approved" : "not_received"}>{model.legal.accepted ? "Accepted" : "Outstanding"}</strong></article>
            </div>
          </div>}
          {applicationReviewStep === 2 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 3 OF 5</small><h3>Linked bank accounts</h3><p>Confirm ownership before enabling a destination for deposits or withdrawals.</p></span><strong data-state={model.linkedBanks?.length && !banksAwaitingApproval.length ? "ready" : "attention"}>{model.linkedBanks?.length ?? 0} submitted</strong></div>
            <div className="application-review-list">
              {model.linkedBanks?.length ? model.linkedBanks.map((bank) => <article className="application-review-item" key={bank.id}>
                <span className="application-review-item-icon">BANK</span><span><b>{bank.bankName}</b><small>{bank.accountNumberMasked} · {bank.accountHolderName}</small>{bank.rejectionReason && <em>{bank.rejectionReason}</em>}</span><strong data-status={bank.status}>{displayLabel(bank.status)}</strong>
                <div className="application-review-item-actions">{canApproveClient && bank.status !== "approved" && <button className="btn primary small" disabled={busy === bank.id} onClick={() => void reviewEvidence("bank-accounts", bank.id, "approve")}>Approve</button>}{canRejectClient && bank.status !== "rejected" && <button className="btn danger small" disabled={busy === bank.id} onClick={() => { setEvidenceRejection({ kind: "bank-accounts", id: bank.id, label: `${bank.bankName} account` }); setEvidenceRejectionReason(""); }}>Not approve</button>}</div>
              </article>) : <div className="application-review-empty"><i>!</i><b>No bank account submitted</b><span>The applicant must provide a bank account in their legal name before the application can be approved.</span></div>}
            </div>
          </div>}
          {applicationReviewStep === 3 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 4 OF 5</small><h3>Sanctions and PEP screening</h3><p>Record the result produced by your screening provider or documented manual process. A clear result is required before activation.</p></span><strong data-state={latestScreening?.result === "clear" ? "ready" : "attention"}>{latestScreening ? displayLabel(latestScreening.result) : "Not recorded"}</strong></div>
            {latestScreening
              ? <div className="screening-latest"><span><small>LATEST CHECK</small><b>{latestScreening.provider}</b><em>{new Date(latestScreening.screenedAt).toLocaleString("en-GB")} · {latestScreening.recordedBy}</em></span><span><small>REFERENCE</small><b>{latestScreening.reference ?? "Not supplied"}</b><em>{latestScreening.notes ?? "No additional note"}</em></span></div>
              : <EmptyState title="No screening evidence" copy="Record the sanctions and PEP result before making the four-eyes decision." />}
            {hasPermission(role, COMPLIANCE_PERMISSIONS.screeningRecord)
              ? <div className="screening-form"><label>Result<BrandSelect value={screeningResult} onChange={setScreeningResult} ariaLabel="Onboarding screening result" options={[{ value: "clear", label: "Clear" }, { value: "potential_match", label: "Potential match" }, { value: "confirmed_match", label: "Confirmed match" }]} /></label><label>Provider or process<input value={screeningProvider} onChange={(event) => setScreeningProvider(event.target.value)} maxLength={120} placeholder="Provider or manual screening process" /></label><label>Reference<input value={screeningReference} onChange={(event) => setScreeningReference(event.target.value)} maxLength={160} placeholder="Case or search reference" /></label><label>Note<input value={screeningNotes} onChange={(event) => setScreeningNotes(event.target.value)} maxLength={1000} placeholder="Optional match rationale" /></label><button className="btn primary small" disabled={busy === "screening" || screeningProvider.trim().length < 2} onClick={() => void recordScreening()}>{busy === "screening" ? "Recording…" : "Record screening"}</button></div>
              : <div className="application-review-note"><i>i</i><span><b>Screening is recorded by compliance</b><small>Your role cannot record screening evidence. Ask a compliance officer or broker administrator to complete this step.</small></span></div>}
            <div className="application-review-note"><i>i</i><span><b>Screening responsibility</b><small>Recording a result attests that the check was actually performed. The entry is written to the client audit trail under your name.</small></span></div>
          </div>}
          {applicationReviewStep === 4 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 5 OF 5</small><h3>Final decision</h3><p>Review the control summary and record your decision.</p></span><strong data-state={applicationReadyForApproval ? "ready" : "attention"}>{applicationReadyForApproval ? "Ready to approve" : `${approvalBlockers.length} outstanding`}</strong></div>
            <div className={`application-decision-summary ${applicationReadyForApproval ? "ready" : "attention"}`}>
              <i>{applicationReadyForApproval ? "✓" : "!"}</i><span><b>{applicationReadyForApproval ? "All approval checks are complete" : "Approval is not available yet"}</b><p>{applicationReadyForApproval ? "Approving will activate the client and create their trading account number." : "Complete or resolve the items below before approving this application."}</p></span>
            </div>
            {!applicationReadyForApproval && <ul className="application-review-blockers">{approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
            {canRejectClient && <label className="application-rejection-field"><span>Rejection reason <small>Required only when rejecting</small></span><textarea value={onboardingRejectionReason} onChange={(event) => setOnboardingRejectionReason(event.target.value)} placeholder="Explain what the applicant needs to correct or provide" rows={3} /></label>}
            <div className="application-decision-actions">
              {canRejectClient && <button className="btn danger" disabled={Boolean(busy) || onboardingRejectionReason.trim().length < 5} onClick={() => void act("reject_client", undefined, onboardingRejectionReason.trim())}>{busy === "reject_client" ? "Rejecting…" : "Reject application"}</button>}
              {canApproveClient && <button className="btn primary" disabled={Boolean(busy) || !applicationReadyForApproval} onClick={() => void act("approve_client")}>{busy === "approve_client" ? "Approving…" : "Approve and activate"}</button>}
            </div>
          </div>}
        </div>
        <footer className="application-review-footer"><button className="btn secondary" disabled={applicationReviewStep === 0 || Boolean(busy)} onClick={() => setApplicationReviewStep((step) => Math.max(0, step - 1))}>Back</button><span>Step {applicationReviewStep + 1} of 5</span>{applicationReviewStep < 4 ? <button className="btn primary" disabled={Boolean(busy)} onClick={() => setApplicationReviewStep((step) => Math.min(4, step + 1))}>Continue</button> : <button className="btn secondary" disabled={Boolean(busy)} onClick={() => setApplicationReviewOpen(false)}>Close review</button>}</footer>
      </section>
    </div>}
    {restorationOpen && <div className="application-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRestorationOpen(false); }}>
      <section className="application-review-dialog restriction-resolution-dialog" role="dialog" aria-modal="true" aria-labelledby="restriction-resolution-title">
        <header className="application-review-head">
          <div><span className="eyebrow">CONTROLLED ACCOUNT RESTORATION</span><h2 id="restriction-resolution-title">Resolve {model.client.name}&apos;s restriction</h2><p>Resolve the recorded cause, verify the account controls, and preserve the decision evidence.</p></div>
          <button className="application-review-close" aria-label="Close restriction resolution" disabled={Boolean(busy)} onClick={() => setRestorationOpen(false)}>×</button>
        </header>
        <ol className="application-review-steps" aria-label="Restriction resolution progress">
          {["Restriction", "Resolution checks", "Decision evidence"].map((label, index) => <li key={label} className={index === restorationStep ? "active" : index < restorationStep ? "complete" : ""}><button onClick={() => setRestorationStep(index)}><i>{index < restorationStep ? "✓" : index + 1}</i><span>{label}</span></button></li>)}
        </ol>
        <div className="application-review-body">
          {restorationStep === 0 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 1 OF 3</small><h3>Understand the restriction</h3><p>The account stays restricted until its recorded cause and all mandatory controls are resolved.</p></span><strong data-state="attention">Restricted</strong></div>
            <dl className="application-review-details restriction-resolution-details">
              <div><dt>Restriction type</dt><dd>{restrictionCategoryLabels[restorationCategory]}</dd></div>
              <div><dt>Restricted at</dt><dd>{model.restrictions.restrictedAt ? new Date(model.restrictions.restrictedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"}</dd></div>
              <div className="wide"><dt>Recorded reason</dt><dd>{model.restrictions.reason ?? "No detailed reason was recorded; treat this as an exception and document the investigation."}</dd></div>
            </dl>
            <div className="restriction-resolution-guidance"><small>REQUIRED RESOLUTION PATH</small><ol>{restorationGuidance.map((item) => <li key={item}>{item}</li>)}</ol></div>
          </div>}
          {restorationStep === 1 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 2 OF 3</small><h3>Verify resolution controls</h3><p>These controls are recalculated from the client record and rechecked by the server when you restore.</p></span><strong data-state={restoration.ready ? "ready" : "attention"}>{restoration.ready ? "All controls pass" : `${restoration.blockers.length} outstanding`}</strong></div>
            <div className="application-review-list restriction-control-list">
              {restoration.controls.map((control) => <article className="application-review-item" key={control.key}>
                <span className={`restriction-control-icon ${control.passed ? "pass" : "fail"}`}>{control.passed ? "✓" : "!"}</span>
                <span><b>{control.label}</b><small>{control.detail}</small></span>
                <strong data-status={control.passed ? "approved" : "rejected"}>{control.passed ? "Passed" : "Resolve"}</strong>
              </article>)}
            </div>
            {!restoration.ready && <><ul className="application-review-blockers">{restoration.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><div className="application-decision-actions"><button className="btn secondary" onClick={() => { setRestorationOpen(false); setTab("documents"); }}>Open documents &amp; controls</button></div></>}
          </div>}
          {restorationStep === 2 && <div className="application-review-section">
            <div className="application-review-section-head"><span><small>STEP 3 OF 3</small><h3>Record the restoration decision</h3><p>Leave enough evidence for another reviewer to reconstruct why the restriction was removed.</p></span><strong data-state={restorationSubmissionReady ? "ready" : "attention"}>{restorationSubmissionReady ? "Ready to restore" : "Evidence required"}</strong></div>
            <div className={`application-decision-summary ${restoration.ready ? "ready" : "attention"}`}><i>{restoration.ready ? "✓" : "!"}</i><span><b>{restoration.ready ? "Mandatory account controls pass" : "Restoration remains blocked"}</b><p>{restoration.ready ? `You are resolving a ${restrictionCategoryLabels[restorationCategory].toLowerCase()} restriction. The original reason remains in the audit trail.` : "Return to the resolution checks and clear every outstanding control before restoring the account."}</p></span></div>
            <label className="application-rejection-field"><span>Resolution outcome <small>Minimum 10 characters</small></span><textarea rows={4} maxLength={1000} value={restorationOutcome} onChange={(event) => setRestorationOutcome(event.target.value)} placeholder="Explain what was investigated, corrected, or formally released" /></label>
            <label className="application-rejection-field"><span>Evidence reference <small>Case, document, instruction or approval reference</small></span><textarea rows={2} maxLength={1000} value={restorationEvidence} onChange={(event) => setRestorationEvidence(event.target.value)} placeholder="For example, compliance case CMP-2041 approved on 4 Aug 2026" /></label>
            <label className="restriction-resolution-confirm"><input type="checkbox" checked={restorationConfirmed} onChange={(event) => setRestorationConfirmed(event.target.checked)} /><span><b>I confirm the recorded restriction reason has been resolved.</b><small>Restoring re-enables account activity, subject to normal order and money-movement controls.</small></span></label>
          </div>}
        </div>
        <footer className="application-review-footer"><button className="btn secondary" disabled={restorationStep === 0 || Boolean(busy)} onClick={() => setRestorationStep((step) => Math.max(0, step - 1))}>Back</button><span>Step {restorationStep + 1} of 3</span>{restorationStep < 2 ? <button className="btn primary" disabled={Boolean(busy)} onClick={() => setRestorationStep((step) => Math.min(2, step + 1))}>Continue</button> : <button className="btn primary" disabled={Boolean(busy) || !restorationSubmissionReady} onClick={() => void act("restore", undefined, restorationOutcome.trim(), { resolutionEvidence: restorationEvidence.trim(), resolutionConfirmed: restorationConfirmed })}>{busy === "restore" ? "Restoring…" : "Restore account"}</button>}</footer>
      </section>
    </div>}
    {evidenceRejection && <div className="evidence-rejection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEvidenceRejection(null); }}>
      <section className="evidence-rejection-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-rejection-title">
        <span className="evidence-rejection-icon">!</span><small>REVIEW EXCEPTION</small><h2 id="evidence-rejection-title">Do not approve {evidenceRejection.label}</h2><p>Give the applicant a clear reason so they know what must be corrected.</p>
        <label><span>Reason</span><textarea autoFocus rows={4} value={evidenceRejectionReason} onChange={(event) => setEvidenceRejectionReason(event.target.value)} placeholder="For example, the account holder name does not match the application" /></label>
        <div><button className="btn secondary" disabled={Boolean(busy)} onClick={() => setEvidenceRejection(null)}>Cancel</button><button className="btn danger" disabled={Boolean(busy) || evidenceRejectionReason.trim().length < 5} onClick={() => void reviewEvidence(evidenceRejection.kind, evidenceRejection.id, "reject", evidenceRejectionReason)}>Confirm not approved</button></div>
      </section>
    </div>}
    {restrictionOpen && <div className="evidence-rejection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRestrictionOpen(false); }}>
      <section className="evidence-rejection-dialog restriction-dialog" role="dialog" aria-modal="true" aria-labelledby="restriction-title">
        <span className="evidence-rejection-icon">!</span><small>ACCOUNT CONTROL</small><h2 id="restriction-title">Restrict {model.client.name}</h2><p>Trading and money movement will stop immediately. Select the reason that will be visible on the client record.</p>
        <label><span>Reason</span><BrandSelect value={restrictionCategory} onChange={setRestrictionCategory} ariaLabel="Restriction reason" options={[
          { value: "compliance_review", label: "Compliance review" },
          { value: "kyc_overdue", label: "KYC overdue" },
          { value: "missing_documents", label: "Missing documents" },
          { value: "suspicious_activity", label: "Suspicious activity review" },
          { value: "legal_regulatory", label: "Legal or regulatory" },
          { value: "client_request", label: "Client request" },
          { value: "other", label: "Other" },
        ]} /></label>
        <label><span>Additional note {restrictionCategory === "other" ? "(required)" : "(optional)"}</span><textarea rows={4} value={restrictionNote} onChange={(event) => setRestrictionNote(event.target.value)} placeholder="Add concise context for staff and the audit trail" /></label>
        <div><button className="btn secondary" disabled={Boolean(busy)} onClick={() => setRestrictionOpen(false)}>Cancel</button><button className="btn danger" disabled={Boolean(busy) || (restrictionCategory === "other" && restrictionNote.trim().length < 5)} onClick={() => void act("restrict", undefined, undefined, { restrictionCategory, restrictionNote: restrictionNote.trim() })}>Confirm restriction</button></div>
      </section>
    </div>}
    {termsEvidenceOpen && <div className="evidence-rejection-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setTermsEvidenceOpen(false); }}>
      <section className="evidence-rejection-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-evidence-title">
        <span className="evidence-rejection-icon">✓</span><small>LEGAL ACCEPTANCE</small><h2 id="terms-evidence-title">Record witnessed acceptance</h2><p>Only use this when the client has reviewed and accepted the current agreement outside the investor portal.</p>
        <label><span>Evidence note</span><textarea autoFocus rows={4} value={termsEvidence} onChange={(event) => setTermsEvidence(event.target.value)} placeholder="For example, signed copy received at Bole branch on 27 Jul 2026" /></label>
        <div><button className="btn secondary" disabled={Boolean(busy)} onClick={() => setTermsEvidenceOpen(false)}>Cancel</button><button className="btn primary" disabled={Boolean(busy) || termsEvidence.trim().length < 5} onClick={() => void act("record_terms_acceptance", undefined, termsEvidence.trim())}>Record acceptance</button></div>
      </section>
    </div>}

    {tab === "overview" && <div className="client-360-grid">
      <RelationshipOfficerCard current={model.relationship?.current ?? null} history={model.relationship?.history ?? []} role={role} busy={busy === "assign"} onAssign={(officerId) => void assignOfficer(officerId)} />
      <section className="panel onboarding-record"><div className="panel-head"><div><span className="eyebrow">ONBOARDING RECORD</span><h2>Submitted client details</h2></div><span className="account-number">{displayLabel(model.client.onboardingChannel ?? "in_person")}</span></div><dl><div><dt>Email</dt><dd>{model.client.email ?? "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{model.client.phone ?? "Not recorded"}</dd></div><div><dt>Fayda FAN</dt><dd>{model.client.identityMasked ?? "Not recorded"}</dd></div><div><dt>TIN</dt><dd>{model.client.taxIdMasked ?? "Not recorded"}</dd></div><div><dt>PEP declaration</dt><dd>{model.client.pepStatus ? displayLabel(model.client.pepStatus) : "Not recorded"}</dd></div>{model.client.type !== "individual" && <><div><dt>Registered address</dt><dd>{model.client.address ?? "Not recorded"}</dd></div><div><dt>Registration number</dt><dd>{model.client.businessRegistrationNumber ?? "Not recorded"}</dd></div><div><dt>Authorized representative</dt><dd>{model.client.authorizedRepresentativeName ?? "Not recorded"}</dd></div><div><dt>Signatory authority</dt><dd>{model.client.signatoryAuthorityConfirmed ? "Confirmed" : "Not confirmed"}</dd></div></>}</dl></section>
      <section className="panel readiness-panel"><div className="panel-head"><div><span className="eyebrow">TRADING READINESS</span><h2>{activeDetailState === "loading" ? "Loading readiness…" : model.readiness.canTrade ? "Client can trade" : "Action required"}</h2></div>{activeDetailState === "loading" ? <span className="readiness-score">–/–</span> : <span className={`readiness-score ${model.readiness.canTrade ? "ready" : "blocked"}`}>{model.readiness.items.filter((item) => item.state === "pass").length}/{model.readiness.items.length}</span>}</div>{activeDetailState !== "live" && <div className="readiness-source-callout"><b>{activeDetailState === "loading" ? "LOADING" : "DEMO SNAPSHOT"}</b><span>{activeDetailState === "loading" ? "Retrieving the full readiness record…" : activeDetailState === "offline" ? "The database is unavailable. Readiness below is calculated from the demonstration snapshot." : activeDetailState === "not_found" ? "This demonstration client is not present in the connected database. Readiness below uses the local snapshot." : "The full client record could not be loaded. Readiness below uses the local snapshot."}</span></div>}{activeDetailState !== "loading" && !model.readiness.canTrade && model.readiness.blockingReasons.length > 0 && <div className="readiness-callout"><b>Trading is blocked</b><span>{model.readiness.blockingReasons.join(" · ")}</span></div>}<div className="readiness-list">{model.readiness.items.map((item) => <div key={item.key}><i className={item.state}>{item.state === "pass" ? "✓" : item.state === "fail" ? "!" : "-"}</i><span><b>{item.label}</b><small>{item.detail}</small></span></div>)}</div></section>
      <TradingMandatePanel key={`${model.client.id}-${model.tradingMandate?.version ?? 0}`} clientId={model.client.id} mandate={model.tradingMandate} canAdjust={canAdjust && ["broker_admin", "compliance"].includes(role)} role={role} onSaved={() => setRefreshKey((key) => key + 1)} />
      <section className="panel overview-cash"><div className="panel-head"><div><span className="eyebrow">CASH POSITION</span><h2>Available to trade</h2></div><button onClick={() => setTab("assets")}>View ledger →</button></div><strong>{etb(model.cash?.available ?? 0)}</strong><div><span><small>Total cash</small><b>{etb(model.cash?.total ?? 0)}</b></span><span><small>Blocked</small><b>{etb(model.cash?.blocked ?? 0)}</b></span><span><small>Unsettled</small><b>{etb(model.cash?.unsettled ?? 0)}</b></span></div></section>
      <section className="panel legal-status-card"><div className="panel-head"><div><span className="eyebrow">LEGAL & DOCUMENTS</span><h2>Consent status</h2></div><span className={`status ${model.legal.accepted ? "status-success" : "status-warning"}`}><i />{model.legal.accepted ? "Accepted" : "Consent required"}</span></div><div className="legal-status-body"><span><small>Required version</small><b>{model.legal.latestRequiredVersion ?? "None configured"}</b></span><span><small>Accepted version</small><b>{model.legal.latestAcceptedVersion ?? "Not accepted"}</b></span><span><small>Last accepted</small><b>{model.legal.lastAcceptedAt ? new Date(model.legal.lastAcceptedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "-"}</b></span></div>{model.legal.missingDocuments.length > 0 && <div className="missing-docs"><small>MISSING / ACTION REQUIRED</small>{model.legal.missingDocuments.map((item) => <span key={item}>{item}</span>)}</div>}{canAdjust && !model.legal.accepted && <div className="record-resolution-actions"><button className="btn secondary small" onClick={() => { setTermsEvidence(""); setTermsEvidenceOpen(true); }}>Record witnessed acceptance</button></div>}</section>
      <section className="panel flags-card"><div className="panel-head"><div><span className="eyebrow">RESTRICTIONS & FLAGS</span><h2>Control indicators</h2></div></div>{model.restrictions.flags.length || model.restrictions.restricted ? <div className="flag-list">{model.restrictions.restricted && <div className="serious"><i>!</i><span><b>Account restricted</b><small>{model.restrictions.reason ?? "Reason not recorded"}</small></span></div>}{model.restrictions.flags.map((flag) => <div key={flag}><i>◇</i><span><b>{flag}</b><small>Review the relevant client record before activity.</small></span></div>)}</div> : <EmptyState title="No active flags" copy="No client, KYC, consent, or account restriction is currently blocking activity." />}</section>
      <section className="panel request-panel client-360-requests"><div className="panel-head"><div><span className="eyebrow">CLIENT INSTRUCTIONS</span><h2>Requests and discrepancies</h2></div><span className="exception-count">{model.requests.filter((item) => ["open", "under_review"].includes(item.status)).length} open</span></div>{model.requests.length ? model.requests.map((item) => <div className="client-request-row" key={item.id}><span><b>{item.subject}</b><small>{item.description}</small>{item.orderId && <em>{item.orderId}</em>}{item.resolutionNotes && <small>Outcome · {item.resolutionNotes}</small>}</span><strong>{displayLabel(item.status)}</strong>{item.threadId && onOpenConversation && <div><button className="btn secondary small" onClick={() => onOpenConversation(item.threadId!)}>Open conversation</button></div>}</div>) : <EmptyState title="No client requests" copy="Investor discrepancies, corrections, and closure requests will appear here." />}</section>
    </div>}

    {tab === "assets" && <div className="client-360-stack"><section className="client-cash-metrics"><Metric label="Total cash" value={etb(model.cash?.total ?? 0)} note="Ledger-backed balance" /><Metric label="Available cash" value={etb(model.cash?.available ?? 0)} note="Available for validated orders" tone="success" /><Metric label="Blocked cash" value={etb(model.cash?.blocked ?? 0)} note="Reserved against open buy orders" tone="warning" /><Metric label="Unsettled cash" value={etb(model.cash?.unsettled ?? 0)} note="Pending settlement" tone="purple" /></section><section className="panel holdings-panel"><div className="panel-head"><div><span className="eyebrow">SECURITIES POSITION</span><h2>Holdings and availability</h2></div></div>{model.holdings.length ? <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Asset class</th><th className="num">Total</th><th className="num">Available</th><th className="num">Blocked</th><th className="num">Unsettled</th><th className="num">Average cost</th><th className="num">Market value</th><th>Updated</th></tr></thead><tbody>{model.holdings.map((holding) => <tr key={holding.id}><td><b>{holding.symbol}</b><small>{holding.name}</small></td><td>{displayLabel(holding.assetClass)}</td><td className="num"><b>{fmt.format(holding.total)}</b></td><td className="num positive">{fmt.format(holding.available)}</td><td className={`num ${holding.blocked > 0 ? "negative" : ""}`}>{fmt.format(holding.blocked)}</td><td className="num">{fmt.format(holding.unsettled)}</td><td className="num">{fmt.format(holding.averageCost)} ETB</td><td className="num"><b>{etb(holding.marketValue)}</b></td><td>{new Date(holding.updatedAt).toLocaleDateString("en-GB")}</td></tr>)}</tbody></table></div> : <EmptyState title="No holdings yet" copy="This client has no securities position. Available, blocked, and unsettled quantities will appear after custody activity." />}</section></div>}

    {tab === "orders" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">ORDER WORKFLOW</span><h2>Open and recent orders</h2></div></div>{model.orders.length ? <div className="table-scroll"><table><thead><tr><th>Order / time</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Price</th><th className="num">Filled</th><th className="num">Remaining</th><th>Status</th><th>Source / trader</th><th>Action required</th><th /></tr></thead><tbody>{model.orders.map((order) => <tr key={order.id} onClick={() => openOrder(order.id)}><td><b>{order.id}</b><small>{new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td><td><b>{order.symbol}</b></td><td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td><td className="num">{fmt.format(order.quantity)}</td><td className="num">{fmt.format(order.price)}</td><td className="num">{fmt.format(order.filledQuantity)}</td><td className="num"><b>{fmt.format(order.remainingQuantity)}</b></td><td><StatusBadge status={order.status} /></td><td><b>{displayLabel(order.source)}</b><small>{order.trader}</small></td><td>{order.actionRequired ?? "None"}</td><td><button className="btn secondary small" onClick={(event) => { event.stopPropagation(); openOrder(order.id); }}>Open workflow</button></td></tr>)}</tbody></table></div> : <EmptyState title="No open or recent orders" copy="Client instructions will appear here after they are created through the controlled order workflow." />}</section>}

    {tab === "trades" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">EXECUTION HISTORY</span><h2>Captured trades</h2></div></div>{model.trades.length ? <div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Dates</th><th>Instrument</th><th>Side</th><th className="num">Quantity</th><th className="num">Execution price</th><th className="num">Gross</th><th className="num">Fees</th><th className="num">Net</th><th>Settlement</th><th>Contract note</th></tr></thead><tbody>{model.trades.map((trade) => <tr key={trade.id} onClick={() => openOrder(trade.orderId)}><td><b>{trade.id}</b><small>{trade.orderId}</small></td><td><b>{trade.tradeDate}</b><small>Settle {trade.settlementDate}</small></td><td><b>{trade.symbol}</b></td><td><span className={`side side-${trade.side}`}>{trade.side.toUpperCase()}</span></td><td className="num">{fmt.format(trade.quantity)}</td><td className="num">{fmt.format(trade.executionPrice)}</td><td className="num">{etb(trade.gross)}</td><td className="num">{etb(trade.fees)}</td><td className="num"><b>{etb(trade.net)}</b></td><td>{displayLabel(trade.settlementStatus)}</td><td>{trade.contractNoteNumber ? <button className="btn secondary small" onClick={() => openOrder(trade.orderId)}>{trade.contractNoteNumber}</button> : <span className="muted-label">Not generated</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No trades executed" copy="Full and partial fills captured through the trade service will appear here." />}</section>}

    {tab === "transactions" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">AUDITABLE LEDGERS</span><h2>Transaction history</h2></div><span className="account-number">Cash + securities</span></div>{model.transactions.length ? <div className="table-scroll"><table><thead><tr><th>Date / type</th><th>Ledger</th><th>Instrument</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Quantity</th><th className="num">Available Δ</th><th className="num">Blocked Δ</th><th className="num">Running balance</th><th>Reference</th><th>Created by / reason</th></tr></thead><tbody>{model.transactions.map((entry) => <tr key={entry.id}><td><b>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><small>{displayLabel(entry.type)}</small></td><td>{displayLabel(entry.ledger)}</td><td>{entry.instrument ?? "-"}</td><td className="num negative">{entry.debit ? fmt.format(entry.debit) : "-"}</td><td className="num positive">{entry.credit ? fmt.format(entry.credit) : "-"}</td><td className="num">{entry.quantity !== null ? fmt.format(entry.quantity) : "-"}</td><td className="num">{fmt.format(entry.availableImpact)}</td><td className="num">{fmt.format(entry.blockedImpact)}</td><td className="num"><b>{fmt.format(entry.runningBalance)}</b></td><td><b>{entry.reference}</b><small>{entry.status}</small></td><td><b>{entry.createdBy}</b><small>{entry.notes}</small></td></tr>)}</tbody></table></div> : <EmptyState title="No transactions yet" copy="Cash and securities ledger events will be combined here without overwriting authoritative balances." />}</section>}

    {tab === "settlements" && <section className="panel client-360-table"><div className="panel-head"><div><span className="eyebrow">POST-TRADE CONTROL</span><h2>Settlement items</h2></div></div>{model.settlements.length ? <div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Instrument</th><th>Trade date</th><th>Settlement date</th><th>Cash</th><th>Securities</th><th>Overall</th><th>Exception / notes</th><th /></tr></thead><tbody>{model.settlements.map((item) => <tr key={item.id} onClick={() => openOrder(item.orderId)}><td><b>{item.tradeId}</b><small>{item.orderId}</small></td><td><b>{item.symbol}</b></td><td>{item.tradeDate}</td><td><b>{item.settlementDate}</b></td><td><span className={`leg ${item.cashStatus === "settled" ? "done" : "pending"}`}>{displayLabel(item.cashStatus)}</span></td><td><span className={`leg ${item.securitiesStatus === "settled" ? "done" : "pending"}`}>{displayLabel(item.securitiesStatus)}</span></td><td>{displayLabel(item.status)}</td><td>{item.exception ? <span className="negative">{item.notes ?? "Exception requires review"}</span> : "None"}</td><td><button className="btn secondary small" onClick={(event) => { event.stopPropagation(); openOrder(item.orderId); }}>View settlement</button></td></tr>)}</tbody></table></div> : <EmptyState title="No settlement items" copy="Settlement records will appear after an execution is captured." />}</section>}

    {tab === "documents" && <div className="documents-grid">
      <section className="panel document-card compliance-evidence-card"><div className="panel-head"><div><span className="eyebrow">SCREENING EVIDENCE</span><h2>Sanctions and PEP check</h2></div>{model.screenings[0] && <span className={`status ${model.screenings[0].result === "clear" ? "status-success" : "status-danger"}`}><i />{displayLabel(model.screenings[0].result)}</span>}</div>
        {model.screenings[0] ? <div className="screening-latest"><span><small>LATEST CHECK</small><b>{model.screenings[0].provider}</b><em>{new Date(model.screenings[0].screenedAt).toLocaleString("en-GB")} · {model.screenings[0].recordedBy}</em></span><span><small>REFERENCE</small><b>{model.screenings[0].reference ?? "Not supplied"}</b><em>{model.screenings[0].notes ?? "No additional note"}</em></span></div> : <EmptyState title="No screening evidence" copy="Record the result produced by the broker's screening provider or documented manual process." />}
        {hasPermission(role, COMPLIANCE_PERMISSIONS.screeningRecord) && <div className="screening-form"><label>Result<BrandSelect value={screeningResult} onChange={setScreeningResult} ariaLabel="Screening result" options={[{ value: "clear", label: "Clear" }, { value: "potential_match", label: "Potential match" }, { value: "confirmed_match", label: "Confirmed match" }]} /></label><label>Provider or process<input value={screeningProvider} onChange={(event) => setScreeningProvider(event.target.value)} maxLength={120} placeholder="Provider or manual screening process" /></label><label>Reference<input value={screeningReference} onChange={(event) => setScreeningReference(event.target.value)} maxLength={160} placeholder="Case or search reference" /></label><label>Note<input value={screeningNotes} onChange={(event) => setScreeningNotes(event.target.value)} maxLength={1000} placeholder="Optional match rationale" /></label><button className="btn primary small" disabled={busy === "screening" || screeningProvider.trim().length < 2} onClick={() => void recordScreening()}>{busy === "screening" ? "Recording…" : "Record screening"}</button></div>}
      </section>
      <section className="panel document-card statement-card"><div className="panel-head"><div><span className="eyebrow">CLIENT REPORTING</span><h2>Account statement</h2></div><span className="account-number">XLSX</span></div><p>Generate a point-in-time statement containing cash movements, trades and holdings recorded in Frank.</p>{hasPermission(role, COMPLIANCE_PERMISSIONS.statementExport) ? <div className="statement-period"><label>From<input type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} /></label><label>To<input type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} /></label><button className="btn secondary" disabled={busy === "statement" || !statementFrom || !statementTo || statementTo < statementFrom} onClick={() => void downloadStatement()}>{busy === "statement" ? "Generating…" : "Download statement"}</button></div> : <div className="settings-note">Your role cannot generate client statements.</div>}</section>
      <section className="panel document-card onboarding-documents"><div className="panel-head"><div><span className="eyebrow">ONBOARDING DOCUMENTS</span><h2>Identity and authority</h2></div><span className="account-number">{model.documents.kyc.length} received</span></div>
        {(model.documents.expected ?? []).map((type) => {
          const document = model.documents.kyc.find((item) => item.type === type);
          return <div className="document-review-row" key={type}><span><b>{displayLabel(type)}</b><small>{document ? `${document.name}${document.sizeBytes ? ` · ${(document.sizeBytes / 1024).toFixed(0)} KB` : ""}${document.uploadedAt ? ` · ${new Date(document.uploadedAt).toLocaleDateString("en-GB")}` : ""}` : "Not received"}</small>{document?.rejectionReason && <em>{document.rejectionReason}</em>}</span><strong data-status={document?.status ?? "not_received"}>{document ? displayLabel(document.status) : "Not received"}</strong><div>{canAdjust && <label className="btn secondary small broker-file-button">{busy === `upload-${type}` ? "Uploading…" : document ? "Replace file" : "Upload for client"}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClientDocument(type, file); event.currentTarget.value = ""; }} /></label>}{document?.hasFile && <a className="btn secondary small" href={`/api/clients/${encodeURIComponent(selected.id)}/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Open</a>}{document && hasPermission(role, "approve") && document.status !== "approved" && <button className="btn primary small" disabled={busy === document.id} onClick={() => void reviewEvidence("documents", document.id, "approve")}>Approve</button>}{document && hasPermission(role, "reject") && document.status !== "rejected" && <button className="btn danger small" disabled={busy === document.id} onClick={() => { setEvidenceRejection({ kind: "documents", id: document.id, label: displayLabel(type) }); setEvidenceRejectionReason(""); }}>Not approve</button>}</div></div>;
        })}
        {canAdjust && model.client.kycStatus !== "approved" && <div className="record-resolution-actions"><button className="btn primary small" disabled={Boolean(busy)} onClick={() => void act("complete_kyc_review", undefined, "Required KYC documents reviewed and approved")}>Complete KYC review</button></div>}
      </section>
      <section className="panel document-card linked-bank-review"><div className="panel-head"><div><span className="eyebrow">LINKED BANKS</span><h2>Withdrawal destinations</h2></div><span className="account-number">{model.linkedBanks?.length ?? 0} of 3</span></div>{model.linkedBanks?.length ? model.linkedBanks.map((bank) => <div className="document-review-row" key={bank.id}><span><b>{bank.bankName}</b><small>{bank.accountNumberMasked} · {bank.accountHolderName}</small>{bank.rejectionReason && <em>{bank.rejectionReason}</em>}</span><strong data-status={bank.status}>{displayLabel(bank.status)}</strong><div>{hasPermission(role, "approve") && bank.status !== "approved" && <button className="btn primary small" disabled={busy === bank.id} onClick={() => void reviewEvidence("bank-accounts", bank.id, "approve")}>Approve</button>}{hasPermission(role, "reject") && bank.status !== "rejected" && <button className="btn danger small" disabled={busy === bank.id} onClick={() => { setEvidenceRejection({ kind: "bank-accounts", id: bank.id, label: `${bank.bankName} account` }); setEvidenceRejectionReason(""); }}>Not approve</button>}</div></div>) : <EmptyState title="No linked banks" copy="Linked bank accounts will appear here when the client submits them." />}</section>
      <section className="panel document-card"><div className="panel-head"><div><span className="eyebrow">LEGAL ACCEPTANCE</span><h2>Accepted agreements</h2></div></div>{model.documents.legal.length ? model.documents.legal.map((document) => <div className="document-row" key={document.id}><span><b>{document.name}</b><small>Version {document.version} · {new Date(document.acceptedAt).toLocaleDateString("en-GB")}</small></span><strong>{displayLabel(document.status)}</strong></div>) : <EmptyState title="No legal acceptance" copy="The current brokerage terms have not been accepted by this client." />}</section>
      <section className="panel document-card"><div className="panel-head"><div><span className="eyebrow">CONTRACT NOTES</span><h2>Trade documents</h2></div></div>{model.documents.contractNotes.length ? model.documents.contractNotes.map((document) => <button className="document-row" key={document.orderId} onClick={() => openOrder(document.orderId)}><span><b>{document.number ?? `Contract note for ${document.orderId}`}</b><small>{document.generatedAt ? new Date(document.generatedAt).toLocaleString("en-GB") : "Generation required"}</small></span><strong>{displayLabel(document.status)}</strong></button>) : <EmptyState title="No contract notes" copy="Contract notes become available after trade capture and controlled generation." />}</section>
    </div>}

    {tab === "conversations" && selected && <ClientConversationsTab clientId={selected.id} role={role} onMessage={setMessage} />}
    {tab === "timeline" && <>
      {openTasks.length > 0 && <section className="panel crm-task-group">
        <div className="panel-head"><div><span className="eyebrow">OUTSTANDING</span><h2>{openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"}</h2></div></div>
        <div className="crm-task-list">{openTasks.map((task) => <TaskCard key={task.id} task={task} role={role} busy={busy === task.id} onStatus={(item, next) => void taskAction(item.id, { action: "status", status: next })} onEscalate={(item) => void taskAction(item.id, { action: "escalate", escalated: !item.escalated })} />)}</div>
      </section>}
      <ActivityTimeline data={{
        threads: model.conversations ?? [],
        tasks: model.tasks ?? [],
        cases: model.cases ?? [],
        orders: model.orders,
        transactions: model.transactions.map((row) => ({ id: row.id, type: row.type, amount: row.amount ?? row.credit - row.debit, valueDate: row.createdAt, reference: row.reference })),
        documents: model.documents.kyc.map((row) => ({ id: row.id, documentType: row.type ?? row.name, status: row.status, uploadedAt: row.uploadedAt ?? "" })).filter((row) => row.uploadedAt),
        notes: model.notes,
        auditTrail: model.auditTrail.map((row) => ({ id: row.id, action: row.action, summary: row.reason, createdAt: row.timestamp, actor: row.user, entityType: row.entityType, entityId: row.entityId })),
      }} onOpenRecord={(type, id) => {
        if (type === "thread") setTab("conversations");
        else if (type === "order") { const order = orders.find((item) => item.id === id); if (order) onOpenOrder(order); else setTab("orders"); }
        else if (type === "transaction") setTab("transactions");
        else if (type === "document") setTab("documents");
        else setTab("audit");
      }} />
    </>}
    {tab === "notes" && <div className="notes-layout"><section className="panel note-composer"><div className="panel-head"><div><span className="eyebrow">INTERNAL ONLY</span><h2>Add broker note</h2></div></div>{canAdjust ? <div className="note-form"><label>Category<BrandSelect value={noteCategory} onChange={setNoteCategory} ariaLabel="Note category" options={["general", "compliance", "support", "trading", "settlement"].map((category) => ({ value: category, label: displayLabel(category) }))} /></label><label>Note<textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Record a concise operational fact, decision, or follow-up…" rows={5} /></label><small>Internal notes are visible only to broker staff and are permanently audit logged.</small><button className="btn primary" disabled={busy === "add_note" || noteText.trim().length < 3} onClick={() => void act("add_note")}>{busy === "add_note" ? "Adding note…" : "Add internal note"}</button></div> : <div className="permission-note">Read-only role: internal notes can be viewed but not created.</div>}</section><section className="panel notes-list"><div className="panel-head"><div><span className="eyebrow">BROKER RECORD</span><h2>Internal notes</h2></div></div>{model.notes.length ? model.notes.map((note) => <article key={note.id}><span>{displayLabel(note.category)}</span><p>{note.text}</p><footer><b>{note.createdBy}</b><time>{new Date(note.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time><em>{displayLabel(note.visibility)}</em></footer></article>) : <EmptyState title="No internal notes" copy="Authorized broker users can record general, compliance, support, trading, or settlement notes." />}</section></div>}

    {tab === "audit" && <section className="panel client-audit"><div className="panel-head"><div><span className="eyebrow">CLIENT CONTROL RECORD</span><h2>Audit trail</h2></div></div>{model.auditTrail.length ? model.auditTrail.map((entry) => <div key={entry.id}><i /><time>{new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<b>{new Date(entry.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b></time><span><small>{entry.user} · {displayLabel(entry.entityType)} {entry.entityId ?? ""}</small><h3>{displayLabel(entry.action)}</h3><p>{entry.reason}</p>{(entry.oldValue || entry.newValue) && <details><summary>Recorded change</summary><pre>{entry.oldValue ? `Before: ${entry.oldValue}\n` : ""}{entry.newValue ? `After: ${entry.newValue}` : ""}</pre></details>}</span></div>) : <EmptyState title="No client audit events" copy="Sensitive client, order, trade, ledger, settlement, consent, restriction, and note events will appear here." />}</section>}
    </>}
  </>;
}
