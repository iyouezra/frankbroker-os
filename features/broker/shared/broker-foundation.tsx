"use client";

import type { ReactNode } from "react";
import { demoClients, demoInstruments, initialOrders, type BrokerClient, type DemoOrder } from "../../../lib/demo-data";
import { hasPermission, type OrderStatus, type Role } from "../../../lib/frank";
import { orderResponsibility } from "../../../lib/order-log";

export type View = "dashboard" | "performance" | "market" | "orders" | "clients" | "crm" | "crm_tasks" | "crm_cases" | "cash" | "settlement" | "reconciliation" | "ledger" | "advisory" | "issuers" | "reports" | "audit" | "users" | "settings" | "risk_my" | "risk_overview" | "risk_monitoring" | "risk_clients" | "risk_employee" | "risk_reports" | "risk_controls";
export type Drawer = "new" | "client" | "detail" | "trade" | "contract" | "crm_thread" | null;
export type NewOrderValue = { accountId: string; instrumentId: string; side: "buy" | "sell"; quantity: string; price: string; orderType: string; validity: string; notes: string; submissionReference: string; source: "digital" | "in_person" | "neway" | "phone"; verificationChannel: "sms" | "email"; verificationId: string; verificationCode: string; demoCode: string };
export type OnboardingDocumentType = "proof_of_address" | "business_license" | "tin_certificate" | "certificate_of_incorporation" | "article_of_association";
export type NewClientBank = { id: string; bankName: string; accountNumber: string; accountHolderName: string };
export type NewClientValue = {
  clientType: "individual" | "corporate" | "institution";
  fullName: string;
  phone: string;
  email: string;
  faydaId: string;
  tin: string;
  address: string;
  proofOfAddressType: string;
  proofOfAddressReference: string;
  businessRegistrationNumber: string;
  authorizedRepresentativeName: string;
  beneficialOwnerName: string;
  signatoryAuthorityConfirmed: boolean;
  csdReference: string;
  riskRating: "standard" | "enhanced" | "review";
  termsAccepted: boolean;
  electronicDeliveryConsent: boolean;
  onboardingChannel: "digital" | "in_person" | "neway" | "phone";
  externalClientReference: string;
  nationality: string;
  countryOfResidence: string;
  occupation: string;
  sourceOfFunds: string;
  investmentObjective: string;
  taxResidency: string;
  pepStatus: "not_pep" | "pep" | "related_to_pep";
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  documentFiles: Partial<Record<OnboardingDocumentType, File>>;
  linkedBanks: NewClientBank[];
};
export type ClientDirectoryResponse = {
  clients: BrokerClient[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: {
    types: { all: number; individual: number; corporate: number; institution: number };
    statuses: Record<string, number>;
  };
};
export type TradeValue = { quantity: string; price: string; tradeDate: string; captureReference: string };
export type ReconException = { id: string; reference: string; exceptionType: string; expectedValue: string | null; actualValue: string | null; status: string; resolutionNotes: string | null };
export type ReconBatch = { id: string; batchDate: string; fileName: string | null; totalRecords: number; matchedRecords: number; exceptionRecords: number; status: string; reviewedAt?: string | null; reviewedBy?: string | null; evidenceReference?: string | null; exceptions: ReconException[] };
export type AuditEntry = { id?: string; time: string; actor: string; action: string; detail: string; entity: string };
export type BrokerInstrument = { id: string; symbol: string; name: string; asset: string; issuer: string; status: string; currency: string; lot: number; tick: number; cycle: string; price: number; coupon?: string; maturity?: string };
export type TenantFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
export type TenantControls = { makerChecker: boolean; approvalThreshold: number; clientDailyLimit: number; brokerageFeePct: number; minimumFee: number; settlementCycle: string; allowedOrderTypes: string[]; feeRules: TenantFeeRule[]; marketFeeScheduleConfigured: boolean };
export type TenantFeatures = { manualTradeCapture: boolean; [key: string]: boolean };
export type TenantModules = { dealer_operations: boolean; investor_servicing: boolean; issuer_advisory: boolean };
export type TenantInfo = { name: string; license: string; primaryColor: string };
export type TenantApiInstrument = { id: string; symbol: string; name: string; assetClass: string; issuer: string; status: string; currency: string; price: number; lotSize: number; tickSize: number; settlementCycle: string };
export type TenantApiResult = { tenant?: { id?: string; tradingName?: string; licenseNumber?: string; primaryColor?: string; currentUser?: { id: string; fullName: string; email: string }; features?: Partial<TenantFeatures>; modules?: Partial<TenantModules>; profile?: { businessType?: string } | null; availableRoles?: Role[]; currentRole?: Role; controls?: Partial<TenantControls> | null }; instruments?: TenantApiInstrument[] };
export type CashPoolView = { id: string; bankName: string; accountName: string; accountNumberMasked: string; currency: string; purpose: string; status: string; bookBalance: number; statementBalance: number; beneficialTotal: number; ownershipVariance: number; bankVariance: number; lastReconciledAt: string | null };
export type CashMovementView = { id: string; type: "deposit" | "withdrawal"; amount: number; currency: string; status: string; bankReference: string | null; proofReference: string | null; destinationBankName: string | null; destinationAccountName: string | null; destinationAccountMasked: string | null; channel: string; submissionReference: string; submittedAt: string; reviewedAt?: string | null; completedAt?: string | null; rejectionReason: string | null; failureReason: string | null; notes?: string | null; proof?: { name: string; mimeType: string; sizeBytes: number; uploadedAt: string } | null; client?: { id: string; code: string; name: string }; account?: { id: string; number: string }; pool?: { id: string; bankName: string; accountName: string; accountNumberMasked: string; purpose: string } };
export type CashOperationsData = { summary: { bankBookTotal: number; statementTotal: number; beneficialTotal: number; pendingDeposits: number; pendingWithdrawals: number }; pools: CashPoolView[]; movements: CashMovementView[]; linkedBanks?: Array<{ id: string; clientId: string; bankName: string; accountHolderName: string; accountNumberMasked: string }> };
export type BrokerCashInput = { clientId: string; accountId?: string; pooledBankAccountId: string; movementType: "deposit" | "withdrawal"; amount: number; submissionReference: string; bankReference?: string; proofReference?: string; destinationBankName?: string; destinationAccountName?: string; destinationAccountMasked?: string; linkedBankAccountId?: string; sourceLinkedBankAccountId?: string; notes?: string };
export type Client360Tab = "overview" | "assets" | "orders" | "trades" | "transactions" | "conversations" | "timeline" | "settlements" | "documents" | "notes" | "audit";

// ---------------------------------------------------------------------------
// Investor-servicing conversations
// ---------------------------------------------------------------------------

export type CrmAttachment = { id: string; name: string; mimeType: string; sizeBytes: number; visibility?: string };
export type CrmMessage = {
  id: string;
  body: string;
  createdAt: string;
  visibility: string;
  authorType: string;
  authorUserId: string | null;
  authorName: string;
  attachments: CrmAttachment[];
};
export type CrmThreadSummary = {
  id: string;
  subject: string;
  category: string;
  status: string;
  statusLabel: string;
  priority: string;
  relatedType: string | null;
  relatedId: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  client: { id: string; code: string; name: string } | null;
  account: { id: string; number: string } | null;
  messageCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: number;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};
export type CrmThreadDetail = CrmThreadSummary & {
  messages: CrmMessage[];
  serviceRequest?: {
    id: string;
    requestType: string;
    status: string;
    subject: string;
    resolutionNotes: string | null;
    resolvedAt: string | null;
    allowedDecisions: Array<"resolve" | "reject" | "approve_closure">;
  } | null;
  serviceCase?: { id: string; status: string } | null;
};
export type CrmThreadsResponse = {
  threads: CrmThreadSummary[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: { unreadThreads: number; mine: number; unassigned: number };
};
export type CrmFocus = { threadId?: string; clientId?: string; status?: string } | null;
export type NewThreadValue = { clientId: string; category: string; priority: string; subject: string; body: string; relatedType: string; relatedId: string };

export type CrmTaskView = {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  status: string;
  statusLabel: string;
  priority: string;
  escalated: boolean;
  dueDate: string | null;
  bucket: string;
  threadId: string | null;
  caseId: string | null;
  relatedType: string | null;
  relatedId: string | null;
  client: { id: string; code: string; name: string } | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  completionNote: string | null;
  createdAt: string;
};
export type CrmTasksResponse = {
  tasks: CrmTaskView[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: { overdue: number; today: number; upcoming: number; no_due_date: number; completed: number };
};
export type CrmCaseView = {
  id: string;
  subject: string;
  category: string;
  severity: string;
  status: string;
  statusLabel: string;
  client: { id: string; code: string; name: string } | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  threadId: string | null;
  threadSubject: string | null;
  openedAt: string;
  targetResolutionAt: string | null;
  overdue: boolean;
  internalFindings: string | null;
  resolutionSummary: string | null;
  regulatoryStatus: string;
  regulatoryStatusAt: string | null;
  regulatoryComment: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
};
export type CrmCasesResponse = {
  cases: CrmCaseView[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: { open: number; overdue: number };
};
export type CrmAssignmentView = {
  id: string;
  clientId: string;
  primaryOfficerId: string | null;
  primaryOfficerName: string | null;
  primaryOfficerRole: string | null;
  backupOfficerId: string | null;
  backupOfficerName: string | null;
  team: string | null;
  branch: string | null;
  note: string | null;
  assignedByName: string | null;
  assignedAt: string;
  endedAt: string | null;
  current: boolean;
};

/** Offline demonstration follow-ups and cases so both screens render without a database. */
export const fallbackCrmTasks: CrmTaskView[] = [
  { id: "TSK-DEMO01", title: "Call Selam about the held TELE order", description: "Explain why the limit price has not filled and agree next steps.", taskType: "call_investor", status: "open", statusLabel: "Open", priority: "high", escalated: false, dueDate: "2026-07-24", bucket: "overdue", threadId: "THR-DEMO01", caseId: null, relatedType: "order", relatedId: "ORD-INV-0003", client: { id: "cli_investor_demo", code: "CL-INV-001", name: "Selam Mekonnen" }, assignedToUserId: "usr_service", assignedToName: "Bethel Tesfaye", createdByName: "Mekdes Tadesse", completedAt: null, completedByName: null, completionNote: null, createdAt: "2026-07-24T09:20:00Z" },
  { id: "TSK-DEMO02", title: "Request bank statement for second account", description: null, taskType: "request_document", status: "awaiting_investor", statusLabel: "Awaiting investor", priority: "normal", escalated: false, dueDate: "2026-07-26", bucket: "upcoming", threadId: null, caseId: null, relatedType: null, relatedId: null, client: { id: "cli_meron", code: "CL-10041", name: "Meron Bekele" }, assignedToUserId: "usr_relationship", assignedToName: "Kalkidan Alemu", createdByName: "Bethel Tesfaye", completedAt: null, completedByName: null, completionNote: null, createdAt: "2026-07-23T11:20:00Z" },
  { id: "TSK-DEMO03", title: "Resolve fee complaint", description: "Review the contract note against the agreed schedule.", taskType: "resolve_complaint", status: "in_progress", statusLabel: "In progress", priority: "urgent", escalated: true, dueDate: "2026-07-25", bucket: "today", threadId: "THR-DEMO0005", caseId: "CASE-DEMO01", relatedType: "order", relatedId: "ORD-2026-1046", client: { id: "cli_wegagen", code: "CL-10008", name: "Wegagen Pension Fund" }, assignedToUserId: "usr_relationship", assignedToName: "Kalkidan Alemu", createdByName: "Mekdes Tadesse", completedAt: null, completedByName: null, completionNote: null, createdAt: "2026-07-24T07:45:00Z" },
  { id: "TSK-DEMO04", title: "Schedule mid-year portfolio review", description: null, taskType: "portfolio_review", status: "completed", statusLabel: "Completed", priority: "low", escalated: false, dueDate: "2026-07-20", bucket: "completed", threadId: null, caseId: null, relatedType: null, relatedId: null, client: { id: "cli_wegagen", code: "CL-10008", name: "Wegagen Pension Fund" }, assignedToUserId: "usr_relationship", assignedToName: "Kalkidan Alemu", createdByName: "Kalkidan Alemu", completedAt: "2026-07-20T15:00:00Z", completedByName: "Kalkidan Alemu", completionNote: "Review booked for 2 August.", createdAt: "2026-07-18T09:00:00Z" },
];

export const fallbackCrmCases: CrmCaseView[] = [
  { id: "CASE-DEMO01", subject: "Contract note shows the wrong fee", category: "complaint", severity: "high", status: "under_review", statusLabel: "Under review", client: { id: "cli_wegagen", code: "CL-10008", name: "Wegagen Pension Fund" }, assignedToUserId: "usr_relationship", assignedToName: "Kalkidan Alemu", threadId: "THR-DEMO0005", threadSubject: "Contract note shows the wrong fee", openedAt: "2026-07-24T07:35:00Z", targetResolutionAt: "2026-07-29T07:35:00Z", overdue: false, internalFindings: "Fee schedule v1.0 applied; agreed rate was v1.1. Checking effective dates.", resolutionSummary: null, regulatoryStatus: "pending", regulatoryStatusAt: null, regulatoryComment: null, resolvedAt: null, closedAt: null },
  { id: "CASE-DEMO02", subject: "Withdrawal delayed beyond agreed window", category: "service_failure", severity: "medium", status: "resolved", statusLabel: "Resolved", client: { id: "cli_meron", code: "CL-10041", name: "Meron Bekele" }, assignedToUserId: "usr_service", assignedToName: "Bethel Tesfaye", threadId: null, threadSubject: null, openedAt: "2026-07-15T10:00:00Z", targetResolutionAt: "2026-07-25T10:00:00Z", overdue: false, internalFindings: "Bank cut-off missed on the first attempt.", resolutionSummary: "Payment released the next business day and the investor was told what happened.", regulatoryStatus: "pending", regulatoryStatusAt: null, regulatoryComment: null, resolvedAt: "2026-07-17T09:30:00Z", closedAt: null },
];

/** Offline demonstration conversations so the inbox renders without a database. */
export const fallbackCrmThreads: CrmThreadDetail[] = [
  {
    id: "THR-DEMO01", subject: "Why was my TELE order held?", category: "order", status: "pending_broker", statusLabel: "Awaiting broker",
    priority: "high", relatedType: "order", relatedId: "ORD-INV-0003", assignedToUserId: null, assignedToName: null,
    client: { id: "cli_investor_demo", code: "CL-INV-001", name: "Selam Mekonnen" }, account: { id: "acc_investor_demo", number: "INV-00001-01" },
    messageCount: 3, lastMessageAt: "2026-07-24T09:12:00Z", lastMessagePreview: "I expected it to fill yesterday - can you check?", unread: 1,
    createdAt: "2026-07-24T08:40:00Z", resolvedAt: null, closedAt: null,
    messages: [
      { id: "MSG-D01", body: "I placed a buy order for TELE yesterday and it still has not filled. Can you check what happened?", createdAt: "2026-07-24T08:40:00Z", visibility: "shared", authorType: "investor", authorUserId: null, authorName: "Investor", attachments: [] },
      { id: "MSG-D02", body: "Limit price is below the current market. Confirm with the client before amending.", createdAt: "2026-07-24T08:55:00Z", visibility: "internal", authorType: "system", authorUserId: "usr_trader", authorName: "Dawit Alemu", attachments: [] },
      { id: "MSG-D03", body: "I expected it to fill yesterday - can you check?", createdAt: "2026-07-24T09:12:00Z", visibility: "shared", authorType: "investor", authorUserId: null, authorName: "Investor", attachments: [] },
    ],
  },
  {
    id: "THR-DEMO02", subject: "Withdrawal still pending", category: "cash", status: "pending_client", statusLabel: "Awaiting investor",
    priority: "normal", relatedType: "cash_movement", relatedId: "MOV-DEMO-WDR-001", assignedToUserId: "usr_service", assignedToName: "Bethel Tesfaye",
    client: { id: "cli_meron", code: "CL-10041", name: "Meron Bekele" }, account: { id: "acc_meron", number: "TRD-10041-01" },
    messageCount: 2, lastMessageAt: "2026-07-23T14:02:00Z", lastMessagePreview: "Could you confirm the destination account name?", unread: 0,
    createdAt: "2026-07-23T13:20:00Z", resolvedAt: null, closedAt: null,
    messages: [
      { id: "MSG-D04", body: "My withdrawal has not arrived yet. When will it be paid?", createdAt: "2026-07-23T13:20:00Z", visibility: "shared", authorType: "investor", authorUserId: null, authorName: "Investor", attachments: [] },
      { id: "MSG-D05", body: "Could you confirm the destination account name?", createdAt: "2026-07-23T14:02:00Z", visibility: "shared", authorType: "broker", authorUserId: "usr_service", authorName: "Bethel Tesfaye", attachments: [] },
    ],
  },
  {
    id: "THR-DEMO03", subject: "Please share my mid-year statement", category: "portfolio", status: "resolved", statusLabel: "Resolved",
    priority: "low", relatedType: null, relatedId: null, assignedToUserId: "usr_relationship", assignedToName: "Kalkidan Alemu",
    client: { id: "cli_wegagen", code: "CL-10008", name: "Wegagen Pension Fund" }, account: { id: "acc_wegagen", number: "TRD-10008-01" },
    messageCount: 2, lastMessageAt: "2026-07-22T10:30:00Z", lastMessagePreview: "Statement attached - let us know if anything looks off.", unread: 0,
    createdAt: "2026-07-22T09:05:00Z", resolvedAt: "2026-07-22T10:31:00Z", closedAt: null,
    messages: [
      { id: "MSG-D06", body: "Could you send the mid-year portfolio statement for our records?", createdAt: "2026-07-22T09:05:00Z", visibility: "shared", authorType: "investor", authorUserId: null, authorName: "Investor", attachments: [] },
      { id: "MSG-D07", body: "Statement attached - let us know if anything looks off.", createdAt: "2026-07-22T10:30:00Z", visibility: "shared", authorType: "broker", authorUserId: "usr_relationship", authorName: "Kalkidan Alemu", attachments: [] },
    ],
  },
];
export type Client360Detail = {
  client: { id: string; code: string; name: string; type: string; phone: string | null; email: string | null; broker: string; branch: string | null; openedAt: string; lastActivityAt: string | null; kycStatus: string; clientStatus: string; accountStatus: string; tradingStatus: string; csdReference: string | null; riskRating: string; createdBy: string | null; submittedAt: string | null; approvedBy: string | null; approvedAt: string | null; rejectionReason: string | null; onboardingChannel?: string; address?: string | null; identityMasked?: string | null; taxIdMasked?: string | null; businessRegistrationNumber?: string | null; authorizedRepresentativeName?: string | null; beneficialOwners?: unknown; signatoryAuthorityConfirmed?: boolean; pepStatus?: string };
  readiness: { canTrade: boolean; blockingReasons: string[]; items: Array<{ key: string; label: string; state: "pass" | "fail" | "warning"; detail: string }> };
  cash: { total: number; available: number; blocked: number; unsettled: number; pendingDeposits: number; pendingWithdrawals: number; currency: string } | null;
  holdings: Array<{ id: string; instrumentId: string; symbol: string; name: string; assetClass: string; total: number; available: number; blocked: number; unsettled: number; averageCost: number; lastPrice: number; marketValue: number; updatedAt: string }>;
  orders: Array<{ id: string; createdAt: string; instrumentId: string; symbol: string; side: "buy" | "sell"; quantity: number; price: number; filledQuantity: number; remainingQuantity: number; status: OrderStatus; source: string; trader: string; actionRequired: string | null; availableActions: string[] }>;
  trades: Array<{ id: string; orderId: string; tradeDate: string; settlementDate: string; instrumentId: string; symbol: string; side: "buy" | "sell"; quantity: number; executionPrice: number; gross: number; fees: number; net: number; settlementStatus: string; cashStatus: string; securitiesStatus: string; exceptionNotes: string | null; contractNoteNumber: string | null; contractNoteGeneratedAt: string | null; capturedBy: string }>;
  transactions: Array<{ id: string; ledger: string; createdAt: string; type: string; instrument: string | null; debit: number; credit: number; amount: number | null; quantity: number | null; availableImpact: number; blockedImpact: number; unsettledImpact: number; runningBalance: number; reference: string; orderId: string | null; tradeId: string | null; status: string; createdBy: string; notes: string }>;
  settlements: Array<{ id: string; tradeId: string; orderId: string; symbol: string; tradeDate: string; settlementDate: string; cashStatus: string; securitiesStatus: string; status: string; exception: boolean; notes: string | null }>;
  legal: { required: boolean; accepted: boolean; latestRequiredVersion: string | null; latestAcceptedVersion: string | null; lastAcceptedAt: string | null; missingDocuments: string[] };
  restrictions: { restricted: boolean; reason: string | null; restrictedAt: string | null; flags: string[] };
  documents: {
    expected?: string[];
    kyc: Array<{ id: string; type?: string; name: string; mimeType?: string; sizeBytes?: number; source?: string; status: string; uploadedAt?: string; reviewedAt?: string | null; rejectionReason?: string | null; hasFile?: boolean }>;
    legal: Array<{ id: string; name: string; version: string; acceptedAt: string; status: string }>;
    contractNotes: Array<{ orderId: string; number: string | null; generatedAt: string | null; status: string }>;
    statements: Array<{ type: string; status: string }>;
  };
  screenings: Array<{ id: string; provider: string; result: string; reference: string | null; notes: string | null; screenedAt: string; recordedBy: string }>;
  linkedBanks?: Array<{ id: string; bankName: string; accountNumberMasked: string; accountHolderName: string; source: string; status: string; createdAt: string; reviewedAt: string | null; rejectionReason: string | null }>;
  requests: NonNullable<BrokerClient["serviceRequests"]>;
  notes: Array<{ id: string; text: string; category: string; visibility: string; createdBy: string; createdAt: string }>;
  auditTrail: Array<{ id: string; timestamp: string; user: string; action: string; entityType: string; entityId: string | null; oldValue: string | null; newValue: string | null; reason: string }>;
  // Servicing context. Optional because the offline fallback model omits them.
  conversations?: Array<{ id: string; subject: string; category: string; status: string; assignedToName: string | null; lastMessageAt: string; lastMessagePreview: string | null; createdAt: string }>;
  tasks?: CrmTaskView[];
  cases?: CrmCaseView[];
  relationship?: { current: CrmAssignmentView | null; history: CrmAssignmentView[] };
};

export const fallbackControls: TenantControls = {
  makerChecker: true,
  approvalThreshold: 250_000,
  clientDailyLimit: 2_500_000,
  brokerageFeePct: 0.5,
  minimumFee: 25,
  settlementCycle: "T+2",
  allowedOrderTypes: ["Market", "Limit", "Stop-loss"],
  feeRules: [],
  marketFeeScheduleConfigured: false,
};
export const fallbackFeatures: TenantFeatures = { manualTradeCapture: true };
export const fallbackModules: TenantModules = { dealer_operations: true, investor_servicing: true, issuer_advisory: false };
export const fallbackCashOperations: CashOperationsData = {
  summary: { bankBookTotal: 19_449_700, statementTotal: 19_449_700, beneficialTotal: 19_449_700, pendingDeposits: 1, pendingWithdrawals: 0 },
  pools: [
    { id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", status: "active", bookBalance: 13_940_968.75, statementBalance: 16_449_700, beneficialTotal: 13_940_968.75, ownershipVariance: 0, bankVariance: 2_508_731.25, lastReconciledAt: "2026-07-14T16:00:00Z" },
    { id: "pool_aby_fixed_income", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Fixed Income Client Money", accountNumberMasked: "•••• 7721", currency: "ETB", purpose: "fixed_income", status: "active", bookBalance: 3_000_000, statementBalance: 3_000_000, beneficialTotal: 3_000_000, ownershipVariance: 0, bankVariance: 0, lastReconciledAt: "2026-07-14T16:00:00Z" },
  ],
  movements: [{ id: "MOV-DEMO-DEP-001", type: "deposit", amount: 15_000, currency: "ETB", status: "pending_verification", bankReference: "CBE-FT-908231", proofReference: "mobile-transfer-receipt", destinationBankName: null, destinationAccountName: null, destinationAccountMasked: null, channel: "investor_portal", submissionReference: "INV-DEMO-FUND-001", submittedAt: "2026-07-16T08:42:00Z", rejectionReason: null, failureReason: null, client: { id: "cli_investor_demo", code: "CL-INV-001", name: "Selam Mekonnen" }, account: { id: "acc_investor_demo", number: "INV-00001-01" }, pool: { id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", purpose: "general" } }],
};
export const fallbackInstruments: BrokerInstrument[] = demoInstruments;
export const newClientDefaults = (): NewClientValue => ({
  clientType: "individual",
  fullName: "",
  phone: "",
  email: "",
  faydaId: "",
  tin: "",
  address: "",
  proofOfAddressType: "Drivers License",
  proofOfAddressReference: "",
  businessRegistrationNumber: "",
  authorizedRepresentativeName: "",
  beneficialOwnerName: "",
  signatoryAuthorityConfirmed: false,
  csdReference: "",
  riskRating: "standard",
  termsAccepted: false,
  electronicDeliveryConsent: true,
  onboardingChannel: "in_person",
  externalClientReference: "",
  nationality: "Ethiopian",
  countryOfResidence: "Ethiopia",
  occupation: "",
  sourceOfFunds: "",
  investmentObjective: "Long-term growth",
  taxResidency: "Ethiopia",
  pepStatus: "not_pep",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  documentFiles: {},
  linkedBanks: [{ id: crypto.randomUUID(), bankName: "Commercial Bank of Ethiopia", accountNumber: "", accountHolderName: "" }],
});

export function displayLabel(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").split(" ").filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

export function normalizedOrderType(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

export function calculateConfiguredAmounts(side: "buy" | "sell", quantity: number, price: number, feePct: number, minimumFee = 0, feeRule?: TenantFeeRule) {
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const gross = quantity * price;
  const brokeragePct = feeRule?.brokeragePct ?? feePct;
  const brokerageMinimum = feeRule?.minimumFee ?? minimumFee;
  const percentageFee = money(gross * (brokeragePct / 100));
  const brokerage = gross > 0 ? money(Math.min(feeRule?.maximumFee ?? Number.POSITIVE_INFINITY, Math.max(brokerageMinimum, percentageFee))) : 0;
  const regulator = money(gross * (feeRule?.regulatorPct ?? 0) / 100);
  const exchange = money(gross * (feeRule?.exchangePct ?? 0) / 100);
  const csd = money(gross * (feeRule?.csdPct ?? 0) / 100);
  const fees = money(brokerage + regulator + exchange + csd);
  const net = money(side === "buy" ? gross + fees : gross - fees);
  return { gross, fees, net, brokerage, regulator, exchange, csd };
}

export type NavItem = { id: View; label: string; icon: string; module?: keyof TenantModules; roles?: Role[]; children?: NavItem[] };
export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "market", label: "Market Watch", icon: "performance", module: "dealer_operations" },
  ] },
  { label: "Clients", items: [
    // The client-servicing surfaces live as sub-nav under the directory: opening
    // "Clients & accounts" shows the directory and reveals these beneath it.
    { id: "clients", label: "Clients & accounts", icon: "clients", module: "investor_servicing", roles: ["broker_admin", "operations", "compliance", "relationship_officer", "service_officer"], children: [
      { id: "crm", label: "Conversations", icon: "conversations", module: "investor_servicing" },
      { id: "crm_tasks", label: "My tasks", icon: "tasks", module: "investor_servicing" },
      { id: "crm_cases", label: "Complaints", icon: "complaints", module: "investor_servicing" },
    ] },
    { id: "cash", label: "Client money", icon: "cash", module: "dealer_operations", roles: ["broker_admin", "operations", "settlement"] },
  ] },
  { label: "Trading", items: [
    { id: "orders", label: "Order log", icon: "orders", module: "dealer_operations" },
    { id: "settlement", label: "Settlement", icon: "settlement", module: "dealer_operations", roles: ["broker_admin", "settlement", "operations"] },
    { id: "reconciliation", label: "Reconciliation", icon: "reconciliation", module: "dealer_operations", roles: ["broker_admin", "settlement", "operations", "compliance"] },
  ] },
  { label: "Issuer advisory", items: [
    { id: "advisory", label: "Advisory pipeline", icon: "advisory", module: "issuer_advisory", roles: ["broker_admin", "advisory_lead", "advisory_analyst", "compliance", "management"] },
    { id: "issuers", label: "Issuers", icon: "issuers", module: "issuer_advisory", roles: ["broker_admin", "advisory_lead", "advisory_analyst", "compliance", "management"] },
  ] },
  { label: "Risk & Compliance", items: [
    { id: "risk_my", label: "My Compliance", icon: "risk", roles: ["broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "management", "advisory_lead", "advisory_analyst"] },
    { id: "risk_overview", label: "Overview", icon: "risk", roles: ["broker_admin", "compliance", "management"], children: [
      { id: "risk_monitoring", label: "Monitoring & Cases", icon: "complaints", roles: ["compliance"] },
      { id: "risk_clients", label: "Client Reviews", icon: "clients", roles: ["compliance"] },
      { id: "risk_employee", label: "Employee Conduct", icon: "users", roles: ["compliance"] },
      { id: "risk_reports", label: "Regulatory Reporting", icon: "reports", roles: ["compliance"] },
      { id: "risk_controls", label: "Controls & Audit", icon: "audit", roles: ["compliance"] },
    ] },
  ] },
  { label: "Oversight", items: [
    { id: "performance", label: "Performance", icon: "performance", roles: ["broker_admin"] },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "audit", label: "Audit trail", icon: "audit", roles: ["broker_admin", "compliance"] },
  ] },
  { label: "Finance", items: [
    { id: "ledger", label: "General ledger", icon: "ledger", module: "dealer_operations", roles: ["broker_admin", "finance", "compliance", "settlement", "management"] },
  ] },
  { label: "Administration", items: [
    { id: "users", label: "Users & roles", icon: "users", roles: ["access_admin", "broker_admin"] },
    { id: "settings", label: "Settings", icon: "settings", roles: ["broker_admin"] },
  ] },
];
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]));
export const navVisible = (item: NavItem, role: Role, modules: TenantModules = fallbackModules) => {
  if (role === "access_admin") return item.id === "users";
  if (item.id.startsWith("risk_")) return role !== "super_admin" && (!item.module || modules[item.module]) && (!item.roles || item.roles.includes(role));
  return (!item.module || modules[item.module]) && (role === "super_admin" || role === "management" || !item.roles || item.roles.includes(role));
};
export const PENDING_CASH_STATUSES = ["pending_verification", "pending_approval", "approved"];
export type QueueItem = { key: string; permission: string; roles?: Role[]; tone: "warning" | "danger" | "info"; icon: string; title: string; detail: string; onOpen: () => void };
export const queueVisible = (item: QueueItem, role: Role) => item.roles ? item.roles.includes(role) : role === "management" || role === "super_admin" || hasPermission(role, item.permission);
export const roleNames: Record<Role, string> = {
  access_admin: "Sara Alemayehu",
  broker_admin: "Mekdes Tadesse",
  trader: "Dawit Alemu",
  operations: "Hana Kebede",
  compliance: "Liya Girma",
  settlement: "Rahel Getachew",
  finance: "Tigist Bekele",
  relationship_officer: "Kalkidan Alemu",
  service_officer: "Bethel Tesfaye",
  management: "Yonas Alemayehu",
  advisory_lead: "Saron Desta",
  advisory_analyst: "Nahom Bekele",
  super_admin: "Frank",
};
export const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

const ICON_PATHS: Record<string, string> = {
  risk: "M12 3l8 4v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V7l8-4z M9 12l2 2 4-5",
  dashboard: "M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 21h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 9h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z M4 21h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z",
  orders: "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1 M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M8 11h8 M8 15h5",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  users: "M16 10h3 M16 14h3 M6.2 15a3 3 0 0 1 5.6 0 M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  conversations: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M8 9h8 M8 13h5",
  tasks: "M11 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5 M9 11l3 3L22 4 M9 15h4",
  complaints: "M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  cash: "M3 7h18v13H3z M16 13h5 M3 7l3-3h12l3 3 M7 11h5 M7 15h3",
  settlement: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  reconciliation: "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M13 6h3a2 2 0 0 1 2 2v7 M11 18H8a2 2 0 0 1-2-2V9",
  reports: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M16 13H8 M16 17H8 M10 9H8",
  audit: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2",
  ledger: "M12 3v18 M5 8h4 M5 12h4 M15 8h4 M15 12h4 M3 3h18v18H3z",
  performance: "M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3",
  advisory: "M4 20h16 M6 16l4-4 3 3 5-7 M18 8h2v2 M4 4h16v16H4z",
  issuers: "M3 21h18 M5 21V8l7-5 7 5v13 M9 21v-6h6v6 M8 10h1 M12 10h1 M16 10h1",
  settings: "M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M21 21l-4.3-4.3",
  bell: "M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  collapse: "M9 3v18 M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] ?? "";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.split(" M").map((segment, index) => <path key={index} d={(index ? "M" : "") + segment.trim()} />)}</svg>;
}

export const fallbackClients: BrokerClient[] = demoClients.map((client) => ({
  id: client.id,
  code: client.code,
  name: client.name,
  type: client.type,
  kyc: client.kyc.toLowerCase().replaceAll(" ", "_"),
  status: client.status.toLowerCase().replaceAll(" ", "_"),
  accountStatus: client.status.toLowerCase().replaceAll(" ", "_"),
  tradeEligible: client.kyc === "Approved" && client.status === "Active",
  risk: client.risk.toLowerCase(),
  totalCash: client.cash,
  availableCash: client.available,
  blockedCash: client.blocked,
  unsettledCash: 0,
  accountId: client.accountId,
  accountNumber: client.accountId.replace("acc_", "TRD-").toUpperCase(),
  termsAcceptedVersion: client.kyc === "Approved" && client.status === "Active" ? "1.0" : null,
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

export const fallbackReconBatch: ReconBatch = {
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
export const emptyReconBatch: ReconBatch = { id: "No batches", batchDate: "", fileName: null, totalRecords: 0, matchedRecords: 0, exceptionRecords: 0, status: "empty", exceptions: [] };

export const statusLabels: Record<OrderStatus, string> = {
  draft: "Draft", submitted: "Submitted", validation_failed: "Validation failed", pending_broker_review: "Pending review", approved: "Approved", rejected: "Rejected", partially_filled: "Partially filled", filled: "Filled", cancelled: "Cancelled", settlement_pending: "Settlement pending", settled: "Settled", failed: "Failed",
};
const statusTone: Record<OrderStatus, string> = {
  draft: "neutral", submitted: "info", validation_failed: "danger", pending_broker_review: "warning", approved: "brand", rejected: "danger", partially_filled: "purple", filled: "success", cancelled: "neutral", settlement_pending: "warning", settled: "success", failed: "danger",
};

export const fmt = new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 });
export const etb = (value: number) => `${fmt.format(value)} ETB`;
export const compactEtb = (value: number) => {
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `ETB ${Math.round(value / 1_000)}K`;
  return `ETB ${Math.round(value)}`;
};
export const auditTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status status-${statusTone[status]}`}><i />{statusLabels[status]}</span>;
}
export function SectionHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action && <div className="section-actions">{action}</div>}</div>;
}
export function Metric({ label, value, note, tone = "brand", onClick }: { label: string; value: string; note: string; tone?: string; onClick?: () => void }) {
  const body = <><div className="metric-top"><span>{label}</span><i /></div><strong>{value}</strong><small>{note}</small></>;
  if (onClick) return <button type="button" className={`metric metric-${tone} metric-clickable`} onClick={onClick}>{body}</button>;
  return <article className={`metric metric-${tone}`}>{body}</article>;
}
export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>✓</span><strong>{title}</strong><p>{copy}</p></div>;
}

export let BROKER_TENANT_ID = "brk_abyssinia";
/** Demo-only live binding used by legacy feature hooks until production auth owns tenant context. */
export function setDemoBrokerTenantId(tenantId: string) { BROKER_TENANT_ID = tenantId; }
export function hydrateOrders(rows: Array<Omit<DemoOrder, "time">>) {
  return rows.map((order) => ({
    ...order,
    time: new Date(order.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
    orderType: displayLabel(order.orderType),
    source: order.source.charAt(0).toUpperCase() + order.source.slice(1),
    trader: order.trader ?? "Unassigned",
    updatedAt: order.updatedAt ?? order.createdAt,
    validity: order.validity ? displayLabel(order.validity) : "Day",
    ...(order.nextAction && order.actionOwner ? {} : orderResponsibility(order.status, order.trader === "Unassigned" ? null : order.trader)),
  })) as DemoOrder[];
}
