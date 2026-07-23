"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  coachTips,
  formatEtb,
  getInvestorHistory,
  getInvestorSession,
  investorBonds,
  investorHoldings,
  investorStocks,
  type InvestorStock,
  type MarketRange,
} from "../../lib/investor-data";
import styles from "./investor.module.css";
import { demoInvestorNotifications, timeAgo, type NotificationItem } from "../../lib/notifications-demo";

type Tab = "home" | "markets" | "portfolio" | "learn" | "profile";
type IconName = "home" | "markets" | "portfolio" | "plan" | "profile" | "search" | "back" | "bell" | "plus" | "shield" | "bulb" | "chevron" | "check";
type InvestorKyc = {
  accountType: "retail" | "institution";
  fullName: string;
  phone: string;
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
type InvestorOrderInput = { symbol: string; side: "buy" | "sell"; quantity: number; price: number; orderType: string; disclosureAccepted: boolean; disclosureVersion: "order-v1" };
type OrderCheck = { code: string; passed: boolean; message: string };
type PlaceResult = { status?: string; checks?: OrderCheck[] };
type CashPool = { id: string; bankName: string; accountName: string; accountNumberMasked: string; currency: string; purpose: string; beneficialBalance: number };
type CashMovementView = { id: string; type: "deposit" | "withdrawal"; amount: number; currency: string; status: string; bankReference?: string | null; destinationBankName?: string | null; destinationAccountMasked?: string | null; submittedAt: string; pool?: CashPool };
type CashMovementInput = { movementType: "deposit" | "withdrawal"; pooledBankAccountId: string; amount: number; bankReference?: string; proofReference?: string; destinationBankName?: string; destinationAccountName?: string; destinationAccountMasked?: string };
type LinkedBankAccount = { id: string; bankName: string; accountNumber: string; accountHolderName: string; status: "approved" | "pending" };
type InvestorFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
type InvestorBootstrap = {
  tenant: { name: string; primaryColor: string; welcomeMessage?: string; brokerageFeePct: number; minimumFee: number; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; features: Record<string, boolean>; requireTermsAcceptance: boolean; discrepancyWindowDays: number; legalDocument: { id: string; title: string; version: string; summary: string; content: string; effectiveAt: string } | null; feeSchedule: { id: string; version: string; effectiveFrom: string; rules: InvestorFeeRule[] } | null };
  profile: { fullName: string; kycStatus: string; proofOfAddressStatus?: string; termsAcceptedVersion?: string | null; kycReviewDueAt?: string | null } | null;
  account: { id: string; totalCash: number; availableCash: number; blockedCash: number; holdings: Array<{ ticker: string; quantity: number; averageCost: number; price: number }>; orders: Array<{ id: string }> } | null;
  instruments: Array<{ ticker: string; assetClass: string; status: string }>;
  serviceRequests: Array<{ id: string; requestType: string; status: string; subject: string; description: string; orderId?: string | null; submittedAt: string; resolutionNotes?: string | null }>;
  cashPools: CashPool[];
  cashMovements: CashMovementView[];
};

const INVESTOR_TENANT_ID = "brk_abyssinia";
const INVESTOR_CLIENT_ID = "cli_investor_demo";
const investorHeaders = { "x-frank-tenant-id": INVESTOR_TENANT_ID, "x-frank-client-id": INVESTOR_CLIENT_ID };
const demoLinkedBanks: LinkedBankAccount[] = [
  { id: "bank_cbe_demo", bankName: "Commercial Bank of Ethiopia", accountNumber: "100057894108", accountHolderName: "Selam Mekonnen", status: "approved" },
  { id: "bank_awash_demo", bankName: "Awash Bank", accountNumber: "0132098765432", accountHolderName: "Selam Mekonnen", status: "approved" },
];
const bankOptions = ["Commercial Bank of Ethiopia", "Awash Bank", "Bank of Abyssinia", "Dashen Bank", "Cooperative Bank of Oromia", "Wegagen Bank"];
let currentLinkedBanks = demoLinkedBanks;

function readLinkedBanks() {
  return currentLinkedBanks;
}

function saveLinkedBanks(accounts: LinkedBankAccount[]) {
  currentLinkedBanks = accounts;
}

function maskLinkedAccount(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return digits.length <= 6 ? digits : `${"•".repeat(Math.min(6, digits.length - 6))} ${digits.slice(-6)}`;
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
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

function Button({ children, variant = "primary", className = "", disabled = false, onClick, type = "button" }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Delta({ value, pill = false }: { value: number; pill?: boolean }) {
  return <span className={`${styles.delta} ${value >= 0 ? styles.gain : styles.loss} ${pill ? styles.deltaPill : ""}`}>{value >= 0 ? "+" : "−"}{Math.abs(value).toFixed(1)}%</span>;
}

function Sparkline({ values, large = false }: { values: number[]; large?: boolean }) {
  const width = large ? 340 : 76;
  const height = large ? 92 : 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 4 - ((value - min) / range) * (height - 8)}`).join(" ");
  const rising = values.at(-1)! >= values[0];
  return <svg className={styles.sparkline} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={rising ? "Rising price trend" : "Falling price trend"}><polyline points={points} fill="none" stroke={rising ? "var(--investor-accent)" : "var(--investor-loss)"} strokeWidth={large ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MarketSparkline({ stock }: { stock: InvestorStock }) {
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

function PriceChart({ stock, range }: { stock: InvestorStock; range: MarketRange }) {
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

function PortfolioChart({ total }: { total: number }) {
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

function ScoreRing({ score = 78 }: { score?: number }) {
  const circumference = 2 * Math.PI * 37;
  return <div className={styles.scoreRing} aria-label={`FrankScore ${score}`}><svg viewBox="0 0 86 86"><circle cx="43" cy="43" r="37" className={styles.scoreTrack} /><circle cx="43" cy="43" r="37" className={styles.scoreValue} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} /></svg><strong>{score}</strong></div>;
}

function StockRow({ stock, onClick, holdingValue }: { stock: InvestorStock; onClick: () => void; holdingValue?: number }) {
  const isHolding = holdingValue !== undefined;
  return <button className={`${styles.stockRow} ${isHolding ? styles.homeStockRow : ""}`} onClick={onClick}><span className={styles.tickerTile}>{stock.ticker.slice(0, 4)}</span><span className={styles.stockIdentity}><b>{stock.name}</b><small>{stock.ticker} · {stock.sector}</small></span>{!isHolding && <MarketSparkline stock={stock} />}<span className={styles.stockPrice}><b>{formatEtb(holdingValue ?? stock.price)}</b><Delta value={stock.delta} /></span></button>;
}

function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className={styles.screenHeader}>{onBack && <button className={styles.iconButton} onClick={onBack} aria-label="Go back"><Icon name="back" size={20} /></button>}<h1>{title}</h1>{right}</header>;
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items = [
    { id: "home", label: "Home", icon: "home" },
    { id: "markets", label: "Markets", icon: "markets" },
    { id: "portfolio", label: "Portfolio", icon: "portfolio" },
    { id: "learn", label: "Learn", icon: "bulb" },
    { id: "profile", label: "You", icon: "profile" },
  ] satisfies Array<{ id: Tab; label: string; icon: IconName }>;
  return <nav className={styles.bottomNav} aria-label="Investor navigation">{items.map((item) => <button key={item.id} className={active === item.id ? styles.navActive : ""} onClick={() => onChange(item.id)}><Icon name={item.icon} size={22} /><span>{item.label}</span></button>)}</nav>;
}

function ProgressDots({ step }: { step: number }) {
  return <div className={styles.progressDots} aria-label={`Onboarding step ${Math.min(step, 3) + 1} of 4`}>{[0, 1, 2, 3].map((dot) => <i key={dot} className={dot === Math.min(step, 3) ? styles.currentDot : ""} />)}</div>;
}

const retailDemo: InvestorKyc = { accountType: "retail", fullName: "Selam Mekonnen", phone: "0911000041", faydaId: "123456789012", tin: "0012814908", address: "Bole, Addis Ababa", proofOfAddressType: "Drivers License", proofOfAddressReference: "DEMO-POA-001", registrationNumber: "", representativeName: "", beneficialOwnerName: "", signatoryAuthorityConfirmed: true, termsAccepted: false, electronicDeliveryConsent: false, nationality: "Ethiopian", countryOfResidence: "Ethiopia", occupation: "Private employee", sourceOfFunds: "Employment income", investmentObjective: "Long-term growth", taxResidency: "Ethiopia", pepStatus: "not_pep" };
const institutionDemo: InvestorKyc = { accountType: "institution", fullName: "Blue Nile Trading PLC", phone: "0115500017", faydaId: "234567890123", tin: "0067047925", address: "Kirkos, Addis Ababa", proofOfAddressType: "Business license", proofOfAddressReference: "DEMO-POA-017", registrationNumber: "AA/2/12345/2018", representativeName: "Meron Bekele", beneficialOwnerName: "Selamawit Bekele", signatoryAuthorityConfirmed: false, termsAccepted: false, electronicDeliveryConsent: false, nationality: "Ethiopian", countryOfResidence: "Ethiopia", occupation: "Authorized representative", sourceOfFunds: "Operating income", investmentObjective: "Capital preservation and growth", taxResidency: "Ethiopia", pepStatus: "not_pep" };

function KycProgress({ step }: { step: number }) {
  return <div className={styles.kycProgress}><span><b>ACCOUNT SETUP</b><small>{step + 1} of 5</small></span><i><em style={{ width: `${((step + 1) / 5) * 100}%` }} /></i></div>;
}

function KycField({ label, value, onChange, hint, placeholder, inputMode = "text", maxLength }: { label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string; inputMode?: "text" | "numeric" | "tel"; maxLength?: number }) {
  return <label className={styles.kycField}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} autoComplete="off" />{hint && <small>{hint}</small>}</label>;
}

function KycOnboarding({ onComplete, legalDocument }: { onComplete: (profile: InvestorKyc) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<InvestorKyc>(retailDemo);
  const [consent, setConsent] = useState(false);
  const [linkedBanks, setLinkedBanks] = useState<LinkedBankAccount[]>([
    { id: "onboarding_bank_1", bankName: bankOptions[0], accountNumber: "100057894108", accountHolderName: retailDemo.fullName, status: "pending" },
  ]);
  const update = (field: keyof InvestorKyc, value: string | boolean) => setProfile((current) => ({ ...current, [field]: value }));
  const chooseType = (accountType: InvestorKyc["accountType"]) => {
    const nextProfile = accountType === "retail" ? retailDemo : institutionDemo;
    setProfile(nextProfile);
    setLinkedBanks([{ id: "onboarding_bank_1", bankName: bankOptions[0], accountNumber: accountType === "retail" ? "100057894108" : "100057890017", accountHolderName: nextProfile.fullName, status: "pending" }]);
  };
  const updateLinkedBank = (id: string, field: "bankName" | "accountNumber" | "accountHolderName", value: string) => {
    setLinkedBanks((current) => current.map((account) => account.id === id ? { ...account, [field]: value } : account));
  };
  const addLinkedBank = () => {
    if (linkedBanks.length >= 3) return;
    setLinkedBanks((current) => [...current, { id: crypto.randomUUID(), bankName: bankOptions[0], accountNumber: "", accountHolderName: profile.fullName, status: "pending" }]);
  };
  const removeLinkedBank = (id: string) => {
    if (linkedBanks.length <= 1) return;
    setLinkedBanks((current) => current.filter((account) => account.id !== id));
  };
  const phoneValid = profile.phone.replace(/\D/g, "").length >= 9;
  const faydaValid = /^\d{12}$/.test(profile.faydaId);
  const tinValid = /^\d{10}(?:-\d{2})?$/.test(profile.tin);
  const firstStepValid = profile.fullName.trim().length >= 3 && phoneValid;
  const identityStepValid = faydaValid && tinValid && profile.address.trim().length >= 4 && profile.proofOfAddressReference.trim().length >= 4 && (profile.accountType === "retail" || (profile.registrationNumber.trim().length >= 4 && profile.representativeName.trim().length >= 3 && profile.beneficialOwnerName.trim().length >= 3));
  const bankStepValid = linkedBanks.length > 0 && linkedBanks.length <= 3 && linkedBanks.every((account) =>
    account.bankName.trim().length > 0
    && account.accountNumber.replace(/\D/g, "").length >= 8
    && account.accountHolderName.trim().toLocaleLowerCase() === profile.fullName.trim().toLocaleLowerCase()
  );
  const masked = (value: string) => value.length <= 4 ? value : `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}`;

  if (step === 4) return <div className={styles.onboarding}>
    <KycProgress step={4} />
    <div className={styles.kycComplete}>
      <span><Icon name="check" size={24} /></span>
      <small>DEMO CHECK COMPLETE</small>
      <h1>Your details are ready</h1>
      <p>We checked the ID formats and captured your consent. Live Fayda and tax verification, plus bank verification, will be connected before real accounts are opened.</p>
      <Card className={styles.kycStatusCard}>
        <div><i><Icon name="check" size={14} /></i><span><b>Fayda ID format</b><small>12-digit FIN captured</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Tax information</b><small>TIN captured for review</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Linked banks</b><small>{linkedBanks.length} {linkedBanks.length === 1 ? "account" : "accounts"} submitted for review</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Account type</b><small>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</small></span></div>
      </Card>
    </div>
    <Button className={styles.full} onClick={() => {
      saveLinkedBanks(linkedBanks);
      onComplete(profile);
    }}>Build my investment plan</Button>
  </div>;

  if (step === 3) return <div className={styles.onboarding}>
    <KycProgress step={3} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(2)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>Check and consent</h1><p>Review the records and the agreement that will govern this account.</p></div>
    <Card className={styles.kycReview}><dl>
      <div><dt>Account</dt><dd>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</dd></div>
      <div><dt>Legal name</dt><dd>{profile.fullName}</dd></div>
      {profile.accountType === "institution" && <>
        <div><dt>Representative</dt><dd>{profile.representativeName}</dd></div>
        <div><dt>Beneficial owner</dt><dd>{profile.beneficialOwnerName}</dd></div>
        <div><dt>Registration</dt><dd>{profile.registrationNumber}</dd></div>
      </>}
      <div><dt>Fayda ID</dt><dd>{masked(profile.faydaId)}</dd></div>
      <div><dt>TIN</dt><dd>{masked(profile.tin)}</dd></div>
      <div><dt>Address evidence</dt><dd>{profile.proofOfAddressType} · {profile.proofOfAddressReference}</dd></div>
      <div><dt>Linked banks</dt><dd>{linkedBanks.length} {linkedBanks.length === 1 ? "account" : "accounts"}</dd></div>
    </dl></Card>
    <Card className={styles.termsCard}><small>{legalDocument ? `VERSION ${legalDocument.version} · EFFECTIVE ${legalDocument.effectiveAt}` : "DEMO TERMS"}</small><b>{legalDocument?.title ?? "Brokerage account terms"}</b><p>{legalDocument?.summary ?? "Account operation, order handling, fee disclosure, settlement, confirmation, discrepancy, restriction, and closure terms."}</p></Card>
    <label className={styles.consentRow}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i>{consent && <Icon name="check" size={13} />}</i><span>I confirm these details are accurate and consent to identity and tax verification.</span></label>
    {profile.accountType === "institution" && <label className={styles.consentRow}><input type="checkbox" checked={profile.signatoryAuthorityConfirmed} onChange={(event) => update("signatoryAuthorityConfirmed", event.target.checked)} /><i>{profile.signatoryAuthorityConfirmed && <Icon name="check" size={13} />}</i><span>I confirm the representative is authorized to open and operate this account for the institution.</span></label>}
    <label className={styles.consentRow}><input type="checkbox" checked={profile.termsAccepted} onChange={(event) => update("termsAccepted", event.target.checked)} /><i>{profile.termsAccepted && <Icon name="check" size={13} />}</i><span>I accept {legalDocument?.title ?? "the brokerage account terms"} and understand that fees and order details will be disclosed before submission.</span></label>
    <label className={styles.consentRow}><input type="checkbox" checked={profile.electronicDeliveryConsent} onChange={(event) => update("electronicDeliveryConsent", event.target.checked)} /><i>{profile.electronicDeliveryConsent && <Icon name="check" size={13} />}</i><span>Send confirmations, contract notes, statements, and account notices electronically.</span></label>
    <Button className={styles.full} disabled={!consent || !profile.termsAccepted || (profile.accountType === "institution" && !profile.signatoryAuthorityConfirmed)} onClick={() => setStep(4)}>Submit for verification</Button>
  </div>;

  if (step === 2) return <div className={styles.onboarding}>
    <KycProgress step={2} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(1)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>Link a bank account</h1><p>Add an account in your name for future withdrawals. You can link up to 3.</p></div>
    <div className={`${styles.kycForm} ${styles.onboardingBankList}`}>
      {linkedBanks.map((account, index) => <Card className={styles.onboardingBankCard} key={account.id}>
        <div className={styles.onboardingBankHead}><span><small>BANK ACCOUNT {index + 1}</small><b>{account.bankName}</b></span>{linkedBanks.length > 1 && <button onClick={() => removeLinkedBank(account.id)}>Remove</button>}</div>
        <label className={styles.formField}><span>Bank name</span><div className={styles.selectField}><select value={account.bankName} onChange={(event) => updateLinkedBank(account.id, "bankName", event.target.value)}>{bankOptions.map((bank) => <option key={bank}>{bank}</option>)}</select></div></label>
        <label className={styles.formField}><span>Account number</span><div><input inputMode="numeric" value={account.accountNumber} onChange={(event) => updateLinkedBank(account.id, "accountNumber", event.target.value.replace(/\D/g, "").slice(0, 24))} placeholder="Enter the full account number" /></div></label>
        <label className={styles.formField}><span>Account holder name</span><div><input value={account.accountHolderName} onChange={(event) => updateLinkedBank(account.id, "accountHolderName", event.target.value)} placeholder="As shown on the bank account" /></div>{account.accountHolderName.trim() && account.accountHolderName.trim().toLocaleLowerCase() !== profile.fullName.trim().toLocaleLowerCase() && <small className={styles.fieldError}>Use the same name shown in your verified records.</small>}</label>
      </Card>)}
      {linkedBanks.length < 3 && <button className={styles.addBankButton} onClick={addLinkedBank}><span>+</span>Add another bank account</button>}
      <div className={styles.accountNameWarning}><b>Account holder name must match verified records</b><span>We will check the bank account against {profile.fullName}.</span></div>
      <div className={styles.cashNotice}><b>What happens next</b><span>Your broker reviews the account details. Once approved, the bank account will appear as a withdrawal option.</span></div>
    </div>
    <Button className={styles.full} disabled={!bankStepValid} onClick={() => setStep(3)}>Review details</Button>
  </div>;

  if (step === 1) return <div className={styles.onboarding}>
    <KycProgress step={1} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(0)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>{profile.accountType === "retail" ? "Confirm your identity" : "Tell us about the institution"}</h1><p>{profile.accountType === "retail" ? "Use the details linked to your Fayda ID." : "We also need the representative, authority, and ownership records."}</p></div>
    <div className={styles.kycForm}>
      <KycField label={profile.accountType === "retail" ? "Fayda ID number (FIN)" : "Representative’s Fayda ID (FIN)"} value={profile.faydaId} onChange={(value) => update("faydaId", value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" maxLength={12} placeholder="12 digits" hint={profile.faydaId && !faydaValid ? "Fayda FIN must contain 12 digits." : "We’ll use this for identity verification."} />
      <KycField label="Taxpayer Identification Number (TIN)" value={profile.tin} onChange={(value) => update("tin", value.replace(/[^0-9-]/g, "").slice(0, 13))} inputMode="numeric" placeholder="0012814908" hint={profile.tin && !tinValid ? "Enter a 10-digit TIN or a TIN with its two-digit subTIN." : "Used for tax reporting and account records."} />
      {profile.accountType === "institution" && <>
        <KycField label="Business registration number" value={profile.registrationNumber} onChange={(value) => update("registrationNumber", value)} placeholder="Registration or license number" />
        <KycField label="Authorized representative" value={profile.representativeName} onChange={(value) => update("representativeName", value)} placeholder="Full legal name" />
        <KycField label="Beneficial owner / controller" value={profile.beneficialOwnerName} onChange={(value) => update("beneficialOwnerName", value)} placeholder="Primary declared owner or controller" />
      </>}
      <KycField label={profile.accountType === "retail" ? "Current address" : "Registered address"} value={profile.address} onChange={(value) => update("address", value)} placeholder="City and sub-city" />
      <KycField label="Proof of address type" value={profile.proofOfAddressType} onChange={(value) => update("proofOfAddressType", value)} placeholder="Utility bill, bank letter, business license…" />
      <KycField label="Document reference" value={profile.proofOfAddressReference} onChange={(value) => update("proofOfAddressReference", value)} placeholder="Demo document reference" />
    </div>
    <div className={styles.demoNotice}><b>Demo only</b><span>No document image is uploaded. The demo stores only a reference and review status; production storage must remain in the approved jurisdiction.</span></div>
    <Button className={styles.full} disabled={!identityStepValid} onClick={() => setStep(2)}>Continue</Button>
  </div>;

  return <div className={styles.onboarding}><KycProgress step={0} /><div className={styles.kycBrand}><AppLogo /></div><div className={styles.onboardingCopy}><h1>Open your investment account</h1><p>First, tell us who will own this account. It takes a few minutes.</p></div><div className={styles.accountTypeGrid}><button className={profile.accountType === "retail" ? styles.accountTypeSelected : ""} onClick={() => chooseType("retail")}><i>{profile.accountType === "retail" && <Icon name="check" size={13} />}</i><b>Retail investor</b><small>An account for you</small></button><button className={profile.accountType === "institution" ? styles.accountTypeSelected : ""} onClick={() => chooseType("institution")}><i>{profile.accountType === "institution" && <Icon name="check" size={13} />}</i><b>Institution</b><small>A company or organization</small></button></div><div className={styles.kycForm}><KycField label={profile.accountType === "retail" ? "Full legal name" : "Legal organization name"} value={profile.fullName} onChange={(value) => update("fullName", value)} placeholder="As shown on official records" /><KycField label="Mobile number" value={profile.phone} onChange={(value) => update("phone", value.replace(/[^0-9+]/g, ""))} inputMode="tel" placeholder="09… or +251…" hint="We’ll use this for account updates and security." /></div><div className={styles.demoNotice}><b>Demo only</b><span>These fictional details can be persisted to the shared demo database when connected.</span></div><Button className={styles.full} disabled={!firstStepValid} onClick={() => setStep(1)}>Continue</Button></div>;
}

function Onboarding({ onDone, legalDocument }: { onDone: (profile: InvestorKyc) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
  const [kycProfile, setKycProfile] = useState<InvestorKyc | null>(null);
  return kycProfile ? <InvestmentOnboarding onDone={() => onDone(kycProfile)} /> : <KycOnboarding onComplete={setKycProfile} legalDocument={legalDocument} />;
}

function InvestmentOnboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("");
  const [reaction, setReaction] = useState("");
  const plan = horizon === "short" || reaction === "sell" ? "Steady" : horizon === "long" && reaction === "buy" ? "Growth" : "Balanced";
  const mix = plan === "Steady" ? [70, 30] : plan === "Growth" ? [30, 70] : [50, 50];
  const choices = step === 1
    ? [["grow", "Grow long-term wealth", "Build something bigger over many years."], ["big", "Save for something big", "A house, a business, or another major goal."], ["income", "Earn steady income", "Regular dividends and bond interest."], ["learn", "Start learning", "Begin small and learn as you go."]]
    : step === 2
      ? [["short", "Within 3 years", "Soon. We’ll keep it mostly in bonds."], ["mid", "3 to 10 years", "Time to ride out some bumps."], ["long", "10 years or more", "Plenty of time for stocks to work."]]
      : [["sell", "Sell before it drops more", "Losses keep you up at night."], ["wait", "Wait it out", "Prices move; the plan has not changed."], ["buy", "Buy more while it’s cheaper", "A dip can be an opportunity."]];
  const selection = step === 1 ? goal : step === 2 ? horizon : reaction;
  const choose = (value: string) => step === 1 ? setGoal(value) : step === 2 ? setHorizon(value) : setReaction(value);

  if (step === 0) return <div className={styles.onboarding}><button className={styles.skip} onClick={onDone}>Skip for now</button><div className={styles.onboardingIntro}><Image src="/frankscore-icon.png" alt="Frank" width={74} height={104} priority /><h1>Let&apos;s build<br />your plan</h1><p>Three honest questions. No jargon. You&apos;ll get a mix of ESX stocks and government bonds that fits your life.</p></div><Button className={styles.full} onClick={() => setStep(1)}>Start</Button><ProgressDots step={0} /></div>;

  if (step === 4) return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(3)} aria-label="Go back"><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>Skip for now</button></div><div className={styles.onboardingCopy}><h1>Your plan: {plan}</h1><p>{plan === "Steady" ? "Bonds carry most of the weight and pay steady interest." : plan === "Growth" ? "A longer horizon gives stocks more room to work, with bonds as a cushion." : "Half stocks for growth, half bonds for calm."}</p></div><Card className={styles.planResult}><div className={styles.planResultTop}><ScoreRing score={plan === "Steady" ? 82 : plan === "Balanced" ? 74 : 66} /><span><b>{plan} plan</b><small>{mix[0]}% bonds · {mix[1]}% stocks</small><em>Starting FrankScore estimate</em></span></div><AllocationBar bonds={mix[0]} stocks={mix[1]} light /></Card><p className={styles.planNote}>We rebalance it automatically and tell you plainly when something changes. You can switch plans or pick stocks yourself anytime.</p><Button className={styles.full} onClick={onDone}>Start with this plan</Button><button className={styles.textButton} onClick={onDone}>I&apos;ll pick stocks myself instead</button><ProgressDots step={3} /></div>;

  const heading = step === 1 ? "What is this money for?" : step === 2 ? "When will you need it?" : "One month in, ETB 10,000 shows ETB 8,500. What do you do?";
  const subheading = step === 1 ? "Your goal decides how much risk makes sense." : step === 2 ? "Time is the biggest safety net an investor has." : "There’s no wrong answer. Just an honest one.";
  return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(step - 1)} aria-label="Go back"><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>Skip for now</button></div><div className={styles.onboardingCopy}><h1>{heading}</h1><p>{subheading}</p></div><div className={styles.choiceList}>{choices.map(([value, label, description]) => <button key={value} className={`${styles.choiceCard} ${selection === value ? styles.choiceSelected : ""}`} onClick={() => choose(value)}><i>{selection === value && <Icon name="check" size={13} />}</i><span><b>{label}</b><small>{description}</small></span></button>)}</div><Button className={styles.full} disabled={!selection} onClick={() => setStep(step === 3 ? 4 : step + 1)}>Continue</Button><ProgressDots step={step} /></div>;
}

function AllocationBar({ bonds, stocks, light = false }: { bonds: number; stocks: number; light?: boolean }) {
  return <div className={`${styles.allocationBar} ${light ? styles.allocationLight : ""}`}><i style={{ width: `${bonds}%` }} /><i style={{ width: `${stocks}%` }} /></div>;
}

function AppLogo() {
  return <div className={styles.appLogo}><Image src="/frankscore-icon.png" alt="" width={29} height={41} /><b>Frank</b></div>;
}

function HomeScreen({ openStock, go, account, unread, onBell, onCash }: { openStock: (stock: InvestorStock) => void; go: (tab: Tab) => void; account: InvestorBootstrap["account"]; unread: number; onBell: () => void; onCash: () => void }) {
  const [tip, setTip] = useState(0);
  const holdings = account?.holdings.length ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker)) : investorHoldings;
  const stockValue = holdings.reduce((sum, holding) => sum + investorStocks.find((stock) => stock.ticker === holding.ticker)!.price * holding.quantity, 0);
  const totalValue = stockValue + 25_000 + (account?.availableCash ?? 4_210);
  return <div className={styles.screen}><div className={styles.homeHeader}><AppLogo /><button className={styles.iconButton} aria-label="Notifications" onClick={onBell}><Icon name="bell" size={20} />{unread > 0 && <i />}</button></div><Card className={styles.heroCard}><small>Your money, all together</small><strong>{formatEtb(totalValue)}</strong><div><Delta value={1.8} pill /><span>ESX open · closes 15:30</span></div></Card><div className={styles.quickActions}><Button onClick={() => go("markets")}><Icon name="plus" size={18} /> Invest</Button><Button variant="secondary" onClick={onCash}>Add or withdraw</Button></div><Card><div className={styles.cardHeader}><h2>Companies you own</h2><button onClick={() => go("portfolio")}>Details</button></div>{holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; return <StockRow key={stock.ticker} stock={stock} holdingValue={stock.price * holding.quantity} onClick={() => openStock(stock)} />; })}</Card><Card className={styles.coachCard}><span><Icon name="bulb" size={20} /></span><div><small>FRANK COACH</small><h3>{coachTips[tip].title}</h3><p>{coachTips[tip].body}</p><button onClick={() => setTip((tip + 1) % coachTips.length)}>Next tip <em>{tip + 1}/{coachTips.length}</em></button></div></Card><Card><div className={styles.cardHeader}><h2>Your plan</h2><span className={styles.badge}>Steady</span></div><div className={styles.planPreview}><ScoreRing /><div><b>FrankScore 78, healthy</b><p>70% bonds, 30% stocks. Built for sleeping well.</p><button onClick={() => go("learn")}>Review plan</button></div></div></Card></div>;
}

function MarketsScreen({ openStock, enabledTickers, bondsEnabled }: { openStock: (stock: InvestorStock) => void; enabledTickers: string[] | null; bondsEnabled: boolean }) {
  const [asset, setAsset] = useState<"Stocks" | "Bonds">("Stocks");
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const stocks = investorStocks.filter((stock) => (!enabledTickers || enabledTickers.includes(stock.ticker)) && (sector === "All" || stock.sector === sector) && `${stock.ticker} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.screen}><ScreenHeader title="Markets" /><label className={styles.searchField}><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies or tickers" /></label><div className={styles.segmented}>{(["Stocks", "Bonds"] as const).filter((item) => item === "Stocks" || bondsEnabled).map((item) => <button key={item} className={asset === item ? styles.segmentActive : ""} onClick={() => setAsset(item)}>{item}</button>)}</div>{asset === "Stocks" || !bondsEnabled ? <><div className={styles.chips}>{["All", "Banks", "Telecom"].map((item) => <button key={item} className={sector === item ? styles.chipActive : ""} onClick={() => setSector(item)}>{item}</button>)}</div><Card><p className={styles.cardIntro}>Companies enabled by your broker</p>{stocks.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}{stocks.length === 0 && <p className={styles.empty}>No enabled instruments match this search.</p>}</Card></> : <Card><p className={styles.cardIntro}>Bonds: you lend, they pay you back with interest.</p>{investorBonds.filter((bond) => !enabledTickers || enabledTickers.includes(bond.ticker)).map((bond) => <button className={styles.bondRow} key={bond.ticker}><span><Icon name="shield" size={20} /></span><span><b>{bond.name}</b><small>{bond.maturity} · from {bond.minimum}</small></span><span><b>{bond.rate}</b><small>per year</small></span></button>)}</Card>}</div>;
}

