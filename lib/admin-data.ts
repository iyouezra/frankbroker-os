export type TenantStatus = "active" | "pilot" | "suspended";
export type TenantPlan = "Enterprise" | "Growth" | "Pilot";
export type FeatureKey = "investorPortal" | "selfDirected" | "bonds" | "recurringInvestments" | "institutionalAccounts" | "manualTradeCapture";
export type AdminFeeRule = {
  assetClass: "equity" | "bond";
  marketSegment: string;
  brokeragePct: number;
  regulatorPct: number;
  exchangePct: number;
  csdPct: number;
  minimumFee: number;
  maximumFee: number | null;
};

export type TenantConfig = {
  id: string;
  name: string;
  tradingName: string;
  initials: string;
  licenseNumber: string;
  status: TenantStatus;
  plan: TenantPlan;
  domain: string;
  supportEmail: string;
  primaryColor: string;
  welcomeMessage: string;
  baseCurrency: "ETB";
  timezone: "Africa/Addis_Ababa";
  businessDate: string;
  users: number;
  clients: number;
  ordersToday: number;
  assetsUnderAdministration: number;
  features: Record<FeatureKey, boolean>;
  controls: {
    makerChecker: boolean;
    approvalThreshold: number;
    clientDailyLimit: number;
    brokerageFeePct: number;
    minimumFee: number;
    settlementCycle: "T+1" | "T+2" | "T+3";
    allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">;
    requireTermsAcceptance: boolean;
    discrepancyWindowDays: number;
    kycReviewMonths: number;
  };
  legalDocument: {
    id?: string;
    title: string;
    version: string;
    language: string;
    summary: string;
    content: string;
    status: "draft" | "published";
    effectiveAt: string;
    requiresReacceptance: boolean;
  };
  feeSchedule: {
    id?: string;
    name: string;
    version: string;
    status: "draft" | "published";
    effectiveFrom: string;
    rules: AdminFeeRule[];
  };
};

const defaultLegalDocument = (tradingName: string) => ({
  title: `${tradingName} Brokerage Account Terms`,
  version: "1.0",
  language: "en",
  summary: "Account operation, order handling, fees, confirmations, settlement, client responsibilities, and closure terms.",
  content: "These demo brokerage terms explain how the account is opened and operated, how orders are accepted and reviewed, how fees are disclosed, how confirmations and discrepancies are handled, and how an account may be restricted or closed. Replace this text with counsel-approved tenant terms before production.",
  status: "published" as const,
  effectiveAt: "2026-07-14",
  requiresReacceptance: true,
});

const defaultFeeSchedule = (brokeragePct: number, minimumFee: number) => ({
  name: "Standard ESX fee schedule",
  version: "1.0",
  status: "published" as const,
  effectiveFrom: "2026-07-14",
  rules: (["equity", "bond"] as const).map((assetClass) => ({
    assetClass,
    marketSegment: "main",
    brokeragePct,
    regulatorPct: 0,
    exchangePct: 0,
    csdPct: 0,
    minimumFee,
    maximumFee: null,
  })),
});

export type AdminInstrument = {
  id: string;
  symbol: string;
  name: string;
  assetClass: "Equity" | "Government bond";
  status: "Tradable" | "Halted";
  lotSize: number;
  tickSize: number;
  settlementCycle: "T+2";
  enabledTenantIds: string[];
};

export type AdminUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "Broker admin" | "Trader" | "Compliance" | "Settlement" | "Read only";
  status: "Active" | "Invited" | "Suspended";
  mfa: boolean;
  lastActive: string;
};

export type TenantIntegration = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: "Connected" | "Sandbox" | "Not connected";
  mode: "Live" | "Sandbox" | "Manual";
};

export type AdminAuditEvent = { id: string; tenantId: string; time: string; actor: string; action: string; detail: string };

