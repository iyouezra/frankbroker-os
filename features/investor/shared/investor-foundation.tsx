"use client";

import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import {
  formatEtb,
  getInvestorHistory,
  getInvestorSession,
  type InvestorBond,
  type InvestorStock,
  type MarketRange,
} from "../../../lib/investor-data";
import type { InvestorActivity } from "../../../lib/investor-activity";
import styles from "../../../app/investor/investor.module.css";

export type Tab = "home" | "markets" | "portfolio" | "learn" | "profile";
export type IconName = "home" | "markets" | "portfolio" | "plan" | "profile" | "search" | "back" | "bell" | "plus" | "shield" | "bulb" | "chevron" | "check" | "order" | "money";
export type InvestorKyc = {
  accountType: "retail" | "institution";
  fullName: string;
  phone: string;
  email: string;
  faydaId: string;
  tin: string;
  address: string;
  proofOfAddressType: string;
  proofOfAddressReference: string;
  registrationNumber: string;
  representativeName: string;
  beneficialOwnerName: string;
  signatoryAuthorityConfirmed: boolean;
  termsAccepted: boolean;
  electronicDeliveryConsent: boolean;
  nationality: string;
  countryOfResidence: string;
  occupation: string;
  sourceOfFunds: string;
  investmentObjective: string;
  taxResidency: string;
  pepStatus: "not_pep" | "pep" | "related_to_pep";
  verificationId?: string;
};
export type InvestorOrderInput = { symbol: string; side: "buy" | "sell"; quantity: number; price: number; triggerPrice?: number; orderType: string; disclosureAccepted: boolean; disclosureVersion: "order-v1" };
export type OrderCheck = { code: string; passed: boolean; message: string };
export type PlaceResult = { status?: string; checks?: OrderCheck[] };
export type CashPool = { id: string; bankName: string; accountName: string; accountNumberMasked: string; currency: string; purpose: string; beneficialBalance: number };
export type CashMovementView = { id: string; type: "deposit" | "withdrawal"; amount: number; currency: string; status: string; bankReference?: string | null; destinationBankName?: string | null; destinationAccountMasked?: string | null; submittedAt: string; pool?: CashPool };
export type CashMovementInput = { movementType: "deposit" | "withdrawal"; pooledBankAccountId: string; amount: number; bankReference?: string; proofReference?: string; linkedBankAccountId?: string };
export type LinkedBankAccount = { id: string; bankName: string; accountNumber: string; accountNumberMasked?: string; accountHolderName: string; status: string };
export type OnboardingSubmission = {
  profile: InvestorKyc;
  linkedBanks: LinkedBankAccount[];
  documents: Partial<Record<"proof_of_address" | "business_license" | "tin_certificate" | "certificate_of_incorporation" | "article_of_association", File>>;
};
export type InvestorFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
export type InvestorInstrument = {
  ticker: string;
  name: string;
  assetClass: string;
  issuer?: string | null;
  price: number;
  status: string;
  lotSize: number;
  tickSize?: number;
  settlementCycle?: string;
  faceValue?: number | null;
  maturityDate?: string | null;
  couponRate?: number | null;
  couponFrequency?: string | null;
};
export type InvestorBootstrap = {
  tenant: { name: string; primaryColor: string; welcomeMessage?: string; brokerageFeePct: number; minimumFee: number; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; features: Record<string, boolean>; requireTermsAcceptance: boolean; discrepancyWindowDays: number; legalDocument: { id: string; title: string; version: string; summary: string; content: string; effectiveAt: string } | null; feeSchedule: { id: string; version: string; effectiveFrom: string; rules: InvestorFeeRule[] } | null };
  profile: { fullName: string; kycStatus: string; proofOfAddressStatus?: string; termsAcceptedVersion?: string | null; kycReviewDueAt?: string | null } | null;
  account: { id: string; totalCash: number; availableCash: number; blockedCash: number; holdings: Array<{ ticker: string; quantity: number; averageCost: number; price: number }>; orders: Array<{ id: string }> } | null;
  instruments: InvestorInstrument[];
  serviceRequests: Array<{ id: string; requestType: string; status: string; subject: string; description: string; orderId?: string | null; submittedAt: string; resolutionNotes?: string | null }>;
  cashPools: CashPool[];
  cashMovements: CashMovementView[];
  activity: InvestorActivity[];
  linkedBanks: LinkedBankAccount[];
  documents: Array<{ id: string; type: string; name: string; status: string; hasFile: boolean }>;
};