function PortfolioScreen({ openStock, account }: { openStock: (stock: InvestorStock) => void; account: InvestorBootstrap["account"] }) {
  const holdings = account?.holdings.length ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker)) : investorHoldings;
  const rows = holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; const value = stock.price * holding.quantity; const cost = holding.averageCost * holding.quantity; return { holding, stock, value, cost, gain: value - cost }; });
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const cash = account?.availableCash ?? 4_210;
  const total = stockValue + 25_000 + cash;
  return <div className={styles.screen}><ScreenHeader title="Portfolio" /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(total)}</strong><div className={styles.summaryGrid}><span><small>Cost basis (stocks)</small><b>{formatEtb(cost)}</b></span><span><small>Unrealized gain</small><b className={styles.gain}>+{formatEtb(stockValue - cost).replace("ETB ", "")}</b></span><span><small>Dividends this year</small><b>ETB 1,440.00</b></span><span><small>Today</small><Delta value={1.8} /></span></div></Card><Card><div className={styles.cardHeader}><h2>Performance</h2><span className={`${styles.badge} ${styles.gainBadge}`}>+18.5% all time</span></div><PortfolioChart total={total} /></Card><Card><div className={styles.cardHeader}><h2>What you own</h2></div><AllocationBar bonds={Math.round((25_000 / total) * 100)} stocks={Math.round((stockValue / total) * 100)} /><div className={styles.legend}><span><i />Stocks {Math.round((stockValue / total) * 100)}%</span><span><i />Bonds {Math.round((25_000 / total) * 100)}%</span><span><i />Cash {Math.round((cash / total) * 100)}%</span></div>{rows.map((row) => <button className={styles.holdingRow} key={row.stock.ticker} onClick={() => openStock(row.stock)}><span className={styles.tickerTile}>{row.stock.ticker.slice(0, 4)}</span><span><b>{row.stock.name}</b><small>{row.holding.quantity} sh · avg {formatEtb(row.holding.averageCost)}</small></span><span><b>{formatEtb(row.value)}</b><small className={row.gain >= 0 ? styles.gain : styles.loss}>{row.gain >= 0 ? "+" : "−"}{formatEtb(Math.abs(row.gain)).replace("ETB ", "")}</small></span></button>)}<div className={styles.holdingRow}><span className={styles.tickerTile}><Icon name="shield" size={19} /></span><span><b>GoE Treasury Bonds</b><small>14.5–16.0% per year · held to maturity</small></span><span><b>ETB 25,000.00</b></span></div></Card><p className={styles.disclaimer}>Unrealized gains are on paper until you sell. Estimates use the last traded ESX price.</p></div>;
}