export const initialTenants: TenantConfig[] = [
  {
    id: "brk_abyssinia",
    name: "Abyssinia Securities S.C.",
    tradingName: "Abyssinia Securities",
    initials: "AS",
    licenseNumber: "ESCA-BR-004",
    status: "active",
    plan: "Enterprise",
    domain: "invest.abyssinia.et",
    supportEmail: "support@abyssinia.example",
    primaryColor: "#0C8189",
    welcomeMessage: "Access Ethiopian shares and government bonds through one simple platform.",
    baseCurrency: "ETB",
    timezone: "Africa/Addis_Ababa",
    businessDate: "2026-07-14",
    users: 14,
    clients: 428,
    ordersToday: 84,
    assetsUnderAdministration: 184_500_000,
    features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true },
    controls: { makerChecker: true, approvalThreshold: 250_000, clientDailyLimit: 2_500_000, brokerageFeePct: .5, minimumFee: 25, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit", "Stop-loss"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    legalDocument: defaultLegalDocument("Abyssinia Securities"),
    feeSchedule: defaultFeeSchedule(.5, 25),
  },
  {
    id: "brk_blue_nile",
    name: "Blue Nile Capital PLC",
    tradingName: "Blue Nile Capital",
    initials: "BN",
    licenseNumber: "ESCA-BR-011",
    status: "pilot",
    plan: "Growth",
    domain: "invest.bluenile.example",
    supportEmail: "care@bluenile.example",
    primaryColor: "#2277C8",
    welcomeMessage: "A simpler way to own ESX companies and government bonds.",
    baseCurrency: "ETB",
    timezone: "Africa/Addis_Ababa",
    businessDate: "2026-07-14",
    users: 7,
    clients: 112,
    ordersToday: 21,
    assetsUnderAdministration: 46_800_000,
    features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: false, institutionalAccounts: true, manualTradeCapture: true },
    controls: { makerChecker: true, approvalThreshold: 100_000, clientDailyLimit: 750_000, brokerageFeePct: .65, minimumFee: 30, settlementCycle: "T+2", allowedOrderTypes: ["Market", "Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    legalDocument: defaultLegalDocument("Blue Nile Capital"),
    feeSchedule: defaultFeeSchedule(.65, 30),
  },
  {
    id: "brk_sheba",
    name: "Sheba Investment Services S.C.",
    tradingName: "Sheba Invest",
    initials: "SI",
    licenseNumber: "PILOT-023",
    status: "suspended",
    plan: "Pilot",
    domain: "sheba.frankbroker.demo",
    supportEmail: "operations@sheba.example",
    primaryColor: "#0E9F5B",
    welcomeMessage: "Start small, understand every step, and build from there.",
    baseCurrency: "ETB",
    timezone: "Africa/Addis_Ababa",
    businessDate: "2026-07-14",
    users: 4,
    clients: 37,
    ordersToday: 0,
    assetsUnderAdministration: 8_250_000,
    features: { investorPortal: false, selfDirected: true, bonds: false, recurringInvestments: false, institutionalAccounts: false, manualTradeCapture: true },
    controls: { makerChecker: true, approvalThreshold: 50_000, clientDailyLimit: 250_000, brokerageFeePct: .75, minimumFee: 35, settlementCycle: "T+2", allowedOrderTypes: ["Limit"], requireTermsAcceptance: true, discrepancyWindowDays: 10, kycReviewMonths: 12 },
    legalDocument: defaultLegalDocument("Sheba Invest"),
    feeSchedule: defaultFeeSchedule(.75, 35),
  },
];

export const initialAdminInstruments: AdminInstrument[] = [
  { id: "ins_tele", symbol: "TELE", name: "Ethio Telecom", assetClass: "Equity", status: "Tradable", lotSize: 10, tickSize: .5, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia", "brk_blue_nile", "brk_sheba"] },
  { id: "ins_awab", symbol: "AWAB", name: "Awash Bank", assetClass: "Equity", status: "Tradable", lotSize: 10, tickSize: .5, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia", "brk_blue_nile"] },
  { id: "ins_wgbx", symbol: "WGBX", name: "Wegagen Bank", assetClass: "Equity", status: "Tradable", lotSize: 10, tickSize: .5, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia", "brk_blue_nile", "brk_sheba"] },
  { id: "ins_gdab", symbol: "GDAB", name: "Gadaa Bank", assetClass: "Equity", status: "Tradable", lotSize: 10, tickSize: .5, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia", "brk_blue_nile"] },
  { id: "ins_abayb", symbol: "ABAYB", name: "Abay Bank", assetClass: "Equity", status: "Tradable", lotSize: 10, tickSize: .5, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia"] },
  { id: "ins_gb2029", symbol: "GB2029", name: "GoE Treasury Bond 2029", assetClass: "Government bond", status: "Tradable", lotSize: 1, tickSize: .01, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia", "brk_blue_nile"] },
  { id: "ins_gb2031", symbol: "GB2031", name: "GoE Treasury Bond 2031", assetClass: "Government bond", status: "Tradable", lotSize: 1, tickSize: .01, settlementCycle: "T+2", enabledTenantIds: ["brk_abyssinia"] },
  { id: "ins_gb2036", symbol: "GB2036", name: "GoE Treasury Bond 2036", assetClass: "Government bond", status: "Halted", lotSize: 1, tickSize: .01, settlementCycle: "T+2", enabledTenantIds: [] },
];

export const initialAdminUsers: AdminUser[] = [
  { id: "usr_demo_admin", tenantId: "brk_abyssinia", name: "Mekdes Tadesse", email: "demo.admin@frankbroker.et", role: "Broker admin", status: "Active", mfa: true, lastActive: "2 min ago" },
  { id: "usr_trader", tenantId: "brk_abyssinia", name: "Dawit Alemu", email: "dawit@frankbroker.et", role: "Trader", status: "Active", mfa: true, lastActive: "14 min ago" },
  { id: "usr_compliance", tenantId: "brk_abyssinia", name: "Liya Girma", email: "liya@frankbroker.et", role: "Compliance", status: "Active", mfa: true, lastActive: "1 hr ago" },
  { id: "usr_settlement", tenantId: "brk_abyssinia", name: "Rahel Getachew", email: "rahel@frankbroker.et", role: "Settlement", status: "Active", mfa: false, lastActive: "Yesterday" },
  { id: "usr_blue_admin", tenantId: "brk_blue_nile", name: "Samuel Kebede", email: "samuel@bluenile.example", role: "Broker admin", status: "Active", mfa: true, lastActive: "18 min ago" },
  { id: "usr_sheba_admin", tenantId: "brk_sheba", name: "Abel Yohannes", email: "abel@sheba.example", role: "Broker admin", status: "Suspended", mfa: true, lastActive: "9 days ago" },
];

export const initialIntegrations: TenantIntegration[] = initialTenants.flatMap((tenant) => [
  { id: `${tenant.id}-fayda`, tenantId: tenant.id, name: "Fayda eKYC", description: "Identity and consent verification", status: tenant.id === "brk_abyssinia" ? "Sandbox" : "Not connected", mode: tenant.id === "brk_abyssinia" ? "Sandbox" : "Manual" },
  { id: `${tenant.id}-esx`, tenantId: tenant.id, name: "ESX order gateway", description: "Order routing and execution reports", status: "Not connected", mode: "Manual" },
  { id: `${tenant.id}-csd`, tenantId: tenant.id, name: "CSD settlement", description: "Holdings and settlement instructions", status: "Not connected", mode: "Manual" },
  { id: `${tenant.id}-bank`, tenantId: tenant.id, name: "Cash settlement bank", description: "Funding and cash confirmations", status: tenant.id === "brk_abyssinia" ? "Sandbox" : "Not connected", mode: tenant.id === "brk_abyssinia" ? "Sandbox" : "Manual" },
  { id: `${tenant.id}-notify`, tenantId: tenant.id, name: "SMS and email", description: "Investor alerts and confirmations", status: tenant.id === "brk_sheba" ? "Not connected" : "Connected", mode: tenant.id === "brk_sheba" ? "Manual" : "Live" },
]);

export const adminAudit: AdminAuditEvent[] = [
  { id: "evt_1", tenantId: "brk_abyssinia", time: "12:42", actor: "Platform admin", action: "Feature enabled", detail: "Recurring investments enabled for Abyssinia Securities" },
  { id: "evt_2", tenantId: "brk_blue_nile", time: "11:18", actor: "Liya Girma", action: "Fee schedule changed", detail: "Brokerage fee changed from 0.70% to 0.65%" },
  { id: "evt_3", tenantId: "brk_abyssinia", time: "10:51", actor: "Platform admin", action: "Instrument added", detail: "ABAYB enabled for investor and broker portals" },
  { id: "evt_4", tenantId: "brk_sheba", time: "09:32", actor: "Risk operations", action: "Tenant suspended", detail: "Trading access paused pending license review" },
  { id: "evt_5", tenantId: "brk_abyssinia", time: "Yesterday", actor: "Mekdes Tadesse", action: "User invited", detail: "Settlement role invitation sent to a new user" },
];

export const formatAdminEtb = (value: number) => `ETB ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