export function calculateInvestorFees(gross: number, rule: InvestorFeeRule) {
  const brokerage = gross > 0 ? Math.min(rule.maximumFee ?? Number.POSITIVE_INFINITY, Math.max(rule.minimumFee, gross * rule.brokeragePct / 100)) : 0;
  const regulator = gross * rule.regulatorPct / 100;
  const exchange = gross * rule.exchangePct / 100;
  const csd = gross * rule.csdPct / 100;
  return { brokerage, regulator, exchange, csd, total: brokerage + regulator + exchange + csd };
}

export function mergeBondInstrument(bond: InvestorBond, instrument?: InvestorInstrument): InvestorBond {
  if (!instrument) return bond;
  const maturityDate = instrument.maturityDate ?? bond.maturityDate;
  return {
    ...bond,
    name: instrument.name || bond.name,
    issuer: instrument.issuer || bond.issuer,
    quotedPricePct: instrument.price || bond.quotedPricePct,
    faceValue: instrument.faceValue || bond.faceValue,
    couponRate: instrument.couponRate || bond.couponRate,
    maturityDate,
    maturityLabel: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${maturityDate}T12:00:00Z`)),
    couponFrequency: instrument.couponFrequency === "semi_annual" ? "Semiannual" : bond.couponFrequency,
    settlementCycle: instrument.settlementCycle || bond.settlementCycle,
    status: instrument.status === "halted" ? "halted" : "tradable",
    liquidity: instrument.status === "halted" ? "Trading paused" : bond.liquidity,
  };
}

export const INVESTOR_TENANT_ID = "brk_abyssinia";
export const INVESTOR_CLIENT_ID = "cli_investor_demo";
export const investorHeaders = { "x-frank-tenant-id": INVESTOR_TENANT_ID, "x-frank-client-id": INVESTOR_CLIENT_ID };
export const fallbackLinkedBanks: LinkedBankAccount[] = [
  { id: "bank_cbe_fallback", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057894108", accountHolderName: "Selam Mekonnen", status: "approved" },
  { id: "bank_awash_fallback", bankName: "Awash Bank", accountNumber: "0132098765432", accountHolderName: "Selam Mekonnen", status: "approved" },
];
export const bankOptions = ["Commercial Bank of Ethiopia", "Awash Bank", "Bank of Abyssinia", "Dashen Bank", "Cooperative Bank of Oromia", "Wegagen Bank"];

export function maskLinkedAccount(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return digits.length <= 6 ? digits : `${"•".repeat(Math.min(6, digits.length - 6))} ${digits.slice(-6)}`;
}

export function linkedBankNumber(account: LinkedBankAccount) {
  return account.accountNumberMasked ?? maskLinkedAccount(account.accountNumber ?? "");
}

export function linkedBankStatus(status: string) {
  if (status === "pending_review") return "Waiting for review";
  if (status === "rejected") return "Not approved";
  if (status === "approved") return "Approved";
  return status.replaceAll("_", " ");
}

const iconPaths: Record<IconName, string> = {
  home: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  markets: "M16 7h6v6 M22 7l-8.5 8.5-5-5L2 17",
  portfolio: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  plan: "M21 12c.55 0 1-.45.95-1A10 10 0 0 0 13 2.05c-.55-.05-1 .4-1 .95v8a1 1 0 0 0 1 1z M21.2 15.9A10 10 0 1 1 8 2.83",
  profile: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M21 21l-4.3-4.3",
  back: "M12 19l-7-7 7-7 M19 12H5",
  bell: "M10.27 21a2 2 0 0 0 3.46 0 M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33",
  plus: "M5 12h14 M12 5v14",
  shield: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  bulb: "M15 14c.2-1 .7-1.7 1.5-2.5A7 7 0 1 0 5 9c0 1 .5 2.5 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4",
  chevron: "M9 18l6-6-6-6",
  check: "M20 6 9 17l-5-5",
  order: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  money: "M3 6h18v12H3z M16 12h.01 M3 9h18",
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

export function AppLogo() {
  return <div className={styles.appLogo}><Image src="/frankscore-icon.png" alt="" width={29} height={41} /><b>Frank</b></div>;
}

export function AllocationBar({ bonds, stocks, light = false }: { bonds: number; stocks: number; light?: boolean }) {
  return <div className={`${styles.allocationBar} ${light ? styles.allocationLight : ""}`}><i style={{ width: `${bonds}%` }} /><i style={{ width: `${stocks}%` }} /></div>;
}

export function Button({ children, variant = "primary", className = "", disabled = false, onClick, type = "button" }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function Delta({ value, pill = false }: { value: number; pill?: boolean }) {
  return <span className={`${styles.delta} ${value >= 0 ? styles.gain : styles.loss} ${pill ? styles.deltaPill : ""}`}>{value >= 0 ? "+" : "−"}{Math.abs(value).toFixed(1)}%</span>;
}

export function MarketSparkline({ stock }: { stock: InvestorStock }) {
  const session = getInvestorSession(stock);
  const width = 72;
  const height = 28;
  const positive = stock.delta >= 0;
  const shapes: Record<InvestorStock["ticker"], number[]> = {
    TELE: [0, .12, -.1, .16, -.08, .14, -.05, .1, 0],
    AWAB: [0, -.08, .13, -.04, .12, -.1, .08, -.04, 0],
    WGBX: [0, .1, -.14, .12, -.08, .1, -.12, .07, 0],
    GDAB: [0, -.07, .1, -.1, .13, -.06, .09, -.08, 0],
    ABAYB: [0, .08, -.1, .12, -.13, .07, -.09, .05, 0],
  };
  const amplitude = (session.high - session.low) * .28;
  const values = shapes[stock.ticker].map((shape, index, series) => {
    const progress = index / (series.length - 1);
    const price = session.open + (stock.price - session.open) * progress + shape * amplitude;
    return Math.max(session.low, Math.min(session.high, price));
  });
  const domain = Math.max(session.open * .0125, Math.abs(stock.price - session.open) * 1.15);
  const min = session.open - domain;
  const max = session.open + domain;
  const baseline = height - ((session.open - min) / (max - min)) * height;
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / (max - min)) * height;
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${baseline} L0,${baseline} Z`;
  return <span className={`${styles.marketSparkline} ${positive ? styles.microGain : styles.microLoss}`}>
    <small>1D</small>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${stock.name} one day trend`}>
      <line x1="0" y1={baseline} x2={width} y2={baseline} className={styles.microBaseline} />
      <path d={area} className={styles.microArea} />
      <path d={line} className={styles.microLine} />
      <circle cx={width} cy={y(values.at(-1)!)} r="2.4" className={styles.microPulse} />
      <circle cx={width} cy={y(values.at(-1)!)} r="2.4" className={styles.microEndpoint} />
    </svg>
  </span>;
}

const compactDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const chartDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PriceChart({ stock, range }: { stock: InvestorStock; range: MarketRange }) {
  const points = getInvestorHistory(stock)[range];
  const [activeIndex, setActiveIndex] = useState(points.length - 1);
  const gradientId = useId().replaceAll(":", "");

  const width = 340;
  const plotLeft = 4;
  const plotRight = 292;
  const priceTop = 14;
  const priceBottom = 112;
  const volumeTop = 130;
  const volumeBottom = 157;
  const closes = points.map((point) => point.close);
  const rawMin = Math.min(...closes);
  const rawMax = Math.max(...closes);
  const padding = Math.max((rawMax - rawMin) * 0.12, stock.price * 0.0025);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const x = (index: number) => plotLeft + (index / Math.max(points.length - 1, 1)) * (plotRight - plotLeft);
  const y = (value: number) => priceBottom - ((value - min) / Math.max(max - min, 1)) * (priceBottom - priceTop);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.close).toFixed(2)}`).join(" ");
  const area = `${line} L${plotRight},${priceBottom} L${plotLeft},${priceBottom} Z`;
  const maxVolume = Math.max(...points.map((point) => point.volume));
  const barWidth = Math.max(1, ((plotRight - plotLeft) / points.length) * 0.55);
  const active = points[Math.min(activeIndex, points.length - 1)];
  const periodChange = ((points.at(-1)!.close / points[0].close) - 1) * 100;
  const positive = periodChange >= 0;
  const stroke = positive ? "var(--investor-accent)" : "var(--investor-loss)";
  const gridValues = [max, (max + min) / 2, min];
  const updateActive = (clientX: number, target: SVGSVGElement) => {
    const bounds = target.getBoundingClientRect();
    const viewX = ((clientX - bounds.left) / bounds.width) * width;
    const next = Math.round(((viewX - plotLeft) / (plotRight - plotLeft)) * (points.length - 1));
    setActiveIndex(Math.max(0, Math.min(points.length - 1, next)));
  };

  return <div className={styles.priceChart}>
    <div className={styles.chartReadout}><span><b>{formatEtb(active.close)}</b><small>{chartDate.format(new Date(`${active.date}T12:00:00Z`))}</small></span><span><b className={positive ? styles.gain : styles.loss}>{positive ? "+" : "−"}{Math.abs(periodChange).toFixed(1)}%</b><small>{range} return</small></span></div>
    <svg viewBox={`0 0 ${width} 170`} role="img" aria-label={`${stock.name} ${range} price and volume chart`} onPointerMove={(event) => updateActive(event.clientX, event.currentTarget)} onPointerDown={(event) => updateActive(event.clientX, event.currentTarget)} onPointerLeave={() => setActiveIndex(points.length - 1)}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={stroke} stopOpacity=".2" /><stop offset="1" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
      {gridValues.map((value) => <g key={value}><line x1={plotLeft} y1={y(value)} x2={plotRight} y2={y(value)} className={styles.chartGrid} /><text x="334" y={y(value) + 3} textAnchor="end" className={styles.chartAxis}>{value.toLocaleString("en-US", { maximumFractionDigits: stock.price >= 1_000 ? 0 : 2 })}</text></g>)}
      <line x1={plotLeft} y1={y(points[0].close)} x2={plotRight} y2={y(points[0].close)} className={styles.chartBaseline} />
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => <rect key={point.date} x={x(index) - barWidth / 2} y={volumeBottom - (point.volume / maxVolume) * (volumeBottom - volumeTop)} width={barWidth} height={(point.volume / maxVolume) * (volumeBottom - volumeTop)} rx=".6" className={styles.volumeBar} />)}
      <line x1={x(activeIndex)} y1={priceTop} x2={x(activeIndex)} y2={volumeBottom} className={styles.chartCursor} />
      <circle cx={x(activeIndex)} cy={y(active.close)} r="4" fill="white" stroke={stroke} strokeWidth="2.2" />
    </svg>
    <div className={styles.chartDates}><span>{compactDate.format(new Date(`${points[0].date}T12:00:00Z`))}</span><span>Volume</span><span>{compactDate.format(new Date(`${points.at(-1)!.date}T12:00:00Z`))}</span></div>
  </div>;
}

