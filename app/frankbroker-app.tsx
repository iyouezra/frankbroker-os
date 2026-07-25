"use client";

/* The logo dimensions are controlled by the portal and printable-note styles. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { demoAudit, demoClients, demoInstruments, initialOrders, type BrokerClient, type DemoOrder, type OrderLogResponse } from "../lib/demo-data";
import { hasPermission, roleLabels, workflowPermissions, type OrderStatus, type Role } from "../lib/frank";
import { computeBrokerAnalytics, PERIODS, type Period } from "../lib/broker-analytics";
import { demoBrokerNotifications, timeAgo, type NotificationItem } from "../lib/notifications-demo";
import { buildReports, feesEarned, downloadCsv, type Report } from "../lib/broker-reports";
import { isOrderEligibleClient } from "../lib/client-readiness";
import { ACTIVE_ORDER_STATUSES, movementDescription, orderResponsibility, waitingTime } from "../lib/order-log";

type View = "dashboard" | "performance" | "orders" | "clients" | "cash" | "settlement" | "reconciliation" | "reports" | "audit" | "users" | "settings";
type Drawer = "new" | "client" | "detail" | "trade" | "contract" | null;
type NewOrderValue = { accountId: string; instrumentId: string; side: "buy" | "sell"; quantity: string; price: string; orderType: string; validity: string; notes: string; submissionReference: string; source: "digital" | "in_person" | "neway" | "phone"; verificationId: string; verificationCode: string; demoCode: string };
type OnboardingDocumentType = "proof_of_address" | "business_license" | "tin_certificate" | "certificate_of_incorporation" | "article_of_association";
type NewClientBank = { id: string; bankName: string; accountNumber: string; accountHolderName: string };
type NewClientValue = {
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
type ClientDirectoryResponse = {
  clients: BrokerClient[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  facets: {
    types: { all: number; individual: number; corporate: number; institution: number };
    statuses: Record<string, number>;
  };
};
type TradeValue = { quantity: string; price: string; tradeDate: string; captureReference: string };
type ReconException = { id: string; reference: string; exceptionType: string; expectedValue: string | null; actualValue: string | null; status: string; resolutionNotes: string | null };
type ReconBatch = { id: string; batchDate: string; fileName: string | null; totalRecords: number; matchedRecords: number; exceptionRecords: number; status: string; exceptions: ReconException[] };
type AuditEntry = { id?: string; time: string; actor: string; action: string; detail: string; entity: string };
type BrokerInstrument = { id: string; symbol: string; name: string; asset: string; issuer: string; status: string; currency: string; lot: number; tick: number; cycle: string; price: number; coupon?: string; maturity?: string };
type TenantFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
type TenantControls = { makerChecker: boolean; approvalThreshold: number; clientDailyLimit: number; brokerageFeePct: number; minimumFee: number; settlementCycle: string; allowedOrderTypes: string[]; feeRules: TenantFeeRule[] };
type TenantFeatures = { manualTradeCapture: boolean; [key: string]: boolean };
type TenantInfo = { name: string; license: string; primaryColor: string };
type TenantApiInstrument = { id: string; symbol: string; name: string; assetClass: string; issuer: string; status: string; currency: string; price: number; lotSize: number; tickSize: number; settlementCycle: string };
type TenantApiResult = { tenant?: { tradingName?: string; licenseNumber?: string; primaryColor?: string; features?: Partial<TenantFeatures>; controls?: Partial<TenantControls> | null }; instruments?: TenantApiInstrument[] };
type CashPoolView = { id: string; bankName: string; accountName: string; accountNumberMasked: string; currency: string; purpose: string; status: string; bookBalance: number; statementBalance: number; beneficialTotal: number; ownershipVariance: number; bankVariance: number; lastReconciledAt: string | null };
type CashMovementView = { id: string; type: "deposit" | "withdrawal"; amount: number; currency: string; status: string; bankReference: string | null; proofReference: string | null; destinationBankName: string | null; destinationAccountName: string | null; destinationAccountMasked: string | null; channel: string; submissionReference: string; submittedAt: string; rejectionReason: string | null; failureReason: string | null; client?: { id: string; code: string; name: string }; account?: { id: string; number: string }; pool?: { id: string; bankName: string; accountName: string; accountNumberMasked: string; purpose: string } };
type CashOperationsData = { summary: { bankBookTotal: number; statementTotal: number; beneficialTotal: number; pendingDeposits: number; pendingWithdrawals: number }; pools: CashPoolView[]; movements: CashMovementView[] };
type BrokerCashInput = { clientId: string; accountId?: string; pooledBankAccountId: string; movementType: "deposit" | "withdrawal"; amount: number; submissionReference: string; bankReference?: string; proofReference?: string; destinationBankName?: string; destinationAccountName?: string; destinationAccountMasked?: string; notes?: string };
type Client360Tab = "overview" | "assets" | "orders" | "trades" | "transactions" | "settlements" | "documents" | "notes" | "audit";
type Client360Detail = {
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

const fallbackControls: TenantControls = {
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
const fallbackFeatures: TenantFeatures = { manualTradeCapture: true };
const fallbackCashOperations: CashOperationsData = {
  summary: { bankBookTotal: 19_449_700, statementTotal: 19_449_700, beneficialTotal: 19_449_700, pendingDeposits: 1, pendingWithdrawals: 0 },
  pools: [
    { id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", status: "active", bookBalance: 16_449_700, statementBalance: 16_449_700, beneficialTotal: 16_449_700, ownershipVariance: 0, bankVariance: 0, lastReconciledAt: "2026-07-14T16:00:00Z" },
    { id: "pool_aby_fixed_income", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Fixed Income Client Money", accountNumberMasked: "•••• 7721", currency: "ETB", purpose: "fixed_income", status: "active", bookBalance: 3_000_000, statementBalance: 3_000_000, beneficialTotal: 3_000_000, ownershipVariance: 0, bankVariance: 0, lastReconciledAt: "2026-07-14T16:00:00Z" },
  ],
  movements: [{ id: "MOV-DEMO-DEP-001", type: "deposit", amount: 15_000, currency: "ETB", status: "pending_verification", bankReference: "CBE-FT-908231", proofReference: "mobile-transfer-receipt", destinationBankName: null, destinationAccountName: null, destinationAccountMasked: null, channel: "investor_portal", submissionReference: "INV-DEMO-FUND-001", submittedAt: "2026-07-16T08:42:00Z", rejectionReason: null, failureReason: null, client: { id: "cli_investor_demo", code: "CL-INV-001", name: "Selam Mekonnen" }, account: { id: "acc_investor_demo", number: "INV-00001-01" }, pool: { id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", purpose: "general" } }],
};
const fallbackInstruments: BrokerInstrument[] = demoInstruments;
const newClientDefaults = (): NewClientValue => ({
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

function displayLabel(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").split(" ").filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

function normalizedOrderType(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

function calculateConfiguredAmounts(side: "buy" | "sell", quantity: number, price: number, feePct: number, minimumFee = 0, feeRule?: TenantFeeRule) {
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

// `roles` limits which roles see a tab (undefined = everyone). super_admin and
// management are oversight and see everything (handled in navVisible below).
type NavItem = { id: View; label: string; icon: string; roles?: Role[] };
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  ] },
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
const navItems: NavItem[] = navGroups.flatMap((group) => group.items);
// Oversight roles (management, super_admin) see every tab read-only.
const navVisible = (item: NavItem, role: Role) => role === "super_admin" || role === "management" || !item.roles || item.roles.includes(role);

// Cash instructions still awaiting a broker decision or payment execution.
const PENDING_CASH_STATUSES = ["pending_verification", "pending_approval", "approved"];

/** A single item in the dashboard's cross-domain "needs your attention" queue. */
type QueueItem = {
  key: string;
  permission: string;
  tone: "warning" | "danger" | "info";
  icon: string;
  title: string;
  detail: string;
  onOpen: () => void;
};
// Oversight roles observe every queue item; everyone else sees what they can action.
const queueVisible = (item: QueueItem, role: Role) => role === "management" || role === "super_admin" || hasPermission(role, item.permission);

// Demo identity per role, reusing the seeded broker staff (Dawit A. the trader, etc.).
const roleNames: Record<Role, string> = {
  broker_admin: "Mekdes Tadesse",
  trader: "Dawit Alemu",
  operations: "Hana Kebede",
  compliance: "Liya Girma",
  settlement: "Rahel Getachew",
  management: "Yonas Alemayehu",
  super_admin: "Frank",
};
const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

// Lucide-style line icons (24×24, stroke 1.8) — matches the Frank design system.
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
const emptyReconBatch: ReconBatch = { id: "No batches", batchDate: "", fileName: null, totalRecords: 0, matchedRecords: 0, exceptionRecords: 0, status: "empty", exceptions: [] };

const statusLabels: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  validation_failed: "Validation failed",
  pending_broker_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  partially_filled: "Partially filled",
  filled: "Filled",
  cancelled: "Cancelled",
  settlement_pending: "Settlement pending",
  settled: "Settled",
  failed: "Failed",
};

const statusTone: Record<OrderStatus, string> = {
  draft: "neutral",
  submitted: "info",
  validation_failed: "danger",
  pending_broker_review: "warning",
  approved: "brand",
  rejected: "danger",
  partially_filled: "purple",
  filled: "success",
  cancelled: "neutral",
  settlement_pending: "warning",
  settled: "success",
  failed: "danger",
};