const lessons = [
  {
    id: "investing",
    title: "Investing 101",
    summary: "Learn what you can own and why prices move.",
    points: [
      ["Stocks", "A stock is a small piece of a company. Its price can rise or fall."],
      ["Bonds", "A bond is money you lend. The issuer pays interest and returns your money at maturity."],
      ["Time", "Prices move from day to day. A longer time frame can give your investment room to grow."],
    ],
  },
  {
    id: "orders",
    title: "Order types",
    summary: "Choose how and when your order can trade.",
    points: [
      ["Market", "Tries to trade now at the best available price. The final price can change."],
      ["Limit", "You set the most you will pay or the least you will accept. The order may not trade."],
      ["Stop-limit", "You set a trigger price and a limit price. When the trigger is reached, a limit order is sent. It may not trade."],
    ],
  },
  {
    id: "dividends",
    title: "Dividends",
    summary: "Some companies share part of their profit with owners.",
    points: [
      ["How they work", "A dividend is a cash payment for each share you own."],
      ["Payment dates", "The company sets who gets paid and when the money is sent."],
      ["Not promised", "A company can lower, delay, or stop a dividend."],
    ],
  },
  {
    id: "risk",
    title: "Spread your risk",
    summary: "Do not let one company or sector carry all the weight.",
    points: [
      ["Mix", "Holding different companies and bonds can soften the effect of one weak investment."],
      ["Fit", "Choose a mix that matches your goal, your time, and how much movement you can accept."],
    ],
  },
] as const;