export function PortfolioChart({ total }: { total: number }) {
  const investedEnd = total / 1.185;
  const invested = [0.76, 0.78, 0.79, 0.82, 0.84, 0.85, 0.88, 0.9, 0.92, 0.95, 0.97, 1].map((value) => value * investedEnd);
  const value = [0.76, 0.775, 0.768, 0.815, 0.834, 0.87, 0.862, 0.925, 0.948, 1.03, 1.105, 1.185].map((ratio) => ratio * investedEnd);
  const width = 340;
  const height = 106;
  const min = Math.min(...invested, ...value) * 0.97;
  const max = Math.max(...value) * 1.02;
  const x = (index: number) => (index / (value.length - 1)) * width;
  const y = (amount: number) => height - ((amount - min) / (max - min)) * (height - 8) - 4;
  const path = (series: number[]) => series.map((amount, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(amount).toFixed(2)}`).join(" ");
  return <div className={styles.portfolioChart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio value compared with net invested"><line x1="0" y1={height / 2} x2={width} y2={height / 2} className={styles.chartGrid} /><path d={path(invested)} className={styles.investedLine} /><path d={path(value)} className={styles.valueLine} /></svg>
    <div className={styles.performanceLegend}><span><i />Portfolio value</span><span><i />Net invested</span></div>
    <div className={styles.chartDates}><span>Aug 2025</span><span>Today</span></div>
  </div>;
}

export function StockRow({ stock, onClick, holdingValue }: { stock: InvestorStock; onClick: () => void; holdingValue?: number }) {
  const isHolding = holdingValue !== undefined;
  return <button className={`${styles.stockRow} ${isHolding ? styles.homeStockRow : ""}`} onClick={onClick}><span className={styles.tickerTile}>{stock.ticker.slice(0, 4)}</span><span className={styles.stockIdentity}><b>{stock.name}</b><small>{stock.ticker} · {stock.sector}</small></span>{!isHolding && <MarketSparkline stock={stock} />}<span className={styles.stockPrice}><b>{formatEtb(holdingValue ?? stock.price)}</b><Delta value={stock.delta} /></span></button>;
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className={styles.screenHeader}>{onBack && <button className={styles.iconButton} onClick={onBack} aria-label="Go back"><Icon name="back" size={20} /></button>}<h1>{title}</h1>{right}</header>;
}

export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items = [
    { id: "home", label: "Home", icon: "home" },
    { id: "markets", label: "Markets", icon: "markets" },
    { id: "portfolio", label: "Portfolio", icon: "portfolio" },
    { id: "learn", label: "Learn", icon: "bulb" },
    { id: "profile", label: "You", icon: "profile" },
  ] satisfies Array<{ id: Tab; label: string; icon: IconName }>;
  return <nav className={styles.bottomNav} aria-label="Investor navigation">{items.map((item) => <button key={item.id} className={active === item.id ? styles.navActive : ""} onClick={() => onChange(item.id)}><Icon name={item.icon} size={22} /><span>{item.label}</span></button>)}</nav>;
}

export function ProgressDots({ step }: { step: number }) {
  return <div className={styles.progressDots} aria-label={`Onboarding step ${Math.min(step, 3) + 1} of 4`}>{[0, 1, 2, 3].map((dot) => <i key={dot} className={dot === Math.min(step, 3) ? styles.currentDot : ""} />)}</div>;
}

export const retailDemo: InvestorKyc = { accountType: "retail", fullName: "Selam Mekonnen", phone: "0911000041", email: "selam.mekonnen@example.et", faydaId: "123456789012", tin: "0012814908", address: "", proofOfAddressType: "Drivers License", proofOfAddressReference: "", registrationNumber: "", representativeName: "", beneficialOwnerName: "", signatoryAuthorityConfirmed: true, termsAccepted: false, electronicDeliveryConsent: false, nationality: "Ethiopian", countryOfResidence: "Ethiopia", occupation: "Private employee", sourceOfFunds: "Employment income", investmentObjective: "Long-term growth", taxResidency: "Ethiopia", pepStatus: "not_pep" };
export const institutionDemo: InvestorKyc = { accountType: "institution", fullName: "Blue Nile Trading PLC", phone: "0115500017", email: "finance@bluenile.example", faydaId: "234567890123", tin: "0067047925", address: "Kirkos, Addis Ababa", proofOfAddressType: "", proofOfAddressReference: "", registrationNumber: "AA/2/12345/2018", representativeName: "Meron Bekele", beneficialOwnerName: "Selamawit Bekele", signatoryAuthorityConfirmed: false, termsAccepted: false, electronicDeliveryConsent: false, nationality: "Ethiopian", countryOfResidence: "Ethiopia", occupation: "Authorized representative", sourceOfFunds: "Operating income", investmentObjective: "Capital preservation and growth", taxResidency: "Ethiopia", pepStatus: "not_pep" };

export function KycProgress({ step }: { step: number }) {
  return <div className={styles.kycProgress}><span><b>ACCOUNT SETUP</b><small>{step + 1} of 5</small></span><i><em style={{ width: `${((step + 1) / 5) * 100}%` }} /></i></div>;
}

export function KycField({ label, value, onChange, hint, placeholder, inputMode = "text", maxLength, type = "text", autoComplete = "off" }: { label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string; inputMode?: "text" | "numeric" | "tel" | "email"; maxLength?: number; type?: "text" | "email"; autoComplete?: string }) {
  return <label className={styles.kycField}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} autoComplete={autoComplete} />{hint && <small>{hint}</small>}</label>;
}