const fmt = new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 });
const etb = (value: number) => `${fmt.format(value)} ETB`;
const compactEtb = (value: number) => {
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `ETB ${Math.round(value / 1_000)}K`;
  return `ETB ${Math.round(value)}`;
};
const auditTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function hydrateOrders(rows: Array<Omit<DemoOrder, "time">>) {
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
  const [newOrder, setNewOrder] = useState<NewOrderValue>({ accountId: "acc_meron", instrumentId: "ins_tele", side: "buy", quantity: "1000", price: "312.5", orderType: "Limit", validity: "Day", notes: "", submissionReference: crypto.randomUUID(), source: "phone", verificationId: "", verificationCode: "", demoCode: "" });
  const [newClient, setNewClient] = useState<NewClientValue>(newClientDefaults);
  const [checks, setChecks] = useState<{ label: string; passed: boolean; message: string }[] | null>(null);
  const [controls, setControls] = useState<TenantControls>(fallbackControls);
  const [features, setFeatures] = useState<TenantFeatures>(fallbackFeatures);
  const [instruments, setInstruments] = useState<BrokerInstrument[]>(fallbackInstruments);
  const [collapsed, setCollapsed] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [tenantInfo, setTenantInfo] = useState<TenantInfo>({ name: "Abyssinia Securities", license: "ESCA-BR-004", primaryColor: "#0C8189" });
  const [tradeForm, setTradeForm] = useState({ quantity: "", price: "", tradeDate: "2026-07-14", captureReference: "" });
  // Set when arriving at Clients from the queue so the directory opens pre-filtered.
  const [clientsFocus, setClientsFocus] = useState<{ status: string } | null>(null);
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
          key: `client-${client.id}`, permission: "approve", tone: "warning", icon: "clients",
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
    void fetch("/api/notifications", { signal: controller.signal, headers: notifyHeaders })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
      .catch(() => setNotifications(demoBrokerNotifications(role)));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  // If the active role can't see the current view, fall back to the dashboard.
  useEffect(() => {
    const current = navItems.find((item) => item.id === view);
    if (current && !navVisible(current, role)) setView("dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
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
    setBusyAction("create");
    try {
      let verificationId = newOrder.verificationId;
      if (!verificationId) {
        const challenge = await apiRequest<{ id: string; demoCode?: string; destinationHint?: string }>("/api/verifications", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ action: "request_order", ...newOrder, quantity, price }) });
        setNewOrder((current) => ({ ...current, verificationId: challenge.id, demoCode: challenge.demoCode ?? "" }));
        notify(`Authorization code requested for ${challenge.destinationHint ?? "the registered contact"}. Enter it to submit the exact instruction.`);
        return;
      }
      if (newOrder.verificationCode.length !== 6) throw new Error("Enter the 6-digit client authorization code.");
      await apiRequest("/api/verifications", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ action: "confirm", accountId: newOrder.accountId, verificationId, code: newOrder.verificationCode }) });
      const result = await apiRequest<{ order: DemoOrder; checks?: { code: string; label: string; passed: boolean; message: string }[] }>("/api/orders", { method: "POST", headers: { "content-type": "application/json", "x-frank-demo-role": role }, body: JSON.stringify({ ...newOrder, verificationId, quantity, price }) });
      // Reflect the server's authoritative pre-trade checks (incl. daily limit).
      if (result.checks) setChecks(result.checks);
      const failed = result.checks?.filter((item) => !item.passed) ?? [];
      const created = { ...result.order, orderType: displayLabel(result.order.orderType), time: new Date(result.order.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), trader: "Unassigned" };
      setOrders((current) => [created, ...current]);
      await refreshOmsData();
      if (result.order.status === "validation_failed") {
        setView("orders");
        notify(failed[0] ? `${created.id} held — ${failed[0].message}` : `${created.id} held: pre-trade checks failed.`, "error");
        return;
      }
      setDrawer(null);
      setChecks(null);
      setNewOrder((current) => ({ ...current, verificationId: "", verificationCode: "", demoCode: "", submissionReference: crypto.randomUUID() }));
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
              {items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setDrawer(null); }} title={item.label}><i><Icon name={item.icon} size={20} /></i><span>{item.label}</span>{item.id === "orders" && pendingOrderCount > 0 && <em>{pendingOrderCount}</em>}{item.id === "clients" && pendingClientCount > 0 && <em className="warn">{pendingClientCount}</em>}{item.id === "cash" && pendingCashCount > 0 && <em className="warn">{pendingCashCount}</em>}{item.id === "reconciliation" && reconBatch.exceptionRecords > 0 && <em className="warn">{reconBatch.exceptionRecords}</em>}</button>)}
            </div>;
          })}
        </nav>
        <div className="sidebar-foot"><div className="sidebar-user"><span className="su-avatar">{initials(roleNames[role])}</span><div><b>{roleNames[role]}</b><div className="su-role"><select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Active role">{Object.entries(roleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><i>⌄</i></div></div></div></div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><img src="/frankscore-icon.png" alt="" /><b>FrankBroker</b></div>
          <div className="tenant-chip" title={`${tenantInfo.name}${tenantInfo.license ? ` · ${tenantInfo.license}` : ""}`}><span style={{ background: tenantInfo.primaryColor }}>{tenantInfo.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><div><small>TENANT</small><b>{tenantInfo.name}</b></div></div>
          <label className="search"><span><Icon name="search" size={17} /></span><input aria-label="Search orders or clients" placeholder="Search orders or clients…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><span className="business-date">Business date <b>14 JUL 2026</b></span><button className="icon-button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button><div className="notif-wrap"><button className="icon-button" aria-label="Notifications" onClick={() => setBellOpen((value) => !value)}><Icon name="bell" size={18} />{unreadCount > 0 && <em>{unreadCount > 9 ? "9+" : unreadCount}</em>}</button>{bellOpen && <><div className="notif-scrim" onClick={() => setBellOpen(false)} /><div className="notif-panel" role="dialog" aria-label="Notifications"><div className="notif-head"><b>Notifications</b>{unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}</div><div className="notif-list">{notifications.length === 0 ? <div className="notif-empty">You&apos;re all caught up.</div> : notifications.map((item) => <button key={item.id} className={`notif-item${item.read ? "" : " unread"}`} onClick={() => openNotification(item)}><i className={`notif-dot sev-${item.severity}`} /><div><b>{item.title}</b><p>{item.body}</p><small>{item.category} · {timeAgo(item.createdAt)}</small></div></button>)}</div></div></>}</div></div>
        </header>

        <main>
          {view === "dashboard" && <Dashboard orders={orders} auditEntries={auditEntries} queue={visibleQueue} settlementCycle={controls.settlementCycle} manualTradeCapture={features.manualTradeCapture} onViewOrders={() => setView("orders")} onOpen={openDetail} onNewOrder={openNewOrder} onSettle={() => setView("settlement")} />}
          {view === "performance" && <PerformancePage orders={orders} clients={clients} period={period} setPeriod={setPeriod} onOpen={openDetail} />}
          {view === "orders" && <OrdersPage orders={orders} query={query} role={role} refreshKey={orderRefreshKey} onOpen={openDetail} onNewOrder={openNewOrder} />}
          {view === "clients" && <ClientsPage clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} orders={orders} instruments={instruments} role={role} focus={clientsFocus} onNewClient={openNewClient} onRefresh={refreshOmsData} onOpenOrder={openDetail} />}
          {view === "cash" && <CashOperationsPage data={cashOperations} clients={clients} role={role} busy={busyAction} onCreate={createCashInstruction} onAction={actOnCashInstruction} />}
          {view === "settlement" && <SettlementPage orders={orders} onOpen={openDetail} onExport={exportOrders} />}
          {view === "reconciliation" && <ReconciliationPage batch={reconBatch} busy={busyAction === "reconcile"} onFile={processReconFile} onDownload={downloadReconTemplate} onResolve={resolveReconException} resolvingId={busyAction} />}
          {view === "reports" && <ReportsPage orders={orders} clients={clients} audit={auditEntries} onDownloaded={(name) => notify(`${name} exported as CSV.`)} />}
          {view === "audit" && <AuditPage events={auditEntries} />}
          {view === "users" && <UsersPage role={role} />}
          {view === "settings" && <SettingsPage />}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.filter((item) => navVisible(item, role)).slice(0, 5).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i><Icon name={item.icon} size={21} /></i><span>{item.label.split(" ")[0]}</span></button>)}</nav>
      </div>

      {drawer && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className={`drawer ${drawer === "contract" ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={drawer === "new" ? "New order" : drawer === "client" ? "New client" : drawer === "trade" ? "Capture trade" : drawer === "contract" ? "Contract note" : "Order details"}>
          <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close">×</button>
          {drawer === "new" && <NewOrderForm value={newOrder} setValue={setNewOrder} clients={eligibleClients} instruments={instruments} controls={controls} checks={checks} busy={busyAction === "create"} onValidate={runValidation} onSubmit={submitOrder} />}
          {drawer === "client" && <NewClientForm value={newClient} setValue={setNewClient} busy={busyAction === "create_client"} onCancel={() => setDrawer(null)} onSubmit={submitClient} />}
          {drawer === "detail" && <OrderDetail order={selected} role={role} busy={busyAction} controls={controls} manualTradeCapture={features.manualTradeCapture} onApprove={() => actionOrder("approve")} onReject={() => actionOrder("reject")} onCancel={() => actionOrder("cancel")} onFail={() => actionOrder("fail")} onTrade={() => openTrade(selected)} onSettle={() => actionOrder("settle")} onContract={() => setDrawer("contract")} />}
          {drawer === "trade" && <TradeForm order={selected} value={tradeForm} setValue={setTradeForm} controls={controls} busy={busyAction === "execute"} onCancel={() => setDrawer(null)} onSubmit={captureTrade} />}
          {drawer === "contract" && <ContractNote order={selected} instruments={instruments} tenantInfo={tenantInfo} settlementCycle={controls.settlementCycle} busy={busyAction === "contract_note"} onPrint={printContractNote} />}
        </aside>
      </div>}
      {toast && <div className={`toast${toast.tone === "error" ? " toast-error" : ""}`}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.message}</div>}
    </div>
  );
}

function Dashboard({ orders, auditEntries, queue, settlementCycle, manualTradeCapture, onViewOrders, onOpen, onNewOrder, onSettle }: { orders: DemoOrder[]; auditEntries: AuditEntry[]; queue: QueueItem[]; settlementCycle: string; manualTradeCapture: boolean; onViewOrders: () => void; onOpen: (order: DemoOrder) => void; onNewOrder: () => void; onSettle: () => void }) {
  const pending = orders.filter((order) => order.status === "pending_broker_review");
  const settlement = orders.filter((order) => order.status === "settlement_pending" || order.status === "partially_filled");
  const filled = orders.filter((order) => ["partially_filled", "settlement_pending", "settled"].includes(order.status));
  const orderValue = orders.reduce((total, order) => total + order.estimatedNet, 0);
  const filledValue = filled.reduce((total, order) => total + (order.tradeNet ?? order.estimatedNet), 0);
  const settlementValue = settlement.reduce((total, order) => total + (order.tradeNet ?? order.estimatedNet), 0);
  return <>
    <SectionHeader eyebrow="TUESDAY · 14 JULY 2026" title="Good morning, Mekdes" copy="Here’s the control picture for today’s brokerage operations." action={<><button className="btn secondary" onClick={onViewOrders}>View order log</button><button className="btn primary" onClick={onNewOrder}><span>＋</span> New order</button></>} />
    <div className="manual-banner"><span>{manualTradeCapture ? "MANUAL MARKET MODE" : "TRADE CAPTURE DISABLED"}</span><p>{manualTradeCapture ? "Orders are entered and sent to ESX manually. Settlement confirmations are updated by operations." : "Platform administration has paused manual execution capture for this tenant. Existing orders and settlements remain visible."}</p></div>
    <section className="metric-grid"><Metric label="Orders in view" value={String(orders.length)} note={`${compactEtb(orderValue)} estimated value`} /><Metric label="Pending approvals" value={String(pending.length)} note={`${pending.filter((order) => order.riskFlag !== "none").length} require risk review`} tone="warning" /><Metric label="Executed orders" value={String(filled.length)} note={`${compactEtb(filledValue)} captured`} tone="success" /><Metric label="Settlement pending" value={String(settlement.length)} note={`${compactEtb(settlementValue)} due by ${settlementCycle}`} tone="purple" /><Metric label="Validation exceptions" value={String(orders.filter((order) => order.status === "validation_failed").length)} note="Orders requiring correction" tone="danger" /></section>
    <div className="dashboard-grid">
      <section className="panel queue-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL QUEUE</span><h2>Needs your attention</h2></div>{queue.length > 0 && <span className="queue-count">{queue.length} open</span>}</div>
        <div className="queue-list">{queue.length === 0
          ? <div className="queue-empty">Nothing is waiting on you right now.</div>
          : queue.slice(0, 6).map((item) => <button key={item.key} onClick={item.onOpen}><span className={`queue-icon ${item.tone}`}><Icon name={item.icon} size={16} /></span><span><b>{item.title}</b><small>{item.detail}</small></span><em>›</em></button>)}</div>
      </section>
      <section className="panel settlement-card"><div className="panel-head"><div><span className="eyebrow">SETTLEMENT POSITION</span><h2>Due by value date</h2></div><button className="text-button" onClick={onSettle}>Open queue <span>→</span></button></div><div className="settlement-bars"><div><span><b>Today</b><small>3 trades</small></span><i><em style={{ width: "82%" }} /></i><strong>ETB 1.84M</strong></div><div><span><b>Tomorrow</b><small>5 trades</small></span><i><em style={{ width: "58%" }} /></i><strong>ETB 1.22M</strong></div><div><span><b>16 Jul</b><small>2 trades</small></span><i><em style={{ width: "30%" }} /></i><strong>ETB 640K</strong></div></div><div className="settlement-foot"><span><i className="cash" /> Cash pending <b>3</b></span><span><i className="security" /> Securities pending <b>4</b></span></div></section>
      <section className="panel activity-panel"><div className="panel-head"><div><span className="eyebrow">LIVE ACTIVITY</span><h2>Latest control events</h2></div></div><div className="activity-list">{auditEntries.slice(0, 4).map((item) => <div key={item.id ?? item.time}><i /><time>{auditTime(item.time)}</time><span><b>{item.action.replaceAll("_", " ")}</b><small>{item.detail}</small></span><em>{item.actor}</em></div>)}</div></section>
    </div>
  </>;
}

function OrdersPage({ orders, query, role, refreshKey, onOpen, onNewOrder }: { orders: DemoOrder[]; query: string; role: Role; refreshKey: number; onOpen: (order: DemoOrder) => void; onNewOrder: () => void }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "review" | "approved" | "executed" | "exceptions">("all");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [riskFilter, setRiskFilter] = useState<"all" | "flagged">("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "7d" | "30d">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "value" | "updated">("newest");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(orders.slice(0, 25));
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: orders.length, pageCount: Math.max(1, Math.ceil(orders.length / 25)) });
  const [facets, setFacets] = useState<OrderLogResponse["facets"]>({
    statuses: Object.fromEntries([...new Set(orders.map((order) => order.status))].map((status) => [status, orders.filter((order) => order.status === status).length])),
    orderTypes: [...new Set(orders.map((order) => normalizedOrderType(order.orderType)))],
    sources: [...new Set(orders.map((order) => order.source.toLowerCase().replaceAll(" ", "_")))],
  });
  const statusMatches = (order: DemoOrder) => statusFilter === "all"
    || (statusFilter === "review" && order.status === "pending_broker_review")
    || (statusFilter === "approved" && order.status === "approved")
    || (statusFilter === "executed" && ["partially_filled", "filled", "settlement_pending", "settled"].includes(order.status))
    || (statusFilter === "exceptions" && ["validation_failed", "rejected", "cancelled", "failed"].includes(order.status));
  const buildParams = (requestedPage = page) => new URLSearchParams({
    page: String(requestedPage),
    pageSize: "25",
    query: query.trim(),
    status: statusFilter,
    side: sideFilter,
    risk: riskFilter,
    orderType: orderTypeFilter,
    source: sourceFilter,
    period: periodFilter,
    sort,
  });
  const fallbackFilteredOrders = () => {
    const needle = query.trim().toLowerCase();
    const periodDays = periodFilter === "7d" ? 7 : periodFilter === "30d" ? 30 : 0;
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : 0;
    const today = new Date().toISOString().slice(0, 10);
    return orders
      .filter((order) => statusMatches(order)
        && (sideFilter === "all" || order.side === sideFilter)
        && (riskFilter === "all" || order.riskFlag !== "none")
        && (orderTypeFilter === "all" || normalizedOrderType(order.orderType) === normalizedOrderType(orderTypeFilter))
        && (sourceFilter === "all" || order.source.toLowerCase().replaceAll(" ", "_") === sourceFilter)
        && (periodFilter === "all" || (periodFilter === "today" ? order.createdAt.slice(0, 10) === today : new Date(order.createdAt).getTime() >= cutoff))
        && (!needle || [order.id, order.client, order.clientCode, order.accountNumber, order.symbol, order.status, order.submissionReference, ...(order.trades?.map((trade) => trade.captureReference) ?? [])].some((value) => String(value ?? "").toLowerCase().includes(needle))))
      .sort((left, right) => sort === "value" ? right.estimatedNet - left.estimatedNet : sort === "oldest" ? left.createdAt.localeCompare(right.createdAt) : sort === "updated" ? (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt) : right.createdAt.localeCompare(left.createdAt));
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
  }, [query, statusFilter, sideFilter, riskFilter, orderTypeFilter, sourceFilter, periodFilter, sort, page, role, refreshKey, orders]);

  const chooseStatus = (value: typeof statusFilter) => { setStatusFilter(value); setPage(1); };
  const exportFiltered = async () => {
    const params = buildParams(1);
    params.set("format", "csv");
    const response = await fetch(`/api/orders?${params.toString()}`, { headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
    const blob = response.ok
      ? await response.blob()
      : new Blob([
        [
          ["Order ID", "Submitted", "Last updated", "Client", "Client code", "Trading account", "Instrument", "Side", "Order type", "Validity", "Limit price", "Trigger price", "Ordered", "Filled", "Remaining", "Estimated value", "Executed value", "Status", "Source", "Submission reference", "Assigned trader", "Next action", "Action owner", "Exception reason"],
          ...fallbackFilteredOrders().map((order) => [order.id, order.createdAt, order.updatedAt ?? order.createdAt, order.client, order.clientCode, order.accountNumber ?? order.accountId, order.symbol, order.side, order.orderType, order.validity ?? "Day", order.price, order.triggerPrice ?? "", order.quantity, order.filledQuantity ?? 0, order.remainingQuantity ?? order.quantity, order.estimatedNet, order.executedNet ?? 0, order.status, order.source, order.submissionReference ?? "", order.trader, order.nextAction ?? "", order.actionOwner ?? "", order.rejectionReason ?? ""]),
        ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"),
      ], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `frankbroker-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const count = (statuses: string[]) => statuses.reduce((total, status) => total + (facets.statuses[status] ?? 0), 0);
  return <>
    <SectionHeader eyebrow="ORDER MANAGEMENT" title="Order log" copy="See each instruction, what has happened, and what needs attention next." action={<><button className="btn secondary" onClick={() => void exportFiltered()}>Export filtered CSV</button><button className="btn primary" onClick={onNewOrder}>＋ New order</button></>} />
    <div className="filter-row">
      <button className={`filter ${statusFilter === "all" ? "active" : ""}`} onClick={() => chooseStatus("all")}>All orders <b>{Object.values(facets.statuses).reduce((total, value) => total + value, 0)}</b></button>
      <button className={`filter ${statusFilter === "review" ? "active" : ""}`} onClick={() => chooseStatus("review")}>Pending review <b>{count(["pending_broker_review"])}</b></button>
      <button className={`filter ${statusFilter === "approved" ? "active" : ""}`} onClick={() => chooseStatus("approved")}>Approved <b>{count(["approved"])}</b></button>
      <button className={`filter ${statusFilter === "executed" ? "active" : ""}`} onClick={() => chooseStatus("executed")}>Executed <b>{count(["partially_filled", "filled", "settlement_pending", "settled"])}</b></button>
      <button className={`filter ${statusFilter === "exceptions" ? "active" : ""}`} onClick={() => chooseStatus("exceptions")}>Exceptions <b>{count(["validation_failed", "rejected", "cancelled", "failed"])}</b></button>
    </div>
    <div className="blotter-controls order-log-controls">
      <label>Side<select value={sideFilter} onChange={(event) => { setSideFilter(event.target.value as typeof sideFilter); setPage(1); }}><option value="all">All sides</option><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
      <label>Order type<select value={orderTypeFilter} onChange={(event) => { setOrderTypeFilter(event.target.value); setPage(1); }}><option value="all">All types</option>{facets.orderTypes.map((type) => <option value={type} key={type}>{displayLabel(type)}</option>)}</select></label>
      <label>Source<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}><option value="all">All sources</option>{facets.sources.map((source) => <option value={source} key={source}>{displayLabel(source)}</option>)}</select></label>
      <label>Period<select value={periodFilter} onChange={(event) => { setPeriodFilter(event.target.value as typeof periodFilter); setPage(1); }}><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
      <label>Risk<select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value as typeof riskFilter); setPage(1); }}><option value="all">All risk levels</option><option value="flagged">Flagged only</option></select></label>
      <label>Sort<select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}><option value="newest">Newest first</option><option value="updated">Recently updated</option><option value="oldest">Oldest first</option><option value="value">Highest value</option></select></label>
      <span>{loading ? "Updating…" : `${pagination.total} matching orders`}</span>
    </div>
    <section className={`panel table-panel order-log-table${loading ? " loading" : ""}`}><OrderTable orders={rows} onOpen={onOpen} /></section>
    {pagination.pageCount > 1 && <div className="pagination"><button disabled={pagination.page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pageCount}</span><button disabled={pagination.page >= pagination.pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
  </>;
}

function OrderTable({ orders, onOpen }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void }) {
  if (!orders.length) return <EmptyState title="No orders found" copy="Try another client, symbol, order ID, reference, or filter." />;
  return <div className="table-scroll"><table><thead><tr><th>Order / update</th><th>Client / account</th><th>Instrument / instruction</th><th>Side</th><th className="num">Execution progress</th><th className="num">Value</th><th>Status / age</th><th>Owner / next action</th><th aria-label="Actions" /></tr></thead><tbody>{orders.map((order) => {
    const active = ACTIVE_ORDER_STATUSES.has(order.status);
    const value = (order.filledQuantity ?? 0) > 0 ? order.executedNet ?? 0 : order.estimatedNet;
    return <tr key={order.id} onClick={() => onOpen(order)}>
      <td><b>{order.id}</b><small>Submitted {new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small><small>Updated {new Date(order.updatedAt ?? order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td>
      <td><b>{order.client}</b><small>{order.clientCode} · {order.accountNumber ?? order.accountId.replace("acc_", "TRD-").toUpperCase()}</small></td>
      <td><b>{order.symbol} · {order.orderType}</b><small>{order.validity ?? "Day"} · {fmt.format(order.price)} ETB{order.triggerPrice ? ` · Trigger ${fmt.format(order.triggerPrice)}` : ""}</small></td>
      <td><span className={`side side-${order.side}`}>{order.side.toUpperCase()}</span></td>
      <td className="num"><b>{fmt.format(order.filledQuantity ?? 0)} / {fmt.format(order.quantity)}</b><small>{fmt.format(order.remainingQuantity ?? order.quantity)} remaining</small></td>
      <td className="num"><b>{etb(value)}</b><small>{(order.filledQuantity ?? 0) > 0 ? "Executed value" : "Estimated incl. fees"}</small></td>
      <td><StatusBadge status={order.status} />{active && <small>{waitingTime(order.updatedAt ?? order.createdAt)}</small>}{order.riskFlag !== "none" && <small className="risk-note">◇ Risk review</small>}</td>
      <td><b>{order.actionOwner ?? "Operations review"}</b><small>{order.nextAction ?? "Review order"}</small></td>
      <td><button className="row-action" onClick={(event) => { event.stopPropagation(); onOpen(order); }}>•••</button></td>
    </tr>;
  })}</tbody></table></div>;
}

function ClientsPage({ clients, selectedId, onSelect, orders, instruments, role, focus, onNewClient, onRefresh, onOpenOrder }: { clients: BrokerClient[]; selectedId: string; onSelect: (id: string) => void; orders: DemoOrder[]; instruments: BrokerInstrument[]; role: Role; focus: { status: string } | null; onNewClient: () => void; onRefresh: () => Promise<void>; onOpenOrder: (order: DemoOrder) => void }) {
  const [directoryRows, setDirectoryRows] = useState<BrokerClient[]>(clients);
  const [directorySelection, setDirectorySelection] = useState<BrokerClient | null>(null);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [debouncedDirectoryQuery, setDebouncedDirectoryQuery] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState<"all" | "individual" | "corporate" | "institution">("all");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [clientKycFilter, setClientKycFilter] = useState("all");
  const [clientSort, setClientSort] = useState<"name" | "newest">("name");
  // Arriving from the control queue pre-filters the directory to that status.
  useEffect(() => {
    if (!focus) return;
    setClientStatusFilter(focus.status);
    setDirectoryPage(1);
  }, [focus]);
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

function CashOperationsPage({ data, clients, role, busy, onCreate, onAction }: { data: CashOperationsData; clients: BrokerClient[]; role: Role; busy: string | null; onCreate: (input: BrokerCashInput) => Promise<boolean>; onAction: (id: string, action: "verify" | "approve" | "complete" | "reject" | "fail", detail: { reason?: string; bankReference?: string }) => Promise<boolean> }) {
  const [recording, setRecording] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "deposit" | "withdrawal">("pending");
  const [actionState, setActionState] = useState<{ movement: CashMovementView; action: "verify" | "approve" | "complete" | "reject" | "fail" } | null>(null);
  const [actionDetail, setActionDetail] = useState("");
  const activeClients = clients.filter((client) => client.status === "active" && client.accountStatus === "active");
  const [form, setForm] = useState<BrokerCashInput>({ clientId: activeClients[0]?.id ?? "", accountId: activeClients[0]?.accountId, pooledBankAccountId: data.pools[0]?.id ?? "", movementType: "deposit", amount: 15_000, submissionReference: crypto.randomUUID(), bankReference: "", destinationBankName: "Commercial Bank of Ethiopia", destinationAccountName: "", destinationAccountMasked: "" });
  const canAdjust = hasPermission(role, "adjust");
  const pendingStatuses = ["pending_verification", "pending_approval", "approved"];
  const movements = data.movements.filter((movement) => filter === "all" || (filter === "pending" ? pendingStatuses.includes(movement.status) : movement.type === filter));
  const variance = data.summary.statementTotal - data.summary.beneficialTotal;
  const movementTone = (status: string) => status === "completed" ? "success" : ["rejected", "failed"].includes(status) ? "danger" : status === "approved" ? "brand" : "warning";
  const chooseClient = (clientId: string) => {
    const client = activeClients.find((item) => item.id === clientId);
    setForm((current) => ({ ...current, clientId, accountId: client?.accountId }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await onCreate({ ...form, submissionReference: form.submissionReference || crypto.randomUUID() });
    if (saved) { setRecording(false); setForm((current) => ({ ...current, amount: 15_000, submissionReference: crypto.randomUUID(), bankReference: "", proofReference: "", destinationAccountName: "", destinationAccountMasked: "", notes: "" })); }
  };
  const openAction = (movement: CashMovementView, action: "verify" | "approve" | "complete" | "reject" | "fail") => { setActionDetail(action === "verify" ? movement.bankReference ?? "" : ""); setActionState({ movement, action }); };
  const confirmAction = async () => {
    if (!actionState) return;
    const requiresBankReference = ["verify", "complete"].includes(actionState.action);
    const saved = await onAction(actionState.movement.id, actionState.action, requiresBankReference ? { bankReference: actionDetail } : { reason: actionDetail });
    if (saved) setActionState(null);
  };
  return <><SectionHeader eyebrow="SAFEGUARDED CLIENT CASH" title="Client money operations" copy="Control deposits and withdrawals across pooled bank accounts while preserving each investor's exact beneficial ownership." action={canAdjust ? <button className="btn primary" onClick={() => setRecording((value) => !value)}>{recording ? "Close form" : "+ Record instruction"}</button> : undefined} />
    <div className="manual-banner"><span>CONTROL</span><p>Investor balances are a subledger of safeguarded pooled accounts. A zero variance is required between bank-confirmed cash, the bank book, and beneficial-owner allocations.</p><button onClick={() => setFilter("all")}>View full ledger <b>→</b></button></div>
    <section className="metric-grid cash-metrics"><Metric label="Pooled bank book" value={compactEtb(data.summary.bankBookTotal)} note={`${data.pools.length} safeguarded account${data.pools.length === 1 ? "" : "s"}`} tone="brand" /><Metric label="Beneficial ownership" value={compactEtb(data.summary.beneficialTotal)} note="Allocated investor by investor" tone="success" /><Metric label="Control variance" value={etb(variance)} note={variance === 0 ? "Bank and investor books agree" : "Stop and investigate"} tone={variance === 0 ? "success" : "danger"} /><Metric label="Deposits to verify" value={String(data.summary.pendingDeposits)} note="No credit before evidence match" tone="warning" /><Metric label="Withdrawals in flight" value={String(data.summary.pendingWithdrawals)} note="Reserved until paid or released" tone="purple" /></section>
    {recording && <form className="panel cash-capture" onSubmit={(event) => void submit(event)}><div className="panel-head"><div><span className="eyebrow">PAPER OR BRANCH INSTRUCTION</span><h2>Record a client cash instruction</h2></div><span className="account-number">Maker entry</span></div><div className="cash-capture-grid"><label>Client account<div className="brand-select"><select value={form.clientId} onChange={(event) => chooseClient(event.target.value)}>{activeClients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.name}</option>)}</select><i>⌄</i></div></label><label>Instruction type<div className="brand-select"><select value={form.movementType} onChange={(event) => setForm((current) => ({ ...current, movementType: event.target.value as "deposit" | "withdrawal" }))}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select><i>⌄</i></div></label><label>Pooled account<div className="brand-select"><select value={form.pooledBankAccountId} onChange={(event) => setForm((current) => ({ ...current, pooledBankAccountId: event.target.value }))}>{data.pools.map((pool) => <option key={pool.id} value={pool.id}>{displayLabel(pool.purpose)} · {pool.accountNumberMasked}</option>)}</select><i>⌄</i></div></label><label>Amount (ETB)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></label>{form.movementType === "deposit" ? <><label>Transfer / slip reference<input required value={form.bankReference ?? ""} onChange={(event) => setForm((current) => ({ ...current, bankReference: event.target.value }))} placeholder="Bank evidence reference" /></label><label>Receipt reference<input value={form.proofReference ?? ""} onChange={(event) => setForm((current) => ({ ...current, proofReference: event.target.value }))} placeholder="Scanned paper or document reference" /></label></> : <><label>Destination bank<input required value={form.destinationBankName ?? ""} onChange={(event) => setForm((current) => ({ ...current, destinationBankName: event.target.value }))} /></label><label>Verified account name<input required value={form.destinationAccountName ?? ""} onChange={(event) => setForm((current) => ({ ...current, destinationAccountName: event.target.value }))} /></label><label>Account last 4 only<input required minLength={4} value={form.destinationAccountMasked ?? ""} onChange={(event) => setForm((current) => ({ ...current, destinationAccountMasked: event.target.value.replace(/\D/g, "") }))} placeholder="4108" /></label></>}<label className="cash-notes">Operational note<input value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Source branch, paper form, callback, or supporting context" /></label></div><div className="cash-capture-foot"><p>{form.movementType === "deposit" ? "This creates a pending item only. Another authorized user must verify bank evidence before crediting cash." : "Cash is reserved when this instruction is recorded. Another authorized user must approve it before payment."}</p><button className="btn primary" disabled={busy === "cash_create" || !form.clientId || !form.pooledBankAccountId || form.amount <= 0}>{busy === "cash_create" ? "Recording…" : "Record for review"}</button></div></form>}
    <section className="cash-pool-grid">{data.pools.map((pool) => <article className="panel cash-pool" key={pool.id}><div className="cash-pool-head"><span><small>{displayLabel(pool.purpose)}</small><b>{pool.bankName}</b></span><span className={`status ${pool.status === "active" ? "status-success" : "status-neutral"}`}><i />{displayLabel(pool.status)}</span></div><h3>{pool.accountName}</h3><p>{pool.accountNumberMasked} · {pool.currency}</p><dl><div><dt>Bank-confirmed</dt><dd>{etb(pool.statementBalance)}</dd></div><div><dt>Internal bank book</dt><dd>{etb(pool.bookBalance)}</dd></div><div><dt>Investor allocations</dt><dd>{etb(pool.beneficialTotal)}</dd></div><div><dt>Variance</dt><dd className={pool.ownershipVariance || pool.bankVariance ? "negative" : "positive"}>{etb(pool.statementBalance - pool.beneficialTotal)}</dd></div></dl><footer>Last evidence match {pool.lastReconciledAt ? new Date(pool.lastReconciledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "not recorded"}</footer></article>)}</section>
    <div className="filter-row cash-filters">{(["pending", "all", "deposit", "withdrawal"] as const).map((item) => <button key={item} className={`filter ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{displayLabel(item)} <b>{item === "all" ? data.movements.length : item === "pending" ? data.movements.filter((movement) => pendingStatuses.includes(movement.status)).length : data.movements.filter((movement) => movement.type === item).length}</b></button>)}<span /></div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL QUEUE</span><h2>Deposit and withdrawal instructions</h2></div><span className="account-number">{movements.length} shown</span></div>{movements.length ? <div className="table-scroll"><table className="cash-table"><thead><tr><th>Instruction / time</th><th>Client</th><th>Type</th><th className="num">Amount</th><th>Pooled account</th><th>Bank / payment evidence</th><th>Channel</th><th>Status</th><th>Available action</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td><b>{movement.id}</b><small>{new Date(movement.submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></td><td><b>{movement.client?.name ?? "Client"}</b><small>{movement.client?.code} · {movement.account?.number}</small></td><td><span className={`cash-type cash-${movement.type}`}>{movement.type === "deposit" ? "↓ Deposit" : "↑ Withdrawal"}</span></td><td className="num"><b>{fmt.format(movement.amount)}</b><small>{movement.currency}</small></td><td><b>{displayLabel(movement.pool?.purpose ?? "general")}</b><small>{movement.pool?.accountNumberMasked}</small></td><td><b>{movement.bankReference ?? movement.destinationBankName ?? "Not recorded"}</b><small>{movement.type === "withdrawal" ? `${movement.destinationAccountName ?? ""} ${movement.destinationAccountMasked ?? ""}` : movement.proofReference ?? "Awaiting evidence match"}</small></td><td>{displayLabel(movement.channel)}</td><td><span className={`status status-${movementTone(movement.status)}`}><i />{displayLabel(movement.status)}</span></td><td><div className="cash-row-actions">{canAdjust && movement.type === "deposit" && movement.status === "pending_verification" && <><button className="btn primary small" onClick={() => openAction(movement, "verify")}>Verify & credit</button><button className="btn danger small" onClick={() => openAction(movement, "reject")}>Reject</button></>}{canAdjust && movement.type === "withdrawal" && movement.status === "pending_approval" && <><button className="btn primary small" onClick={() => openAction(movement, "approve")}>Approve</button><button className="btn danger small" onClick={() => openAction(movement, "reject")}>Reject</button></>}{canAdjust && movement.type === "withdrawal" && movement.status === "approved" && <><button className="btn primary small" onClick={() => openAction(movement, "complete")}>Mark paid</button><button className="btn danger small" onClick={() => openAction(movement, "fail")}>Payment failed</button></>}{(!canAdjust || ["completed", "rejected", "failed"].includes(movement.status)) && <span className="muted-label">No action</span>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="No cash instructions in this view" copy="New investor-portal and broker-desk instructions appear here for controlled processing." />}</section>
    {actionState && <div className="cash-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActionState(null); }}><section className="cash-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-action-title"><span className="eyebrow">CONTROLLED ACTION</span><h2 id="cash-action-title">{displayLabel(actionState.action)} {actionState.movement.type}</h2><p>{actionState.movement.client?.name} · {etb(actionState.movement.amount)} · {actionState.movement.id}</p><label>{["verify", "complete"].includes(actionState.action) ? "Bank evidence / payment reference" : actionState.action === "approve" ? "Approval note (optional)" : "Reason (required)"}<input autoFocus value={actionDetail} onChange={(event) => setActionDetail(event.target.value)} placeholder={["verify", "complete"].includes(actionState.action) ? "Confirmed bank reference" : "Record the control decision"} /></label><div><button className="btn secondary" onClick={() => setActionState(null)}>Cancel</button><button className={`btn ${["reject", "fail"].includes(actionState.action) ? "danger" : "primary"}`} disabled={Boolean(busy) || (actionState.action !== "approve" && !actionDetail.trim())} onClick={() => void confirmAction()}>{busy ? "Saving…" : actionState.action === "verify" ? "Verify and credit" : actionState.action === "complete" ? "Confirm payment" : displayLabel(actionState.action)}</button></div></section></div>}
  </>;
}

function SettlementPage({ orders, onOpen, onExport }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void; onExport: () => void }) {
  const queue = orders.filter((order) => ["settlement_pending", "partially_filled", "settled"].includes(order.status) || order.trades?.some((trade) => trade.settlementStatus !== "settled"));
  const settledCash = queue.filter((order) => (order.cashStatus ?? (order.status === "settled" ? "settled" : "pending")) === "settled").length;
  const settledSecurities = queue.filter((order) => (order.securitiesStatus ?? (order.status === "settled" ? "settled" : "pending")) === "settled").length;
  return <><SectionHeader eyebrow="POST-TRADE CONTROL" title="Settlement tracking" copy="Confirm cash and securities legs, value dates, and operational exceptions." action={<button className="btn secondary" onClick={onExport}>Export queue</button>} /><section className="metric-grid settlement-metrics"><Metric label="Settlement records" value={String(queue.length)} note={`${queue.filter((order) => order.status !== "settled").length} awaiting completion`} tone="warning" /><Metric label="Cash confirmed" value={`${settledCash} / ${queue.length}`} note={`${queue.length - settledCash} awaiting confirmation`} tone="success" /><Metric label="Securities confirmed" value={`${settledSecurities} / ${queue.length}`} note={`${queue.length - settledSecurities} awaiting confirmation`} tone="purple" /><Metric label="Exceptions" value={String(queue.filter((order) => order.cashStatus === "exception" || order.securitiesStatus === "exception").length)} note="From settlement records" tone="danger" /></section><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Client</th><th>Instrument</th><th>Value date</th><th className="num">Net amount</th><th>Cash</th><th>Securities</th><th>Overall</th></tr></thead><tbody>{queue.map((order) => { const cash = order.cashStatus ?? (order.status === "settled" ? "settled" : "pending"); const securities = order.securitiesStatus ?? (order.status === "settled" ? "settled" : "pending"); return <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.tradeId ?? "Trade pending"}</b><small>{order.id}</small></td><td><b>{order.client}</b></td><td><b>{order.symbol}</b><small>{order.side.toUpperCase()} {fmt.format(order.tradeQuantity ?? order.quantity)}</small></td><td><b>{order.settlementDate ?? "Pending"}</b></td><td className="num"><b>{fmt.format(order.tradeNet ?? order.estimatedNet)}</b><small>ETB</small></td><td><span className={`leg ${cash === "settled" ? "done" : "pending"}`}>{displayLabel(cash)}</span></td><td><span className={`leg ${securities === "settled" ? "done" : "pending"}`}>{displayLabel(securities)}</span></td><td><StatusBadge status={order.status} /></td></tr>; })}</tbody></table></div></section></>;
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

type SettingsControls = { brokerageFeePct: number; minimumFee: number; approvalThreshold: number; clientDailyLimit: number; makerChecker: boolean; allowedOrderTypes: string[]; settlementCycle: string };
const STAFF_ROLES: Role[] = ["broker_admin", "trader", "operations", "compliance", "settlement", "management"];
const PERMISSION_COLUMNS: [string, string][] = [["create", "Create"], ["approve", "Approve"], ["reject", "Reject"], ["trade", "Trade"], ["settle", "Settle"], ["adjust", "Adjust"], ["report", "Report"]];
const FEATURE_LABELS: Record<string, string> = { investorPortal: "Investor portal", selfDirected: "Self-directed investing", bonds: "Government bonds", recurringInvestments: "Recurring investments", institutionalAccounts: "Institutional accounts", manualTradeCapture: "Manual trade capture" };

function SettingsPage() {
  const [tenant, setTenant] = useState<{ name: string; license: string; controls: SettingsControls | null; features: Record<string, boolean> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/tenant", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { tenant?: { tradingName?: string; name?: string; licenseNumber?: string; controls?: SettingsControls; features?: Record<string, boolean> } }) => {
        if (data.tenant) setTenant({ name: data.tenant.tradingName ?? data.tenant.name ?? "Abyssinia Securities", license: data.tenant.licenseNumber ?? "ESCA-BR-004", controls: data.tenant.controls ?? null, features: data.tenant.features ?? {} });
      })
      .catch(() => setTenant({ name: "Abyssinia Securities", license: "ESCA-BR-004", controls: { brokerageFeePct: 0.5, minimumFee: 25, approvalThreshold: 250000, clientDailyLimit: 2500000, makerChecker: true, allowedOrderTypes: ["Market", "Limit"], settlementCycle: "T+2" }, features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true } }));
    return () => controller.abort();
  }, []);
  const controls = tenant?.controls;
  const features = tenant?.features ?? {};
  return <>
    <SectionHeader eyebrow="WORKSPACE" title="Settings" copy="Your tenant configuration and team. Platform-level controls are set by Frank." />
    <div className="settings-banner"><span>PLATFORM MANAGED</span><p>Fees, limits, features, and instrument access are configured by your Frank platform administrator. Contact them to request a change.</p></div>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">TENANT POLICY</span><h2>Trading controls</h2></div></div>
      <dl className="detail-grid settings-grid">
        <div><dt>Trading name</dt><dd>{tenant?.name ?? "—"}</dd></div>
        <div><dt>License</dt><dd>{tenant?.license || "—"}</dd></div>
        <div><dt>Brokerage fee</dt><dd>{controls ? `${controls.brokerageFeePct}%` : "—"}</dd></div>
        <div><dt>Minimum fee</dt><dd>{controls ? etb(controls.minimumFee) : "—"}</dd></div>
        <div><dt>Approval threshold</dt><dd>{controls ? etb(controls.approvalThreshold) : "—"}</dd></div>
        <div><dt>Client daily limit</dt><dd>{controls ? etb(controls.clientDailyLimit) : "—"}</dd></div>
        <div><dt>Maker-checker</dt><dd>{controls ? (controls.makerChecker ? "Required" : "Off") : "—"}</dd></div>
        <div><dt>Settlement cycle</dt><dd>{controls?.settlementCycle ?? "—"}</dd></div>
      </dl>
    </section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">CAPABILITIES</span><h2>Feature access</h2></div></div>
      <div className="feature-list">{Object.entries(FEATURE_LABELS).map(([key, label]) => <span key={key} className={features[key] ? "on" : "off"}><i />{label}</span>)}</div>
    </section>
  </>;
}

function UsersPage({ role }: { role: Role }) {
  return <>
    <SectionHeader eyebrow="ADMINISTRATION" title="Users &amp; roles" copy="Who can access this workspace, and what each role is permitted to do." />
    <div className="settings-banner"><span>PLATFORM MANAGED</span><p>User accounts are provisioned by your Frank platform administrator. Contact them to invite a colleague, change a role, or suspend access.</p></div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">ACCESS</span><h2>Team</h2></div><span className="account-number">{STAFF_ROLES.length} users</span></div>
      <div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th className="num">Permissions</th><th>Status</th></tr></thead><tbody>
        {STAFF_ROLES.map((staffRole) => <tr key={staffRole}><td><b>{roleNames[staffRole]}</b>{staffRole === role && <small>You</small>}</td><td>{roleLabels[staffRole]}</td><td className="num">{workflowPermissions[staffRole].length} of {PERMISSION_COLUMNS.length}</td><td><span className="status status-success"><i />Active</span></td></tr>)}
      </tbody></table></div>
    </section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL MATRIX</span><h2>Roles &amp; permissions</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>Role</th>{PERMISSION_COLUMNS.map(([key, label]) => <th key={key} className="num">{label}</th>)}</tr></thead><tbody>
        {STAFF_ROLES.map((staffRole) => <tr key={staffRole}><td><b>{roleLabels[staffRole]}</b></td>{PERMISSION_COLUMNS.map(([key]) => <td key={key} className="num">{workflowPermissions[staffRole].includes(key) ? <span className="perm-yes">✓</span> : <span className="perm-no">–</span>}</td>)}</tr>)}
      </tbody></table></div>
      <div className="settings-note">Permissions are set by role. Segregation of duties is enforced server-side: the maker of an order or onboarding record cannot approve it.</div>
    </section>
  </>;
}

function ReportsPage({ orders, clients, audit, onDownloaded }: { orders: DemoOrder[]; clients: BrokerClient[]; audit: AuditEntry[]; onDownloaded: (name: string) => void }) {
  const reports = useMemo(() => buildReports(orders, clients, audit), [orders, clients, audit]);
  const totalFees = useMemo(() => feesEarned(orders), [orders]);
  const download = (report: Report) => { downloadCsv(report); onDownloaded(report.name); };
  return <><SectionHeader eyebrow="CONTROL REPORTING" title="Reports" copy="Operational, client asset, fee, and audit exports generated from the current book." />
    <div className="report-grid">{reports.map((report, index) => <button className="panel report-card" key={report.id} onClick={() => download(report)} disabled={report.rows.length === 0}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{report.name}</h3><p>{report.description}</p></div><em>{report.rows.length} {report.rows.length === 1 ? "row" : "rows"} · CSV <b>↓</b></em></button>)}</div>
    <section className="panel fee-summary"><div><span className="eyebrow">EXECUTED THIS PERIOD</span><h2>Brokerage fees earned</h2><p>Sum of fees on executed orders in the current book.</p></div><strong>{etb(totalFees)}<small>{reports.find((report) => report.id === "fees")?.rows.length ?? 0} executed orders</small></strong></section></>;
}

function AuditPage({ events }: { events: AuditEntry[] }) {
  const exportAudit = () => {
    const rows = [["Time", "Actor", "Action", "Entity", "Detail"], ...events.map((item) => [item.time, item.actor, item.action, item.entity, item.detail])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "frankbroker-audit-log.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <><SectionHeader eyebrow="CONTROL RECORD" title="Audit trail" copy="Sensitive actions, actors, timestamps, and recorded state for every workflow." action={<button className="btn secondary" onClick={exportAudit}>Export audit log</button>} /><section className="panel audit-timeline">{events.map((item) => { const date = new Date(item.time); return <div key={item.id ?? `${item.time}-${item.action}`}><span className="audit-dot" /><time>{Number.isNaN(date.getTime()) ? "Demo record" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<br /><b>{auditTime(item.time)}</b></time><div><span className="asset-chip">{displayLabel(item.entity)}</span><h3>{displayLabel(item.action)}</h3><p>{item.detail}</p></div><strong>{item.actor}<small>Addis Ababa · Workspace</small></strong></div>; })}</section></>;
}

function NewClientForm({ value, setValue, busy, onCancel, onSubmit }: { value: NewClientValue; setValue: (value: NewClientValue) => void; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent) => void }) {
  const organization = value.clientType === "institution" || value.clientType === "corporate";
  const faydaValid = /^\d{12}$/.test(value.faydaId);
  const tinValid = /^\d{10,12}$/.test(value.tin.replace(/\D/g, ""));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email);
  const banksValid = value.linkedBanks.length >= 1 && value.linkedBanks.length <= 3 && value.linkedBanks.every((bank) =>
    bank.bankName.trim().length >= 2
    && bank.accountNumber.replace(/\s/g, "").length >= 8
    && bank.accountHolderName.trim().toLocaleLowerCase() === value.fullName.trim().toLocaleLowerCase()
  );
  const ready = value.fullName.trim().length >= 3
    && value.phone.trim().length >= 7
    && emailValid
    && faydaValid
    && tinValid
    && (!organization || value.address.trim().length >= 4)
    && value.sourceOfFunds.trim().length >= 3
    && value.investmentObjective.trim().length >= 3
    && value.taxResidency.trim().length >= 3
    && value.termsAccepted
    && (!organization || (
      value.businessRegistrationNumber.trim().length >= 4
      && value.authorizedRepresentativeName.trim().length >= 3
      && value.beneficialOwnerName.trim().length >= 3
      && value.signatoryAuthorityConfirmed
    ))
    && banksValid;
  const set = <K extends keyof NewClientValue>(key: K, next: NewClientValue[K]) => setValue({ ...value, [key]: next });
  const setLegalName = (next: string) => setValue({
    ...value,
    fullName: next,
    linkedBanks: value.linkedBanks.map((bank) => ({
      ...bank,
      accountHolderName: !bank.accountHolderName || bank.accountHolderName === value.fullName ? next : bank.accountHolderName,
    })),
  });
  const setDocument = (type: OnboardingDocumentType, file: File | null) => setValue({
    ...value,
    documentFiles: { ...value.documentFiles, [type]: file ?? undefined },
  });
  const updateBank = (id: string, field: keyof Omit<NewClientBank, "id">, next: string) => setValue({
    ...value,
    linkedBanks: value.linkedBanks.map((bank) => bank.id === id ? { ...bank, [field]: next } : bank),
  });
  const addBank = () => value.linkedBanks.length < 3 && setValue({
    ...value,
    linkedBanks: [...value.linkedBanks, { id: crypto.randomUUID(), bankName: "Commercial Bank of Ethiopia", accountNumber: "", accountHolderName: value.fullName }],
  });
  const removeBank = (id: string) => value.linkedBanks.length > 1 && setValue({ ...value, linkedBanks: value.linkedBanks.filter((bank) => bank.id !== id) });
  const chooseClientType = (clientType: NewClientValue["clientType"]) => {
    const nextOrganization = clientType !== "individual";
    setValue({
      ...value,
      clientType,
      proofOfAddressType: nextOrganization ? "" : "Drivers License",
      proofOfAddressReference: "",
      documentFiles: nextOrganization
        ? { ...value.documentFiles, proof_of_address: undefined }
        : {
          proof_of_address: value.documentFiles.proof_of_address,
          business_license: undefined,
          tin_certificate: undefined,
          certificate_of_incorporation: undefined,
          article_of_association: undefined,
        },
    });
  };
  const documentFields: Array<[OnboardingDocumentType, string]> = organization
    ? [
      ["business_license", "Business license"],
      ["tin_certificate", "TIN certificate"],
      ["certificate_of_incorporation", "Certificate of Incorporation"],
      ["article_of_association", "Article of Association"],
    ]
    : [["proof_of_address", "Proof of address document"]];
  return <form onSubmit={onSubmit} className="drawer-content client-onboarding-form">
    <div className="drawer-title"><span className="eyebrow">CONTROLLED CLIENT ONBOARDING</span><h2>Add a client</h2><p>Capture identity, documents, authority, and consent. The account remains unavailable for trading until an authorized second user approves it.</p></div>
    <div className="stepper"><span className="active">1 <b>Client record</b></span><i /><span className={ready ? "active" : ""}>2 <b>Approval</b></span><i /><span>3 <b>Trading active</b></span></div>
    <section className="form-section">
      <h3>Account owner</h3>
      <div className="field-row"><label>Onboarding source<select value={value.onboardingChannel} onChange={(event) => set("onboardingChannel", event.target.value as NewClientValue["onboardingChannel"])}><option value="digital">Digital</option><option value="in_person">In person</option><option value="neway">Neway</option><option value="phone">Phone</option></select></label><label>External reference<input value={value.externalClientReference} onChange={(event) => set("externalClientReference", event.target.value)} placeholder="e.g. Neway reference" /><small className="optional-label">Optional</small></label></div>
      <div className="segmented three"><button type="button" className={value.clientType === "individual" ? "active buy" : ""} onClick={() => chooseClientType("individual")}>INDIVIDUAL</button><button type="button" className={value.clientType === "corporate" ? "active buy" : ""} onClick={() => chooseClientType("corporate")}>CORPORATE</button><button type="button" className={value.clientType === "institution" ? "active buy" : ""} onClick={() => chooseClientType("institution")}>INSTITUTIONAL</button></div>
      <label>{organization ? "Legal organization name" : "Full legal name"}<input value={value.fullName} onChange={(event) => setLegalName(event.target.value)} placeholder="As shown on official records" /></label>
      <div className="field-row"><label>Phone<input value={value.phone} onChange={(event) => set("phone", event.target.value.replace(/[^0-9+]/g, ""))} placeholder="+251…" /></label><label>Email<input type="email" value={value.email} onChange={(event) => set("email", event.target.value)} placeholder="client@example.et" /></label></div>
      {organization && <label>Registered address<input value={value.address} onChange={(event) => set("address", event.target.value)} placeholder="City, sub-city, and locality" /></label>}
      <div className="field-row"><label>Nationality<input value={value.nationality} onChange={(event) => set("nationality", event.target.value)} /></label><label>Country of residence<input value={value.countryOfResidence} onChange={(event) => set("countryOfResidence", event.target.value)} /></label></div>
    </section>
    <section className="form-section">
      <h3>Identity and tax</h3>
      <div className="field-row"><label>{organization ? "Representative Fayda FIN" : "Fayda FIN"}<input inputMode="numeric" maxLength={12} value={value.faydaId} onChange={(event) => set("faydaId", event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12 digits" /><small>{value.faydaId && !faydaValid ? "FIN must contain 12 digits." : "Only a masked reference is retained."}</small></label><label>TIN<input inputMode="numeric" value={value.tin} onChange={(event) => set("tin", event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="10–12 digits" /><small>{value.tin && !tinValid ? "Enter a valid TIN." : "Used for tax and account records."}</small></label></div>
      {!organization && <label>Proof of address type<select value={value.proofOfAddressType} onChange={(event) => set("proofOfAddressType", event.target.value)}><option>Drivers License</option><option>Kebele ID</option></select></label>}
      <div className="broker-document-uploads">{documentFields.map(([type, label]) => <label className="broker-document-upload" key={type}>{label}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setDocument(type, event.target.files?.[0] ?? null)} /><span>{value.documentFiles[type] ? value.documentFiles[type]!.name : `Upload ${label.toLocaleLowerCase()}`}</span><small>PDF, PNG or JPG, up to 10 MB</small></label>)}</div>
      <label>CSD account/reference <span className="optional-label">optional</span><input value={value.csdReference} onChange={(event) => set("csdReference", event.target.value)} placeholder="Record when available" /></label>
      <div className="field-row"><label>Occupation / business activity<input value={value.occupation} onChange={(event) => set("occupation", event.target.value)} /></label><label>Source of funds<input value={value.sourceOfFunds} onChange={(event) => set("sourceOfFunds", event.target.value)} placeholder="Employment, business, pension…" /></label></div>
      <div className="field-row"><label>Investment objective<input value={value.investmentObjective} onChange={(event) => set("investmentObjective", event.target.value)} /></label><label>Tax residency<input value={value.taxResidency} onChange={(event) => set("taxResidency", event.target.value)} /></label></div>
      <label>PEP declaration<select value={value.pepStatus} onChange={(event) => set("pepStatus", event.target.value as NewClientValue["pepStatus"])}><option value="not_pep">Not a politically exposed person</option><option value="pep">Politically exposed person</option><option value="related_to_pep">Family member / close associate</option></select></label>
    </section>
    {organization && <section className="form-section">
      <h3>{value.clientType === "corporate" ? "Corporate authority" : "Institutional authority"}</h3>
      <label>Business registration number<input value={value.businessRegistrationNumber} onChange={(event) => set("businessRegistrationNumber", event.target.value)} /></label>
      <div className="field-row"><label>Authorized representative<input value={value.authorizedRepresentativeName} onChange={(event) => set("authorizedRepresentativeName", event.target.value)} /></label><label>Beneficial owner / controller<input value={value.beneficialOwnerName} onChange={(event) => set("beneficialOwnerName", event.target.value)} /></label></div>
      <label className="control-checkbox"><input type="checkbox" checked={value.signatoryAuthorityConfirmed} onChange={(event) => set("signatoryAuthorityConfirmed", event.target.checked)} /><i>{value.signatoryAuthorityConfirmed ? "✓" : ""}</i><span><b>Signatory authority confirmed</b><small>The representative is authorized to open and operate the account.</small></span></label>
    </section>}
    <section className="form-section">
      <h3>Linked bank accounts</h3>
      <p className="form-section-copy">Add accounts in the client&apos;s legal name. The broker must approve each account before it can receive a withdrawal.</p>
      <div className="broker-linked-banks">{value.linkedBanks.map((bank, index) => <div className="broker-linked-bank" key={bank.id}><header><b>Bank account {index + 1}</b>{value.linkedBanks.length > 1 && <button type="button" onClick={() => removeBank(bank.id)}>Remove</button>}</header><label>Bank name<input value={bank.bankName} onChange={(event) => updateBank(bank.id, "bankName", event.target.value)} /></label><label>Account number<input value={bank.accountNumber} onChange={(event) => updateBank(bank.id, "accountNumber", event.target.value.replace(/\s/g, ""))} /></label><label>Account holder name<input value={bank.accountHolderName} onChange={(event) => updateBank(bank.id, "accountHolderName", event.target.value)} /><small>{bank.accountHolderName && bank.accountHolderName.trim().toLocaleLowerCase() !== value.fullName.trim().toLocaleLowerCase() ? "Account holder name must match verified records." : "Must match the client’s verified legal name."}</small></label></div>)}</div>
      {value.linkedBanks.length < 3 && <button type="button" className="btn secondary small" onClick={addBank}>＋ Add another bank</button>}
      <div className="client-approval-callout"><span>REVIEW</span><div><b>What happens next</b><small>Each bank account is reviewed separately. Client approval can continue while a bank is waiting for review.</small></div></div>
    </section>
    <section className="form-section">
      <h3>Risk and consent</h3>
      <label>Initial risk rating<select value={value.riskRating} onChange={(event) => set("riskRating", event.target.value as NewClientValue["riskRating"])}><option value="standard">Standard</option><option value="enhanced">Enhanced due diligence</option><option value="review">Compliance review</option></select></label>
      <label className="control-checkbox"><input type="checkbox" checked={value.termsAccepted} onChange={(event) => set("termsAccepted", event.target.checked)} /><i>{value.termsAccepted ? "✓" : ""}</i><span><b>Current brokerage agreement accepted</b><small>Record acceptance only after the client has reviewed the tenant’s published terms.</small></span></label>
      <label className="control-checkbox"><input type="checkbox" checked={value.electronicDeliveryConsent} onChange={(event) => set("electronicDeliveryConsent", event.target.checked)} /><i>{value.electronicDeliveryConsent ? "✓" : ""}</i><span><b>Electronic delivery consent</b><small>Contract notes, statements, and account notices may be sent electronically.</small></span></label>
    </section>
    <div className="client-approval-callout"><span>FOUR-EYES</span><div><b>Approval is a separate step</b><small>This record will be created as Pending Approval. It will not appear in New Order until KYC, consent, and account activation controls pass.</small></div></div>
    <div className="drawer-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !ready}>{busy ? "Submitting…" : "Submit for approval"} <span>→</span></button></div>
  </form>;
}

function NewOrderForm({ value, setValue, clients, instruments, controls, checks, busy, onValidate, onSubmit }: { value: NewOrderValue; setValue: (value: NewOrderValue) => void; clients: BrokerClient[]; instruments: BrokerInstrument[]; controls: TenantControls; checks: { label: string; passed: boolean; message: string }[] | null; busy: boolean; onValidate: () => void; onSubmit: (event: FormEvent) => void }) {
  const client = clients.find((item) => item.accountId === value.accountId) ?? clients[0];
  const instrument = instruments.find((item) => item.id === value.instrumentId) ?? instruments[0];
  const assetClass = instrument?.asset.toLowerCase().includes("bond") ? "bond" : "equity";
  const feeRule = controls.feeRules.find((rule) => rule.assetClass === assetClass);
  const amounts = calculateConfiguredAmounts(value.side, Number(value.quantity) || 0, Number(value.price) || 0, controls.brokerageFeePct, controls.minimumFee, feeRule);
  return <form onSubmit={onSubmit} className="drawer-content">
    <div className="drawer-title"><span className="eyebrow">MANUAL ORDER ENTRY</span><h2>Create client order</h2><p>Capture the instruction, run server-side controls, then submit for approval.</p></div>
    <div className="stepper"><span className="active">1 <b>Instruction</b></span><i /><span className={checks ? "active" : ""}>2 <b>Validation</b></span><i /><span>3 <b>Review</b></span></div>
    <div className="form-section"><h3>Client instruction</h3>
      <label>Client account<select value={value.accountId} onChange={(event) => setValue({ ...value, accountId: event.target.value })}>{clients.map((item) => <option key={item.id} value={item.accountId}>{item.code} · {item.name}</option>)}</select><small>{client ? `${etb(client.availableCash)} available cash · KYC ${client.kyc.replaceAll("_", " ")}` : "No client accounts available"}</small></label>
      <label>Instruction source<select value={value.source} onChange={(event) => setValue({ ...value, source: event.target.value as NewOrderValue["source"], verificationId: "", verificationCode: "", demoCode: "" })}><option value="digital">Digital</option><option value="in_person">In person</option><option value="neway">Neway</option><option value="phone">Phone</option></select><small>The source is retained on the order and audit trail.</small></label>
      <label>Instrument<select value={instrument?.id ?? ""} disabled={!instruments.length} onChange={(event) => { const next = instruments.find((item) => item.id === event.target.value); if (next) setValue({ ...value, instrumentId: next.id, price: String(next.price) }); }}>{instruments.length ? instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>) : <option value="">No instruments enabled</option>}</select><small>{instrument ? `${instrument.asset} · ${instrument.status} · Lot ${instrument.lot} · ${instrument.cycle}` : "Enable an instrument for this tenant in the admin console."}</small></label>
      <div className="segmented"><button type="button" className={value.side === "buy" ? "active buy" : ""} onClick={() => setValue({ ...value, side: "buy" })}>BUY</button><button type="button" className={value.side === "sell" ? "active sell" : ""} onClick={() => setValue({ ...value, side: "sell" })}>SELL</button></div>
      <div className="field-row"><label>Quantity<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /></label><label>Limit price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div>
      <div className="field-row"><label>Order type<select value={value.orderType} disabled={!controls.allowedOrderTypes.length} onChange={(event) => setValue({ ...value, orderType: event.target.value })}>{controls.allowedOrderTypes.length ? controls.allowedOrderTypes.map((orderType) => <option key={orderType}>{orderType}</option>) : <option value="">No order types enabled</option>}</select></label><label>Validity<select value={value.validity} onChange={(event) => setValue({ ...value, validity: event.target.value })}><option>Day</option><option>Good till date</option><option>Immediate or cancel</option></select></label></div>
      <label>Dealer notes<textarea rows={3} placeholder="Optional client instruction details" value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label>
      {value.verificationId && <div className="client-approval-callout"><span>CLIENT AUTHORIZATION</span><div><b>Enter the one-time code</b><small>The code is bound to this account, instrument, side, quantity, price, order type, source, and submission reference.{value.demoCode ? ` Demo code: ${value.demoCode}` : ""}</small><input inputMode="numeric" maxLength={6} value={value.verificationCode} onChange={(event) => setValue({ ...value, verificationCode: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6-digit code" /></div></div>}
    </div>
    <div className="estimate-card"><span><small>Gross consideration</small><b>{etb(amounts.gross)}</b></span><span><small>Brokerage{feeRule ? ` (${feeRule.brokeragePct.toFixed(2)}%)` : ""}</small><b>{etb(amounts.brokerage)}</b></span>{amounts.regulator > 0 && <span><small>ECMA fee</small><b>{etb(amounts.regulator)}</b></span>}{amounts.exchange > 0 && <span><small>ESX fee</small><b>{etb(amounts.exchange)}</b></span>}{amounts.csd > 0 && <span><small>CSD fee</small><b>{etb(amounts.csd)}</b></span>}<span><small>Total estimated fees</small><b>{etb(amounts.fees)}</b></span><span><small>Estimated net</small><strong>{etb(amounts.net)}</strong></span></div>
    <div className="validation-card"><div><h3>Pre-trade validation</h3><button type="button" className="btn secondary small" onClick={onValidate}>Run validation</button></div>{checks ? <ul>{checks.map((check) => <li key={check.label} className={check.passed ? "pass" : "fail"}><span>{check.passed ? "✓" : "!"}</span><b>{check.label}</b><small>{check.message}</small></li>)}</ul> : <p>Run all cash, holdings, KYC, account, tradability, order-type, lot, and tick-size controls before submission.</p>}</div>
    <div className="drawer-actions"><button type="button" className="btn secondary" disabled>Save draft</button><button type="submit" className="btn primary" disabled={busy || !checks?.every((item) => item.passed)}>{busy ? "Submitting…" : value.verificationId ? "Verify & submit" : "Request authorization"} <span>→</span></button></div>
  </form>;
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

function OrderDetail({ order, role, busy, controls, manualTradeCapture, onApprove, onReject, onCancel, onFail, onTrade, onSettle, onContract }: { order: DemoOrder; role: Role; busy: string | null; controls: TenantControls; manualTradeCapture: boolean; onApprove: () => void; onReject: () => void; onCancel: () => void; onFail: () => void; onTrade: () => void; onSettle: () => void; onContract: () => void }) {
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
    <div className="current-action-card"><span><small>NEXT ACTION</small><b>{responsibility.nextAction}</b><em>{ACTIVE_ORDER_STATUSES.has(order.status) ? waitingTime(lastChangedAt) : `Last updated ${new Date(lastChangedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}</em></span><span><small>RESPONSIBLE</small><strong>{responsibility.actionOwner}</strong><em>{order.trader !== "Unassigned" ? `Assigned trader: ${order.trader}` : "No individual assigned"}</em></span></div>
    {exceptionReason && <div className="order-exception-card"><i>!</i><span><b>{displayLabel(order.status)}</b><p>{exceptionReason}</p></span></div>}
    <div className="fill-progress"><span><b>{fmt.format(filled)}</b> filled</span><span><b>{fmt.format(remaining)}</b> remaining</span><i><em style={{ width: `${Math.min(100, (filled / order.quantity) * 100)}%` }} /></i></div>
    <dl className="detail-grid">
      <div><dt>Original quantity</dt><dd>{fmt.format(order.quantity)}</dd></div><div><dt>Filled quantity</dt><dd>{fmt.format(filled)}</dd></div><div><dt>Remaining quantity</dt><dd>{fmt.format(remaining)}</dd></div>
      <div><dt>Average fill price</dt><dd>{order.averageFillPrice ? `${fmt.format(order.averageFillPrice)} ETB` : "—"}</dd></div><div><dt>Estimated value</dt><dd>{etb(order.estimatedNet)}</dd></div><div className="total"><dt>Final executed value</dt><dd>{filled ? etb(order.executedNet ?? order.tradeNet ?? 0) : "—"}</dd></div>
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

function TradeForm({ order, value, setValue, controls, busy, onSubmit, onCancel }: { order: DemoOrder; value: TradeValue; setValue: (value: TradeValue) => void; controls: TenantControls; busy: boolean; onSubmit: (event: FormEvent) => void; onCancel: () => void }) {
  const fillGross = (Number(value.quantity) || 0) * (Number(value.price) || 0);
  const cumulativeFeeTarget = fillGross > 0 ? Math.max(controls.minimumFee, ((order.executedGross ?? 0) + fillGross) * (controls.brokerageFeePct / 100)) : 0;
  const fillFees = Math.max(0, cumulativeFeeTarget - (order.executedFees ?? 0));
  const amount = { gross: fillGross, fees: fillFees, net: order.side === "buy" ? fillGross + fillFees : fillGross - fillFees };
  const remaining = order.remainingQuantity ?? order.quantity;
  return <form onSubmit={onSubmit} className="drawer-content"><div className="drawer-title"><span className="eyebrow">MANUAL TRADE CAPTURE</span><h2>Record execution</h2><p>Link a full or partial fill to {order.id}. No ESX message will be sent.</p></div><div className="manual-callout"><span>MANUAL</span><p>Confirm these details against the official external execution record before capture.</p></div><div className="order-reference"><span>{order.side.toUpperCase()}</span><div><b>{fmt.format(remaining)} {order.symbol} remaining</b><small>{order.client} · Limit {fmt.format(order.price)} ETB</small></div></div><div className="form-section"><div className="field-row"><label>Quantity filled<input inputMode="numeric" value={value.quantity} onChange={(event) => setValue({ ...value, quantity: event.target.value })} /><small>Maximum remaining {fmt.format(remaining)}</small></label><label>Execution price (ETB)<input inputMode="decimal" value={value.price} onChange={(event) => setValue({ ...value, price: event.target.value })} /></label></div><div className="field-row"><label>Trade date<input type="date" value={value.tradeDate} onChange={(event) => setValue({ ...value, tradeDate: event.target.value })} /></label><label>Execution reference<input required maxLength={120} value={value.captureReference} onChange={(event) => setValue({ ...value, captureReference: event.target.value })} placeholder="Exchange or broker confirmation" /><small>Use the reference shown on the official execution record.</small></label></div></div><div className="estimate-card"><span><small>Gross amount</small><b>{etb(amount.gross)}</b></span><span><small>Fees</small><b>{etb(amount.fees)}</b></span><span><small>Net amount</small><strong>{etb(amount.net)}</strong></span></div><div className="drawer-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !value.captureReference.trim()}>{busy ? "Capturing…" : "Capture trade & open settlement"}</button></div></form>;
}

function ContractNote({ order, instruments, tenantInfo, settlementCycle, busy, onPrint }: { order: DemoOrder; instruments: BrokerInstrument[]; tenantInfo: TenantInfo; settlementCycle: string; busy: boolean; onPrint: () => void }) {
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
