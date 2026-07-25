"use client";

import type { ReactNode } from "react";
import { demoClients, demoInstruments, initialOrders, type BrokerClient, type DemoOrder } from "../../../lib/demo-data";
import { hasPermission, type OrderStatus, type Role } from "../../../lib/frank";
import { orderResponsibility } from "../../../lib/order-log";

export type View = "dashboard" | "performance" | "orders" | "clients" | "cash" | "settlement" | "reconciliation" | "reports" | "audit" | "users" | "settings";
export type Drawer = "new" | "client" | "detail" | "trade" | "contract" | null;
export type NewOrderValue = { accountId: string; instrumentId: string; side: "buy" | "sell"; quantity: string; price: string; orderType: string; validity: string; notes: string; submissionReference: string; source: "digital" | "in_person" | "neway" | "phone"; verificationId: string; verificationCode: string; demoCode: string };
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
export type ReconBatch = { id: string; batchDate: string; fileName: string | null; totalRecords: number; matchedRecords: number; exceptionRecords: number; status: string; exceptions: ReconException[] };
export type AuditEntry = { id?: string; time: string; actor: string; action: string; detail: string; entity: string };
export type BrokerInstrument = { id: string; symbol: string; name: string; asset: string; issuer: string; status: string; currency: string; lot: number; tick: number; cycle: string; price: number; coupon?: string; maturity?: string };
export type TenantFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
export type TenantControls = { makerChecker: boolean; approvalThreshold: number; clientDailyLimit: number; brokerageFeePct: number; minimumFee: number; settlementCycle: string; allowedOrderTypes: string[]; feeRules: TenantFeeRule[] };
export type TenantFeatures = { manualTradeCapture: boolean; [key: string]: boolean };
export type TenantInfo = { name: string; license: string; primaryColor: string };
export type TenantApiInstrument = { id: string; symbol: string; name: string; assetClass: string; issuer: string; status: string; currency: string; price: number; lotSize: number; tickSize: number; settlementCycle: string };
export type TenantApiResult = { tenant?: { tradingName?: string; licenseNumber?: string; primaryColor?: string; features?: Partial<TenantFeatures>; controls?: Partial<TenantControls> | null }; instruments?: TenantApiInstrument[] };
export type CashPoolView = { id: string; bankName: string; accountName: string; accountNumberMasked: string; currency: string; purpose: string; status: string; bookBalance: number; statementBalance: number; beneficialTotal: number; ownershipVariance: number; bankVariance: number; lastReconciledAt: string | null };
export type CashMovementView = { id: string; type: "deposit" | "withdrawal"; amount: number; currency: string; status: string; bankReference: string | null; proofReference: string | null; destinationBankName: string | null; destinationAccountName: string | null; destinationAccountMasked: string | null; channel: string; submissionReference: string; submittedAt: string; rejectionReason: string | null; failureReason: string | null; client?: { id: string; code: string; name: string }; account?: { id: string; number: string }; pool?: { id: string; bankName: string; accountName: string; accountNumberMasked: string; purpose: string } };
export type CashOperationsData = { summary: { bankBookTotal: number; statementTotal: number; beneficialTotal: number; pendingDeposits: number; pendingWithdrawals: number }; pools: CashPoolView[]; movements: CashMovementView[] };
export type BrokerCashInput = { clientId: string; accountId?: string; pooledBankAccountId: string; movementType: "deposit" | "withdrawal"; amount: number; submissionReference: string; bankReference?: string; proofReference?: string; destinationBankName?: string; destinationAccountName?: string; destinationAccountMasked?: string; notes?: string };
export type Client360Tab = "overview" | "assets" | "orders" | "trades" | "transactions" | "settlements" | "documents" | "notes" | "audit";
export type Client360Detail = {
  client: { id: string; code: string; name: string; type: string; phone: string | null; email: string | null; broker: string; branch: string | null; openedAt: string; lastActivityAt: string | null; kycStatus: string; clientStatus: string; accountStatus: string; tradingStatus: string; csdReference: string | null; riskRating: string; createdBy: string | null; submittedAt: string | null; approvedBy: string | null; approvedAt: string | null; rejectionReason: string | null; onboardingChannel?: string; address?: string | null; identityMasked?: string | null; taxIdMasked?: string | null; businessRegistrationNumber?: string | null; authorizedRepresentativeName?: string | null; beneficialOwners?: unknown; signatoryAuthorityConfirmed?: boolean };
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
  linkedBanks?: Array<{ id: string; bankName: string; accountNumberMasked: string; accountHolderName: string; source: string; status: string; createdAt: string; reviewedAt: string | null; rejectionReason: string | null }>;
  requests: NonNullable<BrokerClient["serviceRequests"]>;
  notes: Array<{ id: string; text: string; category: string; visibility: string; createdBy: string; createdAt: string }>;
  auditTrail: Array<{ id: string; timestamp: string; user: string; action: string; entityType: string; entityId: string | null; oldValue: string | null; newValue: string | null; reason: string }>;
};