function LearnScreen({ showPlanTools }: { showPlanTools: boolean }) {
  const [openLesson, setOpenLesson] = useState<string | null>("investing");
  const [plan, setPlan] = useState<"steady" | "balanced" | "growth">("steady");
  const mix = plan === "steady" ? [70, 30] : plan === "balanced" ? [50, 50] : [30, 70];
  return <div className={styles.screen}><ScreenHeader title="Learn" /><p className={styles.learnIntro}>Short lessons to help you make clear choices with your money.</p><div className={styles.lessonList}>{lessons.map((lesson) => { const open = openLesson === lesson.id; return <Card className={`${styles.lessonCard} ${open ? styles.lessonOpen : ""}`} key={lesson.id}><button onClick={() => setOpenLesson(open ? null : lesson.id)} aria-expanded={open}><span><b>{lesson.title}</b><small>{lesson.summary}</small></span><Icon name="chevron" size={17} /></button>{open && <div className={styles.lessonBody}>{lesson.points.map(([label, text]) => <div key={label}><b>{label}</b><p>{text}</p></div>)}</div>}</Card>; })}</div>{showPlanTools && <><div className={styles.learnSection}><small>YOUR PLAN</small><h2>Put what you learn into practice</h2></div><Card className={styles.planHero}><ScoreRing /><div><h2>FrankScore 78</h2><p>Healthy, spread out, and on track for your goal.</p></div></Card><Card><div className={styles.cardHeader}><h2>Your mix</h2></div><AllocationBar bonds={mix[0]} stocks={mix[1]} /><div className={styles.legend}><span><i />Bonds {mix[0]}%</span><span><i />Stocks {mix[1]}%</span></div></Card><Card className={styles.planChoices}>{([ ["steady", "Steady", "70% bonds, 30% stocks. Built for sleeping well."], ["balanced", "Balanced", "Half bonds and half stocks. Some movement, some calm."], ["growth", "Growth", "70% stocks. More movement and more room to grow."] ] as const).map(([value, label, description]) => <label key={value}><input type="radio" name="plan" checked={plan === value} onChange={() => setPlan(value)} /><i /><span><b>{label}</b><small>{description}</small></span></label>)}</Card><Card><div className={styles.cardHeader}><h2>Your goal</h2><span className={styles.badge}>2036</span></div><Sparkline values={[78, 82, 89, 101, 117, 140]} large /><div className={styles.goalValue}><span>On track for</span><b>ETB 1,240,000</b></div><p className={styles.cardIntro}>If you keep investing ETB 2,000 each month. This is an estimate, not a promise. Markets move.</p></Card><Button className={styles.full}>Keep this plan</Button></>}</div>;
}