export const fallbackControls: TenantControls = {
  makerChecker: true,
  approvalThreshold: 250_000,
  clientDailyLimit: 2_500_000,
  brokerageFeePct: 0.5,
  minimumFee: 25,
  settlementCycle: "T+2",
  allowedOrderTypes: ["Market", "Limit", "Stop-loss"],
  feeRules: [
    { assetClass: "equity", marketSegment: "main", brokeragePct: 0.5, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 25, maximumFee: null },
    { assetClass: "bond", marketSegment: "main", brokeragePct: 0.5, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee: 25, maximumFee: null },
  ],
};
export const fallbackFeatures: TenantFeatures = { manualTradeCapture: true };
export const fallbackCashOperations: CashOperationsData = {
  summary: { bankBookTotal: 19_449_700, statementTotal: 19_449_700, beneficialTotal: 19_449_700, pendingDeposits: 1, pendingWithdrawals: 0 },
  pools: [
    { id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", status: "active", bookBalance: 16_449_700, statementBalance: 16_449_700, beneficialTotal: 16_449_700, ownershipVariance: 0, bankVariance: 0, lastReconciledAt: "2026-07-14T16:00:00Z" },
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
  const gross = quantity * price;
  const brokeragePct = feeRule?.brokeragePct ?? feePct;
  const brokerageMinimum = feeRule?.minimumFee ?? minimumFee;
  const percentageFee = Math.round(gross * (brokeragePct / 100) * 100) / 100;
  const brokerage = gross > 0 ? Math.min(feeRule?.maximumFee ?? Number.POSITIVE_INFINITY, Math.max(brokerageMinimum, percentageFee)) : 0;
  const regulator = gross * (feeRule?.regulatorPct ?? 0) / 100;
  const exchange = gross * (feeRule?.exchangePct ?? 0) / 100;
  const csd = gross * (feeRule?.csdPct ?? 0) / 100;
  const fees = brokerage + regulator + exchange + csd;
  const net = side === "buy" ? gross + fees : gross - fees;
  return { gross, fees, net, brokerage, regulator, exchange, csd };
}

export type NavItem = { id: View; label: string; icon: string; roles?: Role[] };
export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  { label: "Clients", items: [
    { id: "clients", label: "Clients & accounts", icon: "clients", roles: ["broker_admin", "operations", "compliance"] },
    { id: "cash", label: "Client money", icon: "cash", roles: ["broker_admin", "operations", "settlement"] },
  ] },
  { label: "Trading", items: [
    { id: "orders", label: "Order log", icon: "orders" },
    { id: "settlement", label: "Settlement", icon: "settlement", roles: ["broker_admin", "settlement", "operations"] },
    { id: "reconciliation", label: "Reconciliation", icon: "reconciliation", roles: ["broker_admin", "settlement", "operations"] },
  ] },
  { label: "Oversight", items: [
    { id: "performance", label: "Performance", icon: "performance", roles: ["broker_admin"] },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "audit", label: "Audit trail", icon: "audit", roles: ["broker_admin", "compliance"] },
  ] },
  { label: "Administration", items: [
    { id: "users", label: "Users & roles", icon: "users", roles: ["broker_admin"] },
    { id: "settings", label: "Settings", icon: "settings", roles: ["broker_admin"] },
  ] },
];
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);
export const navVisible = (item: NavItem, role: Role) => role === "super_admin" || role === "management" || !item.roles || item.roles.includes(role);
export const PENDING_CASH_STATUSES = ["pending_verification", "pending_approval", "approved"];
export type QueueItem = { key: string; permission: string; tone: "warning" | "danger" | "info"; icon: string; title: string; detail: string; onOpen: () => void };
export const queueVisible = (item: QueueItem, role: Role) => role === "management" || role === "super_admin" || hasPermission(role, item.permission);
export const roleNames: Record<Role, string> = {
  broker_admin: "Mekdes Tadesse",
  trader: "Dawit Alemu",
  operations: "Hana Kebede",
  compliance: "Liya Girma",
  settlement: "Rahel Getachew",
  management: "Yonas Alemayehu",
  super_admin: "Frank",
};
export const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

const ICON_PATHS: Record<string, string> = {
  dashboard: "M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 21h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 9h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z M4 21h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z",
  orders: "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1 M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M8 11h8 M8 15h5",
  clients: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  users: "M16 10h3 M16 14h3 M6.2 15a3 3 0 0 1 5.6 0 M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  cash: "M3 7h18v13H3z M16 13h5 M3 7l3-3h12l3 3 M7 11h5 M7 15h3",
  settlement: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  reconciliation: "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M13 6h3a2 2 0 0 1 2 2v7 M11 18H8a2 2 0 0 1-2-2V9",
  reports: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M16 13H8 M16 17H8 M10 9H8",
  audit: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2",
  performance: "M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3",
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
export function Metric({ label, value, note, tone = "brand" }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`metric metric-${tone}`}><div className="metric-top"><span>{label}</span><i /></div><strong>{value}</strong><small>{note}</small></article>;
}
export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>✓</span><strong>{title}</strong><p>{copy}</p></div>;
}

export const BROKER_TENANT_ID = "brk_abyssinia";
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