function ProfileScreen({ notify, name, profile, orders, requests, legalDocument, onRequest }: { notify: (message: string) => void; name: string; profile: InvestorBootstrap["profile"]; orders: Array<{ id: string }>; requests: InvestorBootstrap["serviceRequests"]; legalDocument: InvestorBootstrap["tenant"]["legalDocument"]; onRequest: (requestType: "trade_discrepancy" | "account_closure" | "profile_correction", orderId?: string) => void }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM";
  const latestOrderId = orders[0]?.id;
  const [linkedBanksOpen, setLinkedBanksOpen] = useState(false);
  const [linkedBanks, setLinkedBanks] = useState<LinkedBankAccount[]>(readLinkedBanks);
  const addLinkedBank = (bankName: string, accountNumber: string) => {
    if (linkedBanks.length >= 3) return notify("You can link up to 3 bank accounts.");
    if (linkedBanks.some((account) => account.bankName === bankName && account.accountNumber === accountNumber)) return notify("This bank account is already linked.");
    const updated = [...linkedBanks, { id: crypto.randomUUID(), bankName, accountNumber, accountHolderName: name, status: "pending" as const }];
    setLinkedBanks(updated);
    saveLinkedBanks(updated);
    notify("Bank account sent for review.");
  };
  const deleteLinkedBank = (id: string) => {
    const updated = linkedBanks.filter((account) => account.id !== id);
    setLinkedBanks(updated);
    saveLinkedBanks(updated);
    notify("Linked bank account removed.");
  };
  return <div className={styles.screen}>
    <ScreenHeader title="You" />
    <Card className={styles.profileCard}><span>{initials}</span><div><b>{name}</b><small>Investor account · KYC {profile?.kycStatus ?? "pending"}</small></div><em>{profile?.proofOfAddressStatus ?? "Demo checked"}</em></Card>
    <Card className={styles.complianceCard}><div className={styles.cardHeader}><h2>Account records</h2><span className={styles.badge}>{profile?.termsAcceptedVersion ? `Terms ${profile.termsAcceptedVersion}` : "Terms pending"}</span></div><dl><div><dt>Brokerage agreement</dt><dd>{legalDocument?.title ?? "Demo brokerage terms"}</dd></div><div><dt>KYC review</dt><dd>{profile?.kycReviewDueAt ? new Date(profile.kycReviewDueAt).toLocaleDateString("en-GB") : "Not scheduled"}</dd></div><div><dt>Address evidence</dt><dd>{profile?.proofOfAddressStatus ?? "Pending"}</dd></div></dl></Card>
    <Card className={styles.menuCard}>
      <button onClick={() => setLinkedBanksOpen(true)}><span>Linked bank accounts</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => onRequest("profile_correction")}><span>Request profile correction</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => latestOrderId ? onRequest("trade_discrepancy", latestOrderId) : notify("There is no recent order to report.")}><span>Report an order discrepancy</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => onRequest("account_closure")}><span>Request account closure</span><Icon name="chevron" size={18} /></button>
      {["Statements & tax", "Security", "Help in Amharic"].map((item) => <button key={item} onClick={() => notify(`${item} is ready for the next demo phase.`)}><span>{item}</span><Icon name="chevron" size={18} /></button>)}
    </Card>
    {requests.length > 0 && <Card className={styles.requestCard}><div className={styles.cardHeader}><h2>Your requests</h2></div>{requests.slice(0, 4).map((item) => <div key={item.id}><span><b>{item.subject}</b><small>{new Date(item.submittedAt).toLocaleDateString("en-GB")} · {item.id}</small></span><em>{item.status.replaceAll("_", " ")}</em></div>)}</Card>}
    <p className={styles.license}>Demo experience only. Licensing and membership statements must be verified for the deploying tenant before production.</p>
    {linkedBanksOpen && <LinkedBanksSheet accounts={linkedBanks} accountHolderName={name} onClose={() => setLinkedBanksOpen(false)} onAdd={addLinkedBank} onDelete={deleteLinkedBank} />}
  </div>;
}

function LinkedBanksSheet({ accounts, accountHolderName, onClose, onAdd, onDelete }: { accounts: LinkedBankAccount[]; accountHolderName: string; onClose: () => void; onAdd: (bankName: string, accountNumber: string) => void; onDelete: (id: string) => void }) {
  const [bankName, setBankName] = useState(bankOptions[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const atLimit = accounts.length >= 3;
  const valid = bankName.trim().length > 0 && accountNumber.replace(/\D/g, "").length >= 8 && !atLimit;
  const add = () => {
    if (!valid) return;
    onAdd(bankName, accountNumber.replace(/\D/g, ""));
    setAccountNumber("");
  };
  const remove = (account: LinkedBankAccount) => {
    if (window.confirm(`Remove ${account.bankName} ${maskLinkedAccount(account.accountNumber)} from your linked accounts?`)) onDelete(account.id);
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.linkedBanksSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="linked-banks-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}><div><small>YOUR ACCOUNT</small><h2 id="linked-banks-title">Linked bank accounts</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
      <div className={styles.linkedBankSummary}><span><b>{accounts.length} of 3 linked</b><small>Approved accounts can receive withdrawals.</small></span></div>
      <div className={styles.linkedBankList}>
        {accounts.map((account) => <div key={account.id} className={styles.linkedBankRow}>
          <span><b>{account.bankName}</b><small>{maskLinkedAccount(account.accountNumber)} · {account.accountHolderName}</small></span>
          <span><em data-status={account.status}>{account.status}</em><button onClick={() => remove(account)} aria-label={`Delete ${account.bankName} account`}>Delete</button></span>
        </div>)}
      </div>
      {!atLimit ? <div className={styles.linkBankForm}>
        <h3>Add a bank account</h3>
        <label className={styles.formField}><span>Bank name</span><div className={styles.selectField}><select value={bankName} onChange={(event) => setBankName(event.target.value)}>{bankOptions.map((bank) => <option key={bank}>{bank}</option>)}</select><em>⌄</em></div></label>
        <label className={styles.formField}><span>Account number</span><div><input inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="Enter the full account number" /></div></label>
        <div className={styles.accountNameWarning}><b>Account holder name must match verified records</b><span>We will check the bank account against {accountHolderName}.</span></div>
        <div className={styles.cashNotice}><b>What happens next</b><span>Your broker reviews the account details. Once approved, the bank account will appear as a withdrawal option.</span></div>
        <Button className={styles.full} disabled={!valid} onClick={add}>Send for approval</Button>
      </div> : <div className={styles.cashNotice}><b>You have linked 3 bank accounts</b><span>Delete an account before adding another one.</span></div>}
    </section>
  </div>;
}

function calculateInvestorFees(gross: number, rule: InvestorFeeRule) {
  const brokerage = gross > 0 ? Math.min(rule.maximumFee ?? Number.POSITIVE_INFINITY, Math.max(rule.minimumFee, gross * rule.brokeragePct / 100)) : 0;
  const regulator = gross * rule.regulatorPct / 100;
  const exchange = gross * rule.exchangePct / 100;
  const csd = gross * rule.csdPct / 100;
  return { brokerage, regulator, exchange, csd, total: brokerage + regulator + exchange + csd };
}

function CashSheet({ pools: configuredPools, movements, availableCash, onClose, onSubmit }: { pools: CashPool[]; movements: CashMovementView[]; availableCash: number; onClose: () => void; onSubmit: (input: CashMovementInput) => Promise<boolean> }) {
  const pools = configuredPools.length ? configuredPools : [{ id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", beneficialBalance: availableCash || 75_000 }];
  const linkedBanks = readLinkedBanks();
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("15000");
  const [bankReference, setBankReference] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const approvedBanks = linkedBanks.filter((account) => account.status === "approved");
  const [destinationBankId, setDestinationBankId] = useState(approvedBanks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const receiptUploadId = useId();
  const selectedPool = pools[0];
  const selectedDestination = approvedBanks.find((account) => account.id === destinationBankId) ?? approvedBanks[0];
  const accountNumbers: Record<string, string> = {
    pool_aby_general: "100057894108",
    pool_aby_fixed_income: "100057897721",
  };
  const transferAccountNumber = selectedPool ? accountNumbers[selectedPool.id] ?? selectedPool.accountNumberMasked.replace(/[•\s]/g, "") : "";
  const value = Number(amount) || 0;
  const withdrawableCash = configuredPools.length ? availableCash : 75_000;
  const valid = Boolean(selectedPool && value > 0 && (type === "deposit" ? bankReference.trim() : selectedDestination && value <= withdrawableCash));
  const submit = async () => {
    if (!selectedPool) return;
    setBusy(true);
    try {
      const saved = await onSubmit({
        movementType: type,
        pooledBankAccountId: selectedPool.id,
        amount: value,
        bankReference,
        proofReference,
        destinationBankName: selectedDestination?.bankName,
        destinationAccountName: selectedDestination?.accountHolderName,
        destinationAccountMasked: selectedDestination ? maskLinkedAccount(selectedDestination.accountNumber) : undefined,
      });
      if (saved) onClose();
    } finally { setBusy(false); }
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.cashSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="cash-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}>
        <div><small>CLIENT MONEY</small><h2 id="cash-title">Move money</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={styles.segmented}>
        <button className={type === "deposit" ? styles.segmentActive : ""} onClick={() => setType("deposit")}>Add money</button>
        <button className={type === "withdrawal" ? styles.segmentActive : ""} onClick={() => setType("withdrawal")}>Withdraw</button>
      </div>
      {pools.length === 0 ? <div className={styles.cashNotice}>Your broker has not configured a client-money bank account yet.</div> : <>
        {type === "deposit" ? <>
          <div className={styles.bankInstruction}>
            <span><small>TRANSFER TO</small><b>{selectedPool?.accountName}</b></span>
            <dl>
              <div><dt>Bank</dt><dd>{selectedPool?.bankName}</dd></div>
              <div><dt>Account</dt><dd>{transferAccountNumber}</dd></div>
              <div><dt>Reference</dt><dd>Use your investor name</dd></div>
            </dl>
          </div>
          <label className={styles.formField}>
            <span>Deposit amount</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </label>
          <label className={styles.formField}>
            <span>Bank transfer reference</span>
            <div><input value={bankReference} onChange={(event) => setBankReference(event.target.value)} placeholder="e.g. CBE-FT-908231" /></div>
            <small>Your broker will use this reference to match the transfer.</small>
          </label>
          <div className={styles.uploadField}>
            <span>Receipt or deposit slip (optional)</span>
            <input id={receiptUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setReceiptFile(file);
              setProofReference(file?.name ?? "");
            }} />
            <label htmlFor={receiptUploadId}>
              <b>{receiptFile ? receiptFile.name : "Upload a document"}</b>
              <small>{receiptFile ? `${(receiptFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
              <em>{receiptFile ? "✓" : "+"}</em>
            </label>
          </div>
        </> : <>
          <div className={styles.availableCashCard}><span>AVAILABLE TO WITHDRAW</span><b>{formatEtb(withdrawableCash)}</b><small>Pending orders and withdrawals are already excluded.</small></div>
          <label className={styles.formField}>
            <span>Amount to withdraw</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
            {value > withdrawableCash && <small className={styles.fieldError}>Enter an amount within your available cash.</small>}
          </label>
          {approvedBanks.length > 0 ? <>
            <label className={styles.formField}><span>Destination bank</span><div className={styles.selectField}><select value={selectedDestination?.id ?? ""} onChange={(event) => setDestinationBankId(event.target.value)}>{approvedBanks.map((account) => <option key={account.id} value={account.id}>{account.bankName}</option>)}</select><em>⌄</em></div></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>Account number</span><div><input value={selectedDestination ? maskLinkedAccount(selectedDestination.accountNumber) : ""} readOnly /></div></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>Account holder name</span><div><input value={selectedDestination?.accountHolderName ?? ""} readOnly /></div></label>
          </> : <div className={styles.cashNotice}><b>No approved bank account</b><span>Add a bank account under You. It will appear here after review and approval.</span></div>}
          <div className={styles.cashNotice}><b>What happens next</b><span>{formatEtb(value)} will be reserved immediately, reviewed by your broker, then debited only after payment is confirmed. Rejection or payment failure releases the reservation.</span></div>
        </>}
        <Button className={styles.full} disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Sending…" : type === "deposit" ? "Send for verification" : "Request withdrawal"}</Button>
      </>}
      {movements.length > 0 && <div className={styles.cashHistory}><h3>Recent instructions</h3>{movements.slice(0, 3).map((movement) => <div key={movement.id}><span><b>{movement.type === "deposit" ? "Deposit" : "Withdrawal"}</b><small>{new Date(movement.submittedAt).toLocaleDateString("en-GB")} · {movement.id}</small></span><span><b>{formatEtb(movement.amount)}</b><em data-status={movement.status}>{movement.status.replaceAll("_", " ")}</em></span></div>)}</div>}
    </section>
  </div>;
}

function OrderSheet({ stock, side, holdingQuantity, feeRule, allowedOrderTypes, onClose, onPlaced }: { stock: InvestorStock; side: "Buy" | "Sell"; holdingQuantity: number; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop-loss">("Market");
  const [mode, setMode] = useState<"birr" | "shares">("birr");
  const [amount, setAmount] = useState("2000");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState(String(Math.round(stock.price * .98)));
  const [reviewing, setReviewing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [heldChecks, setHeldChecks] = useState<OrderCheck[]>([]);
  const isSell = side === "Sell";
  const executionPrice = orderType === "Limit" ? Number(limitPrice) || stock.price : stock.price;
  const shares = mode === "birr" && !isSell && orderType === "Market" ? (Number(amount) || 0) / executionPrice : Number(quantity) || 0;
  const gross = mode === "birr" && !isSell && orderType === "Market" ? Number(amount) || 0 : shares * executionPrice;
  const fees = calculateInvestorFees(gross, feeRule);
  const candidateOptions: Array<"Market" | "Limit" | "Stop-loss"> = isSell ? ["Market", "Limit", "Stop-loss"] : ["Market", "Limit"];
  const options = candidateOptions.filter((option) => allowedOrderTypes.includes(option));
  const place = async () => {
    setPlacing(true);
    setHeldChecks([]);
    try {
      const result = await onPlaced({ symbol: stock.ticker, side: isSell ? "sell" : "buy", quantity: shares, price: executionPrice, orderType, disclosureAccepted: true, disclosureVersion: "order-v1" });
      const failed = (result?.checks ?? []).filter((check) => !check.passed);
      if (failed.length) { setHeldChecks(failed); setReviewing(false); }
    }
    finally { setPlacing(false); }
  };
  return <><div className={styles.sheetBackdrop} onClick={onClose}><section className={styles.orderSheet} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="order-title"><i className={styles.sheetHandle} /><h2 id="order-title">{side} {stock.ticker}</h2><div className={styles.chips}>{options.map((option) => <button key={option} className={orderType === option ? styles.chipActive : ""} onClick={() => setOrderType(option)}>{option}</button>)}</div><p className={styles.orderHint}>{orderType === "Market" ? "Trades at the best available ESX price." : orderType === "Limit" ? `${side}s only at your selected price or better.` : "Sells at the next available price after your trigger is reached."}</p>{!isSell && orderType === "Market" && <div className={styles.segmented}><button className={mode === "birr" ? styles.segmentActive : ""} onClick={() => setMode("birr")}>In birr</button><button className={mode === "shares" ? styles.segmentActive : ""} onClick={() => setMode("shares")}>In shares</button></div>}{orderType === "Limit" && <label className={styles.formField}><span>{isSell ? "Sell at or above" : "Buy at or below"}</span><div><em>ETB</em><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>}{mode === "birr" && !isSell && orderType === "Market" ? <label className={styles.formField}><span>Amount</span><div><em>ETB</em><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} /></div><small>≈ {shares.toFixed(3)} shares — own a slice, no matter the share price</small></label> : <label className={styles.formField}><span>Shares</span><div><input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ""))} /><em>× {formatEtb(executionPrice)}</em></div>{isSell && <small>You hold {holdingQuantity} shares</small>}</label>}<dl className={styles.orderTotals}><div><dt>Gross consideration</dt><dd>{formatEtb(gross)}</dd></div><div><dt>Brokerage</dt><dd>{formatEtb(fees.brokerage)}</dd></div>{fees.regulator > 0 && <div><dt>Regulatory fee</dt><dd>{formatEtb(fees.regulator)}</dd></div>}{fees.exchange > 0 && <div><dt>Exchange fee</dt><dd>{formatEtb(fees.exchange)}</dd></div>}{fees.csd > 0 && <div><dt>CSD fee</dt><dd>{formatEtb(fees.csd)}</dd></div>}<div><dt>Total estimated fees</dt><dd>{formatEtb(fees.total)}</dd></div><div><dt>{isSell ? "Estimated net proceeds" : "Estimated cash required"}</dt><dd>{formatEtb(isSell ? gross - fees.total : gross + fees.total)}</dd></div></dl>{heldChecks.length > 0 && <div role="alert" style={{ margin: "0 0 14px", padding: "12px 14px", borderRadius: 14, background: "#FBE9E9", border: "1px solid #F1C9C9", color: "#B4322E", fontSize: 13, lineHeight: 1.5 }}><b style={{ display: "block", marginBottom: 4 }}>Order held — {heldChecks.length === 1 ? "1 check needs attention" : `${heldChecks.length} checks need attention`}</b><ul style={{ margin: 0, paddingLeft: 18 }}>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}<Button className={styles.full} variant={isSell ? "danger" : "primary"} disabled={gross <= 0 || options.length === 0 || (isSell && shares > holdingQuantity)} onClick={() => setReviewing(true)}>Review order</Button></section></div>{reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm order</h2><p>You&apos;re {isSell ? "selling" : "buying"} <b>{shares.toFixed(mode === "birr" ? 3 : 0)} shares of {stock.ticker}</b> for about <b>{formatEtb(gross)}</b>, plus estimated fees of <b>{formatEtb(fees.total)}</b>. A market order can execute at a different price; a limit order may not fill.</p><label className={styles.consentRow}><input type="checkbox" checked={disclosureAccepted} onChange={(event) => setDisclosureAccepted(event.target.checked)} /><i>{disclosureAccepted && <Icon name="check" size={13} />}</i><span>I reviewed the instrument, quantity, order type, estimated value, fee breakdown, and execution risk and authorize this instruction.</span></label><div><Button variant="secondary" onClick={() => setReviewing(false)}>Cancel</Button><Button variant={isSell ? "danger" : "primary"} disabled={placing || !disclosureAccepted} onClick={() => void place()}>{placing ? "Sending…" : side}</Button></div></section></div>}</>;
}

function StockDetail({ stock, account, onBack, placeOrder, feeRule, allowedOrderTypes }: { stock: InvestorStock; account: InvestorBootstrap["account"]; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const [side, setSide] = useState<"Buy" | "Sell" | null>(null);
  const [range, setRange] = useState<MarketRange>("1M");
  const holding = account?.holdings.find((item) => item.ticker === stock.ticker) ?? investorHoldings.find((item) => item.ticker === stock.ticker);
  const session = getInvestorSession(stock);
  return <div className={styles.detailScreen}><ScreenHeader title={stock.ticker} onBack={onBack} right={<span className={styles.badge}>{stock.sector}</span>} /><div className={styles.detailBody}><p className={styles.companyName}>{stock.name}</p><div className={styles.quote}><strong>{formatEtb(stock.price)}</strong><Delta value={stock.delta} pill /></div><PriceChart key={`${stock.ticker}-${range}`} stock={stock} range={range} /><div className={styles.rangeTabs}>{(["1W", "1M", "3M", "1Y", "All"] as MarketRange[]).map((item) => <button key={item} className={range === item ? styles.rangeActive : ""} onClick={() => setRange(item)} aria-pressed={range === item}>{item}</button>)}</div><Card className={styles.marketStats}>{[["Open", formatEtb(session.open)], ["Day range", `${formatEtb(session.low)} – ${formatEtb(session.high)}`], ["Volume", `${session.volume.toLocaleString("en-US")} shares`], ["Listed", "ESX Main Market"]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</Card>{holding && <Card className={styles.positionCard}><small>YOUR POSITION</small><div>{[["Shares", `${holding.quantity} sh`], ["Avg cost", formatEtb(holding.averageCost)], ["Value", formatEtb(holding.quantity * stock.price)], ["Unrealized", `${holding.quantity * (stock.price - holding.averageCost) >= 0 ? "+" : "−"}${formatEtb(Math.abs(holding.quantity * (stock.price - holding.averageCost))).replace("ETB ", "")}`]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></Card>}<Card><div className={styles.cardHeader}><h2>Company insights</h2></div><div className={styles.insights}>{[["Dividend yield", stock.dividendYield], ["P/E", stock.pe], ["YTD", `${stock.ytd >= 0 ? "+" : ""}${stock.ytd}%`], ["Revenue", stock.revenueGrowth], ["Next dividend", stock.nextDividend], ["Sector", stock.sector]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className={styles.frankTake}><small>FRANK&apos;S TAKE</small><p>{stock.frankTake}</p></div></Card><Card><div className={styles.cardHeader}><h2>About</h2></div><p className={styles.about}>{stock.about}</p></Card><p className={styles.disclaimer}>Prices move. Invest money you won&apos;t need soon.</p></div><div className={styles.tradeBar}><Button onClick={() => setSide("Buy")}>Buy</Button><Button variant="secondary" disabled={!holding} onClick={() => setSide("Sell")}>Sell</Button></div>{side && <OrderSheet stock={stock} side={side} holdingQuantity={holding?.quantity ?? 0} feeRule={feeRule} allowedOrderTypes={allowedOrderTypes} onClose={() => setSide(null)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status !== "validation_failed") setSide(null); return result; }} />}</div>;
}

export default function InvestorApp() {
  const [phase, setPhase] = useState<"onboarding" | "app">("onboarding");
  const [tab, setTab] = useState<Tab>("home");
  const [stock, setStock] = useState<InvestorStock | null>(null);
  const [toast, setToast] = useState("");
  const [profileName, setProfileName] = useState("Selam Mekonnen");
  const [bootstrap, setBootstrap] = useState<InvestorBootstrap | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const featured = useMemo(() => investorStocks.slice(0, 3), []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const navigate = (next: Tab) => { setTab(next); setStock(null); };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications", { headers: investorHeaders, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
      .catch(() => setNotifications(demoInvestorNotifications()));
    return () => controller.abort();
  }, []);
  const unreadNotifs = notifications.filter((item) => !item.read).length;
  const markAllNotifsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  };
  const openNotification = (item: NotificationItem) => {
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) }).catch(() => undefined);
    setBellOpen(false);
    if (["order", "trade", "settlement"].includes(item.category)) navigate("portfolio");
    else if (item.category === "kyc") navigate("profile");
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/investor", { headers: investorHeaders, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: InvestorBootstrap) => { setBootstrap(data); if (data.profile?.fullName) setProfileName(data.profile.fullName); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const postInvestor = async (body: unknown) => {
    const response = await fetch("/api/investor", { method: "POST", headers: { ...investorHeaders, "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as { id?: string; demoCode?: string; destinationHint?: string; error?: string; order?: { id: string; status: string }; checks?: OrderCheck[]; request?: { id: string; status: string }; cashMovement?: CashMovementView; account?: { id: string; totalCash: number; availableCash: number; blockedCash: number }; profile?: { id: string; clientCode: string; accountNumber?: string; kycStatus: string } };
    if (!response.ok) throw new Error(data.error ?? "Unable to update the investor account.");
    return data;
  };
  const completeOnboarding = async (profile: InvestorKyc) => {
    const enterDemo = () => {
      setProfileName(profile.fullName);
      setPhase("app");
    };
    if (!bootstrap) {
      enterDemo();
      notify("Investor demo ready.");
      return;
    }
    try {
      const challenge = await postInvestor({ action: "request_kyc_otp", phone: profile.phone });
      const code = window.prompt(`Verify ${profile.phone} before submitting KYC.${challenge.demoCode ? `\n\nDemo code: ${challenge.demoCode}` : ""}`);
      if (!code || !challenge.id) {
        enterDemo();
        notify("Investor demo ready. Verification was not saved.");
        return;
      }
      await postInvestor({ action: "confirm_otp", verificationId: challenge.id, code });
      const result = await postInvestor({ action: "kyc", ...profile, verificationId: challenge.id, termsVersion: bootstrap?.tenant.legalDocument?.version });
      enterDemo();
      notify(`${result.profile?.clientCode ?? "Client record"} submitted for broker review · account ${result.profile?.accountNumber ?? "pending"}.`);
    } catch {
      enterDemo();
      notify("Investor demo ready. Connect the database to save onboarding.");
    }
  };
  const placeOrder = async (order: InvestorOrderInput): Promise<PlaceResult> => {
    try {
      const submissionReference = crypto.randomUUID();
      const challenge = await postInvestor({ action: "request_order_otp", ...order, submissionReference });
      const challengeData = challenge as unknown as { id?: string; demoCode?: string; destinationHint?: string };
      const code = window.prompt(`Confirm this exact order with the code sent to ${challengeData.destinationHint ?? "your registered mobile"}.${challengeData.demoCode ? `\n\nDemo code: ${challengeData.demoCode}` : ""}`);
      if (!code) return { status: "verification_cancelled" };
      await postInvestor({ action: "confirm_otp", verificationId: challengeData.id, code });
      const result = await postInvestor({ action: "order", ...order, submissionReference, verificationId: challengeData.id });
      const failed = (result.checks ?? []).filter((check) => !check.passed);
      if (result.order?.status === "validation_failed") {
        notify(failed[0] ? `Order held: ${failed[0].message}` : "Order held for review.");
      } else {
        notify(`${result.order?.id ?? "Order"} sent to broker review.`);
      }
      return { status: result.order?.status, checks: result.checks };
    } catch (error) {
      notify(error instanceof Error ? error.message : "Order saved in the offline demo.");
      return { status: "error" };
    }
  };
  const createServiceRequest = async (requestType: "trade_discrepancy" | "account_closure" | "profile_correction", orderId?: string) => {
    const description = requestType === "trade_discrepancy"
      ? `Please review the confirmation and execution details for ${orderId}.`
      : requestType === "account_closure"
        ? "Please review my account for closure and tell me which balances, holdings, or open instructions must be cleared."
        : "Please contact me to review and correct my identity, tax, or contact records.";
    try {
      const result = await postInvestor({ action: "service_request", requestType, orderId, description });
      if (result.request) {
        setBootstrap((current) => current ? { ...current, serviceRequests: [{
          id: result.request!.id,
          requestType,
          status: result.request!.status,
          subject: requestType === "trade_discrepancy" ? `Order discrepancy · ${orderId}` : requestType === "account_closure" ? "Account closure request" : "Profile correction request",
          description,
          orderId,
          submittedAt: new Date().toISOString(),
        }, ...current.serviceRequests] } : current);
      }
      notify("Request sent to your broker for controlled review.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to submit the request.");
    }
  };
  const createCashMovement = async (input: CashMovementInput) => {
    try {
      const result = await postInvestor({ action: "cash_movement", ...input, submissionReference: crypto.randomUUID() });
      if (result.cashMovement) {
        setBootstrap((current) => current ? {
          ...current,
          account: current.account && result.account ? { ...current.account, ...result.account } : current.account,
          cashMovements: [result.cashMovement!, ...current.cashMovements.filter((item) => item.id !== result.cashMovement!.id)],
        } : current);
      }
      notify(input.movementType === "deposit" ? "Deposit sent for independent bank verification." : "Withdrawal reserved and sent for broker approval.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to submit the cash instruction.");
      return false;
    }
  };
  const feePct = bootstrap?.tenant.brokerageFeePct ?? .5;
  const minimumFee = bootstrap?.tenant.minimumFee ?? 25;
  const equityFeeRule = bootstrap?.tenant.feeSchedule?.rules.find((rule) => rule.assetClass === "equity") ?? {
    assetClass: "equity", marketSegment: "main", brokeragePct: feePct, regulatorPct: 0, exchangePct: 0, csdPct: 0, minimumFee, maximumFee: null,
  };
  const allowedOrderTypes = bootstrap?.tenant.allowedOrderTypes ?? ["Market", "Limit", "Stop-loss"];
  const enabledTickers = bootstrap ? bootstrap.instruments.map((instrument) => instrument.ticker) : null;
  const bondsEnabled = bootstrap?.tenant.features.bonds ?? true;
  const roboPlansEnabled = bootstrap?.tenant.features.roboPlans ?? true;
  const theme = { "--investor-accent": bootstrap?.tenant.primaryColor ?? "#0c8189" } as CSSProperties;

  return <main className={styles.investorPage} style={theme}><section className={styles.desktopStory}><AppLogo /><span className={styles.licenseBadge}>Licensed-market demo</span><h1>Own a piece of Ethiopia&apos;s growth</h1><p>{bootstrap?.tenant.welcomeMessage ?? "Buy shares on the Ethiopian Securities Exchange, explore government bonds, or let Frank build a steady plan around your goals."}</p><Button onClick={() => setPhase("app")}>Explore the investor app</Button><div className={styles.desktopTickers}>{featured.map((item) => <span key={item.ticker}><b>{item.ticker}</b><small>{formatEtb(item.price)}</small><Delta value={item.delta} /></span>)}</div><small className={styles.riskCopy}>Prices move. Invest money you won&apos;t need soon. Demo data only.</small></section><section className={styles.appFrame} aria-label="Frank Money investor app"><div className={styles.appViewport}>{phase === "onboarding" ? <Onboarding onDone={(profile) => void completeOnboarding(profile)} legalDocument={bootstrap?.tenant.legalDocument ?? null} /> : stock ? <StockDetail key={stock.ticker} stock={stock} account={bootstrap?.account ?? null} onBack={() => setStock(null)} placeOrder={placeOrder} feeRule={equityFeeRule} allowedOrderTypes={allowedOrderTypes} /> : <><div className={styles.scrollArea}>{tab === "home" ? <HomeScreen openStock={setStock} go={navigate} account={bootstrap?.account ?? null} unread={unreadNotifs} onBell={() => setBellOpen(true)} onCash={() => setCashOpen(true)} /> : tab === "markets" ? <MarketsScreen openStock={setStock} enabledTickers={enabledTickers} bondsEnabled={bondsEnabled} /> : tab === "portfolio" ? <PortfolioScreen openStock={setStock} account={bootstrap?.account ?? null} /> : tab === "learn" ? <LearnScreen showPlanTools={roboPlansEnabled} /> : <ProfileScreen notify={notify} name={profileName} profile={bootstrap?.profile ?? null} orders={bootstrap?.account?.orders ?? []} requests={bootstrap?.serviceRequests ?? []} legalDocument={bootstrap?.tenant.legalDocument ?? null} onRequest={(requestType, orderId) => void createServiceRequest(requestType, orderId)} />}</div><BottomNav active={tab} onChange={navigate} /></>}{cashOpen && <CashSheet pools={bootstrap?.cashPools ?? []} movements={bootstrap?.cashMovements ?? []} availableCash={bootstrap?.account?.availableCash ?? 0} onClose={() => setCashOpen(false)} onSubmit={createCashMovement} />}{bellOpen && <div className={styles.sheetBackdrop} onClick={() => setBellOpen(false)}><section className={styles.notifSheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Notifications"><i className={styles.sheetHandle} /><div className={styles.notifHead}><h2>Notifications</h2>{unreadNotifs > 0 && <button onClick={markAllNotifsRead}>Mark all read</button>}</div><div className={styles.notifList}>{notifications.length === 0 ? <p className={styles.notifEmpty}>Nothing new right now.</p> : notifications.map((item) => <button key={item.id} className={`${styles.notifItem} ${item.read ? "" : styles.notifUnread}`} onClick={() => openNotification(item)}><i className={styles.notifDot} data-sev={item.severity} /><div><b>{item.title}</b><p>{item.body}</p><small>{timeAgo(item.createdAt)}</small></div></button>)}</div></section></div>}{toast && <div className={styles.toast} role="status"><Icon name="check" size={18} /><span><b>{toast}</b><small>Shared tenant workflow updated.</small></span></div>}</div></section></main>;
}
