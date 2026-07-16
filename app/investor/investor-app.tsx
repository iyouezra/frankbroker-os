"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  coachTips,
  formatEtb,
  investorBonds,
  investorHoldings,
  investorStocks,
  type InvestorStock,
} from "../../lib/investor-data";
import styles from "./investor.module.css";

type Tab = "home" | "markets" | "portfolio" | "plan" | "profile";
type IconName = "home" | "markets" | "portfolio" | "plan" | "profile" | "search" | "back" | "bell" | "plus" | "shield" | "bulb" | "chevron" | "check";
type InvestorKyc = {
  accountType: "retail" | "institution";
  fullName: string;
  phone: string;
  faydaId: string;
  tin: string;
  address: string;
  registrationNumber: string;
  representativeName: string;
};
type InvestorOrderInput = { symbol: string; side: "buy" | "sell"; quantity: number; price: number; orderType: string };
type OrderCheck = { code: string; passed: boolean; message: string };
type PlaceResult = { status?: string; checks?: OrderCheck[] };
type InvestorBootstrap = {
  tenant: { name: string; primaryColor: string; welcomeMessage?: string; brokerageFeePct: number; minimumFee: number; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; features: Record<string, boolean> };
  profile: { fullName: string; kycStatus: string } | null;
  account: { id: string; availableCash: number; holdings: Array<{ ticker: string; quantity: number; averageCost: number; price: number }>; orders: Array<{ id: string }> } | null;
  instruments: Array<{ ticker: string; assetClass: string; status: string }>;
};

const INVESTOR_TENANT_ID = "brk_abyssinia";
const INVESTOR_CLIENT_ID = "cli_investor_demo";
const investorHeaders = { "x-frank-tenant-id": INVESTOR_TENANT_ID, "x-frank-client-id": INVESTOR_CLIENT_ID };

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

function ScoreRing({ score = 78 }: { score?: number }) {
  const circumference = 2 * Math.PI * 37;
  return <div className={styles.scoreRing} aria-label={`FrankScore ${score}`}><svg viewBox="0 0 86 86"><circle cx="43" cy="43" r="37" className={styles.scoreTrack} /><circle cx="43" cy="43" r="37" className={styles.scoreValue} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} /></svg><strong>{score}</strong></div>;
}

function StockRow({ stock, onClick }: { stock: InvestorStock; onClick: () => void }) {
  return <button className={styles.stockRow} onClick={onClick}><span className={styles.tickerTile}>{stock.ticker.slice(0, 4)}</span><span className={styles.stockIdentity}><b>{stock.name}</b><small>{stock.ticker} · {stock.sector}</small></span><Sparkline values={stock.series} /><span className={styles.stockPrice}><b>{formatEtb(stock.price)}</b><Delta value={stock.delta} /></span></button>;
}

function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className={styles.screenHeader}>{onBack && <button className={styles.iconButton} onClick={onBack} aria-label="Go back"><Icon name="back" size={20} /></button>}<h1>{title}</h1>{right}</header>;
}

function BottomNav({ active, showPlan, onChange }: { active: Tab; showPlan: boolean; onChange: (tab: Tab) => void }) {
  const items = ([
    { id: "home", label: "Home", icon: "home" },
    { id: "markets", label: "Markets", icon: "markets" },
    { id: "portfolio", label: "Portfolio", icon: "portfolio" },
    { id: "plan", label: "Plan", icon: "plan" },
    { id: "profile", label: "You", icon: "profile" },
  ] satisfies Array<{ id: Tab; label: string; icon: IconName }>).filter((item) => showPlan || item.id !== "plan");
  return <nav className={styles.bottomNav} aria-label="Investor navigation">{items.map((item) => <button key={item.id} className={active === item.id ? styles.navActive : ""} onClick={() => onChange(item.id)}><Icon name={item.icon} size={22} /><span>{item.label}</span></button>)}</nav>;
}

function ProgressDots({ step }: { step: number }) {
  return <div className={styles.progressDots} aria-label={`Onboarding step ${Math.min(step, 3) + 1} of 4`}>{[0, 1, 2, 3].map((dot) => <i key={dot} className={dot === Math.min(step, 3) ? styles.currentDot : ""} />)}</div>;
}

const retailDemo: InvestorKyc = { accountType: "retail", fullName: "Selam Mekonnen", phone: "0911000041", faydaId: "123456789012", tin: "0012814908", address: "Bole, Addis Ababa", registrationNumber: "", representativeName: "" };
const institutionDemo: InvestorKyc = { accountType: "institution", fullName: "Blue Nile Trading PLC", phone: "0115500017", faydaId: "234567890123", tin: "0067047925", address: "Kirkos, Addis Ababa", registrationNumber: "AA/2/12345/2018", representativeName: "Meron Bekele" };

function KycProgress({ step }: { step: number }) {
  return <div className={styles.kycProgress}><span><b>ACCOUNT SETUP</b><small>{step + 1} of 4</small></span><i><em style={{ width: `${((step + 1) / 4) * 100}%` }} /></i></div>;
}

function KycField({ label, value, onChange, hint, placeholder, inputMode = "text", maxLength }: { label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string; inputMode?: "text" | "numeric" | "tel"; maxLength?: number }) {
  return <label className={styles.kycField}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} autoComplete="off" />{hint && <small>{hint}</small>}</label>;
}

function KycOnboarding({ onComplete }: { onComplete: (profile: InvestorKyc) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<InvestorKyc>(retailDemo);
  const [consent, setConsent] = useState(false);
  const update = (field: keyof InvestorKyc, value: string) => setProfile((current) => ({ ...current, [field]: value }));
  const chooseType = (accountType: InvestorKyc["accountType"]) => setProfile(accountType === "retail" ? retailDemo : institutionDemo);
  const phoneValid = profile.phone.replace(/\D/g, "").length >= 9;
  const faydaValid = /^\d{12}$/.test(profile.faydaId);
  const tinValid = /^\d{10}(?:-\d{2})?$/.test(profile.tin);
  const firstStepValid = profile.fullName.trim().length >= 3 && phoneValid;
  const identityStepValid = faydaValid && tinValid && profile.address.trim().length >= 4 && (profile.accountType === "retail" || (profile.registrationNumber.trim().length >= 4 && profile.representativeName.trim().length >= 3));
  const masked = (value: string) => value.length <= 4 ? value : `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}`;

  if (step === 3) return <div className={styles.onboarding}><KycProgress step={3} /><div className={styles.kycComplete}><span><Icon name="check" size={24} /></span><small>DEMO CHECK COMPLETE</small><h1>Your details are ready</h1><p>We checked the ID formats and captured your consent. Live Fayda and tax verification will be connected before real accounts are opened.</p><Card className={styles.kycStatusCard}><div><i><Icon name="check" size={14} /></i><span><b>Fayda ID format</b><small>12-digit FIN captured</small></span></div><div><i><Icon name="check" size={14} /></i><span><b>Tax information</b><small>TIN captured for review</small></span></div><div><i><Icon name="check" size={14} /></i><span><b>Account type</b><small>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</small></span></div></Card></div><Button className={styles.full} onClick={() => onComplete(profile)}>Build my investment plan</Button></div>;

  if (step === 2) return <div className={styles.onboarding}><KycProgress step={2} /><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(1)} aria-label="Go back"><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>Check your details</h1><p>Make sure your name matches your official records.</p></div><Card className={styles.kycReview}><dl><div><dt>Account</dt><dd>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</dd></div><div><dt>Legal name</dt><dd>{profile.fullName}</dd></div>{profile.accountType === "institution" && <><div><dt>Representative</dt><dd>{profile.representativeName}</dd></div><div><dt>Registration</dt><dd>{profile.registrationNumber}</dd></div></>}<div><dt>Fayda ID</dt><dd>{masked(profile.faydaId)}</dd></div><div><dt>TIN</dt><dd>{masked(profile.tin)}</dd></div><div><dt>Phone</dt><dd>{profile.phone}</dd></div><div><dt>Address</dt><dd>{profile.address}</dd></div></dl></Card><label className={styles.consentRow}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i>{consent && <Icon name="check" size={13} />}</i><span>I confirm these demo details are accurate and consent to identity and tax verification for account opening.</span></label><Button className={styles.full} disabled={!consent} onClick={() => setStep(3)}>Submit for verification</Button></div>;

  if (step === 1) return <div className={styles.onboarding}><KycProgress step={1} /><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(0)} aria-label="Go back"><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>{profile.accountType === "retail" ? "Confirm your identity" : "Tell us about the institution"}</h1><p>{profile.accountType === "retail" ? "Use the details linked to your Fayda ID." : "We also need the authorized representative’s identity."}</p></div><div className={styles.kycForm}><KycField label={profile.accountType === "retail" ? "Fayda ID number (FIN)" : "Representative’s Fayda ID (FIN)"} value={profile.faydaId} onChange={(value) => update("faydaId", value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" maxLength={12} placeholder="12 digits" hint={profile.faydaId && !faydaValid ? "Fayda FIN must contain 12 digits." : "We’ll use this for identity verification."} /><KycField label="Taxpayer Identification Number (TIN)" value={profile.tin} onChange={(value) => update("tin", value.replace(/[^0-9-]/g, "").slice(0, 13))} inputMode="numeric" placeholder="0012814908" hint={profile.tin && !tinValid ? "Enter a 10-digit TIN or a TIN with its two-digit subTIN." : "Used for tax reporting and account records."} />{profile.accountType === "institution" && <><KycField label="Business registration number" value={profile.registrationNumber} onChange={(value) => update("registrationNumber", value)} placeholder="Registration or license number" /><KycField label="Authorized representative" value={profile.representativeName} onChange={(value) => update("representativeName", value)} placeholder="Full legal name" /></>}<KycField label={profile.accountType === "retail" ? "Current address" : "Registered address"} value={profile.address} onChange={(value) => update("address", value)} placeholder="City and sub-city" /></div><div className={styles.demoNotice}><b>Demo only</b><span>Use fictional details. The server discards raw Fayda and TIN values and retains only masked references.</span></div><Button className={styles.full} disabled={!identityStepValid} onClick={() => setStep(2)}>Review details</Button></div>;

  return <div className={styles.onboarding}><KycProgress step={0} /><div className={styles.kycBrand}><AppLogo /></div><div className={styles.onboardingCopy}><h1>Open your investment account</h1><p>First, tell us who will own this account. It takes a few minutes.</p></div><div className={styles.accountTypeGrid}><button className={profile.accountType === "retail" ? styles.accountTypeSelected : ""} onClick={() => chooseType("retail")}><i>{profile.accountType === "retail" && <Icon name="check" size={13} />}</i><b>Retail investor</b><small>An account for you</small></button><button className={profile.accountType === "institution" ? styles.accountTypeSelected : ""} onClick={() => chooseType("institution")}><i>{profile.accountType === "institution" && <Icon name="check" size={13} />}</i><b>Institution</b><small>A company or organization</small></button></div><div className={styles.kycForm}><KycField label={profile.accountType === "retail" ? "Full legal name" : "Legal organization name"} value={profile.fullName} onChange={(value) => update("fullName", value)} placeholder="As shown on official records" /><KycField label="Mobile number" value={profile.phone} onChange={(value) => update("phone", value.replace(/[^0-9+]/g, ""))} inputMode="tel" placeholder="09… or +251…" hint="We’ll use this for account updates and security." /></div><div className={styles.demoNotice}><b>Demo only</b><span>These fictional details can be persisted to the shared demo database when connected.</span></div><Button className={styles.full} disabled={!firstStepValid} onClick={() => setStep(1)}>Continue</Button></div>;
}

function Onboarding({ onDone }: { onDone: (profile: InvestorKyc) => void }) {
  const [kycProfile, setKycProfile] = useState<InvestorKyc | null>(null);
  return kycProfile ? <InvestmentOnboarding onDone={() => onDone(kycProfile)} /> : <KycOnboarding onComplete={setKycProfile} />;
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
      ? [["short", "Within 3 years", "Soon — we’ll keep it mostly in bonds."], ["mid", "3 to 10 years", "Time to ride out some bumps."], ["long", "10 years or more", "Plenty of time for stocks to work."]]
      : [["sell", "Sell before it drops more", "Losses keep you up at night."], ["wait", "Wait it out", "Prices move; the plan has not changed."], ["buy", "Buy more while it’s cheaper", "A dip can be an opportunity."]];
  const selection = step === 1 ? goal : step === 2 ? horizon : reaction;
  const choose = (value: string) => step === 1 ? setGoal(value) : step === 2 ? setHorizon(value) : setReaction(value);

  if (step === 0) return <div className={styles.onboarding}><button className={styles.skip} onClick={onDone}>Skip for now</button><div className={styles.onboardingIntro}><Image src="/frankscore-icon.png" alt="Frank" width={74} height={104} priority /><h1>Let&apos;s build<br />your plan</h1><p>Three honest questions. No jargon. You&apos;ll get a mix of ESX stocks and government bonds that fits your life.</p></div><Button className={styles.full} onClick={() => setStep(1)}>Start</Button><ProgressDots step={0} /></div>;

  if (step === 4) return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(3)} aria-label="Go back"><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>Skip for now</button></div><div className={styles.onboardingCopy}><h1>Your plan: {plan}</h1><p>{plan === "Steady" ? "Bonds carry most of the weight and pay steady interest." : plan === "Growth" ? "A longer horizon gives stocks more room to work, with bonds as a cushion." : "Half stocks for growth, half bonds for calm."}</p></div><Card className={styles.planResult}><div className={styles.planResultTop}><ScoreRing score={plan === "Steady" ? 82 : plan === "Balanced" ? 74 : 66} /><span><b>{plan} plan</b><small>{mix[0]}% bonds · {mix[1]}% stocks</small><em>Starting FrankScore estimate</em></span></div><AllocationBar bonds={mix[0]} stocks={mix[1]} light /></Card><p className={styles.planNote}>We rebalance it automatically and tell you plainly when something changes. You can switch plans or pick stocks yourself anytime.</p><Button className={styles.full} onClick={onDone}>Start with this plan</Button><button className={styles.textButton} onClick={onDone}>I&apos;ll pick stocks myself instead</button><ProgressDots step={3} /></div>;

  const heading = step === 1 ? "What is this money for?" : step === 2 ? "When will you need it?" : "One month in, ETB 10,000 shows ETB 8,500. What do you do?";
  const subheading = step === 1 ? "Your goal decides how much risk makes sense." : step === 2 ? "Time is the biggest safety net an investor has." : "There’s no wrong answer — just an honest one.";
  return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(step - 1)} aria-label="Go back"><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>Skip for now</button></div><div className={styles.onboardingCopy}><h1>{heading}</h1><p>{subheading}</p></div><div className={styles.choiceList}>{choices.map(([value, label, description]) => <button key={value} className={`${styles.choiceCard} ${selection === value ? styles.choiceSelected : ""}`} onClick={() => choose(value)}><i>{selection === value && <Icon name="check" size={13} />}</i><span><b>{label}</b><small>{description}</small></span></button>)}</div><Button className={styles.full} disabled={!selection} onClick={() => setStep(step === 3 ? 4 : step + 1)}>Continue</Button><ProgressDots step={step} /></div>;
}

function AllocationBar({ bonds, stocks, light = false }: { bonds: number; stocks: number; light?: boolean }) {
  return <div className={`${styles.allocationBar} ${light ? styles.allocationLight : ""}`}><i style={{ width: `${bonds}%` }} /><i style={{ width: `${stocks}%` }} /></div>;
}

function AppLogo() {
  return <div className={styles.appLogo}><Image src="/frankscore-icon.png" alt="" width={29} height={41} /><b>Frank</b></div>;
}

function HomeScreen({ openStock, go, account }: { openStock: (stock: InvestorStock) => void; go: (tab: Tab) => void; account: InvestorBootstrap["account"] }) {
  const [tip, setTip] = useState(0);
  const holdings = account?.holdings.length ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker)) : investorHoldings;
  const stockValue = holdings.reduce((sum, holding) => sum + investorStocks.find((stock) => stock.ticker === holding.ticker)!.price * holding.quantity, 0);
  const totalValue = stockValue + 25_000 + (account?.availableCash ?? 4_210);
  return <div className={styles.screen}><div className={styles.homeHeader}><AppLogo /><button className={styles.iconButton} aria-label="Notifications"><Icon name="bell" size={20} /><i /></button></div><Card className={styles.heroCard}><small>Your money, all together</small><strong>{formatEtb(totalValue)}</strong><div><Delta value={1.8} pill /><span>ESX open · closes 15:30</span></div></Card><div className={styles.quickActions}><Button onClick={() => go("markets")}><Icon name="plus" size={18} /> Invest</Button><Button variant="secondary">Add money</Button></div><Card><div className={styles.cardHeader}><h2>Companies you own</h2><button onClick={() => go("portfolio")}>Details</button></div>{holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; return <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />; })}</Card><Card className={styles.coachCard}><span><Icon name="bulb" size={20} /></span><div><small>FRANK COACH</small><h3>{coachTips[tip].title}</h3><p>{coachTips[tip].body}</p><button onClick={() => setTip((tip + 1) % coachTips.length)}>Next tip <em>{tip + 1}/{coachTips.length}</em></button></div></Card><Card><div className={styles.cardHeader}><h2>Your plan</h2><span className={styles.badge}>Steady</span></div><div className={styles.planPreview}><ScoreRing /><div><b>FrankScore 78 — healthy</b><p>70% bonds, 30% stocks. Built for sleeping well.</p><button onClick={() => go("plan")}>Review plan</button></div></div></Card></div>;
}

function MarketsScreen({ openStock, enabledTickers, bondsEnabled }: { openStock: (stock: InvestorStock) => void; enabledTickers: string[] | null; bondsEnabled: boolean }) {
  const [asset, setAsset] = useState<"Stocks" | "Bonds">("Stocks");
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const stocks = investorStocks.filter((stock) => (!enabledTickers || enabledTickers.includes(stock.ticker)) && (sector === "All" || stock.sector === sector) && `${stock.ticker} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.screen}><ScreenHeader title="Markets" /><label className={styles.searchField}><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies or tickers" /></label><div className={styles.segmented}>{(["Stocks", "Bonds"] as const).filter((item) => item === "Stocks" || bondsEnabled).map((item) => <button key={item} className={asset === item ? styles.segmentActive : ""} onClick={() => setAsset(item)}>{item}</button>)}</div>{asset === "Stocks" || !bondsEnabled ? <><div className={styles.chips}>{["All", "Banks", "Telecom"].map((item) => <button key={item} className={sector === item ? styles.chipActive : ""} onClick={() => setSector(item)}>{item}</button>)}</div><Card><p className={styles.cardIntro}>Companies enabled by your broker</p>{stocks.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}{stocks.length === 0 && <p className={styles.empty}>No enabled instruments match this search.</p>}</Card></> : <Card><p className={styles.cardIntro}>Bonds — you lend, they pay you back with interest.</p>{investorBonds.filter((bond) => !enabledTickers || enabledTickers.includes(bond.ticker)).map((bond) => <button className={styles.bondRow} key={bond.ticker}><span><Icon name="shield" size={20} /></span><span><b>{bond.name}</b><small>{bond.maturity} · from {bond.minimum}</small></span><span><b>{bond.rate}</b><small>per year</small></span></button>)}</Card>}</div>;
}

function PortfolioScreen({ openStock, account }: { openStock: (stock: InvestorStock) => void; account: InvestorBootstrap["account"] }) {
  const holdings = account?.holdings.length ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker)) : investorHoldings;
  const rows = holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; const value = stock.price * holding.quantity; const cost = holding.averageCost * holding.quantity; return { holding, stock, value, cost, gain: value - cost }; });
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const cash = account?.availableCash ?? 4_210;
  const total = stockValue + 25_000 + cash;
  return <div className={styles.screen}><ScreenHeader title="Portfolio" /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(total)}</strong><div className={styles.summaryGrid}><span><small>Cost basis (stocks)</small><b>{formatEtb(cost)}</b></span><span><small>Unrealized gain</small><b className={styles.gain}>+{formatEtb(stockValue - cost).replace("ETB ", "")}</b></span><span><small>Dividends this year</small><b>ETB 1,440.00</b></span><span><small>Today</small><Delta value={1.8} /></span></div></Card><Card><div className={styles.cardHeader}><h2>Performance</h2><span className={`${styles.badge} ${styles.gainBadge}`}>+18.5% all time</span></div><Sparkline values={[92, 95, 94, 98, 97, 101, 100, 104, 103, 107, 106, 110]} large /><div className={styles.chartDates}><span>Mar 2026</span><span>Today</span></div></Card><Card><div className={styles.cardHeader}><h2>What you own</h2></div><AllocationBar bonds={Math.round((25_000 / total) * 100)} stocks={Math.round((stockValue / total) * 100)} /><div className={styles.legend}><span><i />Stocks {Math.round((stockValue / total) * 100)}%</span><span><i />Bonds {Math.round((25_000 / total) * 100)}%</span><span><i />Cash {Math.round((cash / total) * 100)}%</span></div>{rows.map((row) => <button className={styles.holdingRow} key={row.stock.ticker} onClick={() => openStock(row.stock)}><span className={styles.tickerTile}>{row.stock.ticker.slice(0, 4)}</span><span><b>{row.stock.name}</b><small>{row.holding.quantity} sh · avg {formatEtb(row.holding.averageCost)}</small></span><span><b>{formatEtb(row.value)}</b><small className={row.gain >= 0 ? styles.gain : styles.loss}>{row.gain >= 0 ? "+" : "−"}{formatEtb(Math.abs(row.gain)).replace("ETB ", "")}</small></span></button>)}<div className={styles.holdingRow}><span className={styles.tickerTile}><Icon name="shield" size={19} /></span><span><b>GoE Treasury Bonds</b><small>14.5–16.0% per year · held to maturity</small></span><span><b>ETB 25,000.00</b></span></div></Card><p className={styles.disclaimer}>Unrealized gains are on paper until you sell. Estimates use the last traded ESX price.</p></div>;
}

function PlanScreen() {
  const [plan, setPlan] = useState<"steady" | "balanced" | "growth">("steady");
  const [autoInvest, setAutoInvest] = useState(true);
  const mix = plan === "steady" ? [70, 30] : plan === "balanced" ? [50, 50] : [30, 70];
  return <div className={styles.screen}><ScreenHeader title="Your plan" /><Card className={styles.planHero}><ScoreRing /><div><h2>FrankScore 78</h2><p>Healthy. Diversified and on track for your goal.</p></div></Card><Card><div className={styles.cardHeader}><h2>Mix</h2></div><AllocationBar bonds={mix[0]} stocks={mix[1]} /><div className={styles.legend}><span><i />Bonds {mix[0]}%</span><span><i />Stocks {mix[1]}%</span></div></Card><Card className={styles.planChoices}>{([ ["steady", "Steady", "70% bonds, 30% stocks. Built for sleeping well."], ["balanced", "Balanced", "Half and half. Some movement, some calm."], ["growth", "Growth", "70% stocks. Bigger swings, bigger potential."] ] as const).map(([value, label, description]) => <label key={value}><input type="radio" name="plan" checked={plan === value} onChange={() => setPlan(value)} /><i /><span><b>{label}</b><small>{description}</small></span></label>)}</Card><Card><div className={styles.cardHeader}><h2>Your goal</h2><span className={styles.badge}>2036</span></div><Sparkline values={[78, 82, 89, 101, 117, 140]} large /><div className={styles.goalValue}><span>On track for</span><b>ETB 1,240,000</b></div><p className={styles.cardIntro}>If you keep investing ETB 2,000 monthly. A rough estimate, not a promise — markets move.</p></Card><Card><label className={styles.switchRow}><span><b>Auto-invest ETB 2,000 monthly</b><small>We buy your mix on the 1st. Change or pause anytime.</small></span><input type="checkbox" checked={autoInvest} onChange={(event) => setAutoInvest(event.target.checked)} /><i /></label></Card><Button className={styles.full}>Keep this plan</Button></div>;
}

function ProfileScreen({ notify, name }: { notify: (message: string) => void; name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM";
  return <div className={styles.screen}><ScreenHeader title="You" /><Card className={styles.profileCard}><span>{initials}</span><div><b>{name}</b><small>Investor account · Demo profile</small></div><em>Demo checked</em></Card><Card className={styles.menuCard}>{["Identity & tax details", "Add money", "Withdraw", "Statements & tax", "Price alerts", "Security", "Help in Amharic"].map((item) => <button key={item} onClick={() => notify(`${item} is ready for the next demo phase.`)}><span>{item}</span><Icon name="chevron" size={18} /></button>)}</Card><p className={styles.license}>Frank Money is licensed by the Ethiopian Capital Market Authority.<br />Member of the Ethiopian Securities Exchange.</p></div>;
}

function OrderSheet({ stock, side, holdingQuantity, feePct, minimumFee, allowedOrderTypes, onClose, onPlaced }: { stock: InvestorStock; side: "Buy" | "Sell"; holdingQuantity: number; feePct: number; minimumFee: number; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop-loss">("Market");
  const [mode, setMode] = useState<"birr" | "shares">("birr");
  const [amount, setAmount] = useState("2000");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState(String(Math.round(stock.price * .98)));
  const [reviewing, setReviewing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [heldChecks, setHeldChecks] = useState<OrderCheck[]>([]);
  const isSell = side === "Sell";
  const executionPrice = orderType === "Limit" ? Number(limitPrice) || stock.price : stock.price;
  const shares = mode === "birr" && !isSell && orderType === "Market" ? (Number(amount) || 0) / executionPrice : Number(quantity) || 0;
  const gross = mode === "birr" && !isSell && orderType === "Market" ? Number(amount) || 0 : shares * executionPrice;
  const fee = Math.max(minimumFee, gross * feePct / 100);
  const candidateOptions: Array<"Market" | "Limit" | "Stop-loss"> = isSell ? ["Market", "Limit", "Stop-loss"] : ["Market", "Limit"];
  const options = candidateOptions.filter((option) => allowedOrderTypes.includes(option));
  const place = async () => {
    setPlacing(true);
    setHeldChecks([]);
    try {
      const result = await onPlaced({ symbol: stock.ticker, side: isSell ? "sell" : "buy", quantity: shares, price: executionPrice, orderType });
      const failed = (result?.checks ?? []).filter((check) => !check.passed);
      if (failed.length) { setHeldChecks(failed); setReviewing(false); }
    }
    finally { setPlacing(false); }
  };
  return <><div className={styles.sheetBackdrop} onClick={onClose}><section className={styles.orderSheet} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="order-title"><i className={styles.sheetHandle} /><h2 id="order-title">{side} {stock.ticker}</h2><div className={styles.chips}>{options.map((option) => <button key={option} className={orderType === option ? styles.chipActive : ""} onClick={() => setOrderType(option)}>{option}</button>)}</div><p className={styles.orderHint}>{orderType === "Market" ? "Trades at the best available ESX price." : orderType === "Limit" ? `${side}s only at your selected price or better.` : "Sells at the next available price after your trigger is reached."}</p>{!isSell && orderType === "Market" && <div className={styles.segmented}><button className={mode === "birr" ? styles.segmentActive : ""} onClick={() => setMode("birr")}>In birr</button><button className={mode === "shares" ? styles.segmentActive : ""} onClick={() => setMode("shares")}>In shares</button></div>}{orderType === "Limit" && <label className={styles.formField}><span>{isSell ? "Sell at or above" : "Buy at or below"}</span><div><em>ETB</em><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>}{mode === "birr" && !isSell && orderType === "Market" ? <label className={styles.formField}><span>Amount</span><div><em>ETB</em><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} /></div><small>≈ {shares.toFixed(3)} shares — own a slice, no matter the share price</small></label> : <label className={styles.formField}><span>Shares</span><div><input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ""))} /><em>× {formatEtb(executionPrice)}</em></div>{isSell && <small>You hold {holdingQuantity} shares</small>}</label>}<dl className={styles.orderTotals}><div><dt>{isSell ? "Estimated proceeds" : "Estimated cost"}</dt><dd>{formatEtb(gross)}</dd></div><div><dt>Fee ({feePct.toFixed(2)}%)</dt><dd>{formatEtb(fee)}</dd></div></dl>{heldChecks.length > 0 && <div role="alert" style={{ margin: "0 0 14px", padding: "12px 14px", borderRadius: 14, background: "#FBE9E9", border: "1px solid #F1C9C9", color: "#B4322E", fontSize: 13, lineHeight: 1.5 }}><b style={{ display: "block", marginBottom: 4 }}>Order held — {heldChecks.length === 1 ? "1 check needs attention" : `${heldChecks.length} checks need attention`}</b><ul style={{ margin: 0, paddingLeft: 18 }}>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}<Button className={styles.full} variant={isSell ? "danger" : "primary"} disabled={gross <= 0 || options.length === 0 || (isSell && shares > holdingQuantity)} onClick={() => setReviewing(true)}>Review order</Button></section></div>{reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm order</h2><p>You&apos;re {isSell ? "selling" : "buying"} <b>{shares.toFixed(mode === "birr" ? 3 : 0)} shares of {stock.ticker}</b> for about <b>{formatEtb(gross)}</b>. Fee: {formatEtb(fee)}.</p><div><Button variant="secondary" onClick={() => setReviewing(false)}>Cancel</Button><Button variant={isSell ? "danger" : "primary"} disabled={placing} onClick={() => void place()}>{placing ? "Sending…" : side}</Button></div></section></div>}</>;
}

function StockDetail({ stock, account, onBack, placeOrder, feePct, minimumFee, allowedOrderTypes }: { stock: InvestorStock; account: InvestorBootstrap["account"]; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feePct: number; minimumFee: number; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const [side, setSide] = useState<"Buy" | "Sell" | null>(null);
  const holding = account?.holdings.find((item) => item.ticker === stock.ticker) ?? investorHoldings.find((item) => item.ticker === stock.ticker);
  return <div className={styles.detailScreen}><ScreenHeader title={stock.ticker} onBack={onBack} right={<span className={styles.badge}>{stock.sector}</span>} /><div className={styles.detailBody}><p className={styles.companyName}>{stock.name}</p><div className={styles.quote}><strong>{formatEtb(stock.price)}</strong><Delta value={stock.delta} pill /></div><Sparkline values={stock.series} large /><div className={styles.rangeTabs}>{["1W", "1M", "3M", "1Y", "All"].map((range, index) => <button key={range} className={index === 1 ? styles.rangeActive : ""}>{range}</button>)}</div><Card className={styles.marketStats}>{[["Open", formatEtb(stock.series[0])], ["Day range", `${formatEtb(Math.min(...stock.series))} – ${formatEtb(Math.max(...stock.series))}`], ["Volume", "24,180 shares"], ["Listed", "ESX Main Market"]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</Card>{holding && <Card className={styles.positionCard}><small>YOUR POSITION</small><div>{[["Shares", `${holding.quantity} sh`], ["Avg cost", formatEtb(holding.averageCost)], ["Value", formatEtb(holding.quantity * stock.price)], ["Unrealized", `${holding.quantity * (stock.price - holding.averageCost) >= 0 ? "+" : "−"}${formatEtb(Math.abs(holding.quantity * (stock.price - holding.averageCost))).replace("ETB ", "")}`]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></Card>}<Card><div className={styles.cardHeader}><h2>Company insights</h2></div><div className={styles.insights}>{[["Dividend yield", stock.dividendYield], ["P/E", stock.pe], ["YTD", `${stock.ytd >= 0 ? "+" : ""}${stock.ytd}%`], ["Revenue", stock.revenueGrowth], ["Next dividend", stock.nextDividend], ["Sector", stock.sector]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className={styles.frankTake}><small>FRANK&apos;S TAKE</small><p>{stock.frankTake}</p></div></Card><Card><div className={styles.cardHeader}><h2>About</h2></div><p className={styles.about}>{stock.about}</p></Card><p className={styles.disclaimer}>Prices move. Invest money you won&apos;t need soon.</p></div><div className={styles.tradeBar}><Button onClick={() => setSide("Buy")}>Buy</Button><Button variant="secondary" disabled={!holding} onClick={() => setSide("Sell")}>Sell</Button></div>{side && <OrderSheet stock={stock} side={side} holdingQuantity={holding?.quantity ?? 0} feePct={feePct} minimumFee={minimumFee} allowedOrderTypes={allowedOrderTypes} onClose={() => setSide(null)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status !== "validation_failed") setSide(null); return result; }} />}</div>;
}

export default function InvestorApp() {
  const [phase, setPhase] = useState<"onboarding" | "app">("onboarding");
  const [tab, setTab] = useState<Tab>("home");
  const [stock, setStock] = useState<InvestorStock | null>(null);
  const [toast, setToast] = useState("");
  const [profileName, setProfileName] = useState("Selam Mekonnen");
  const [bootstrap, setBootstrap] = useState<InvestorBootstrap | null>(null);
  const featured = useMemo(() => investorStocks.slice(0, 3), []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const navigate = (next: Tab) => { setTab(next); setStock(null); };
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
    const data = await response.json().catch(() => ({})) as { error?: string; order?: { id: string; status: string }; checks?: OrderCheck[] };
    if (!response.ok) throw new Error(data.error ?? "Unable to update the investor account.");
    return data;
  };
  const completeOnboarding = async (profile: InvestorKyc) => {
    setProfileName(profile.fullName); setPhase("app");
    try { await postInvestor({ action: "kyc", ...profile }); notify("Identity profile linked to your broker account."); }
    catch { notify("KYC completed in the offline demo; connect the database to persist it."); }
  };
  const placeOrder = async (order: InvestorOrderInput): Promise<PlaceResult> => {
    try {
      const result = await postInvestor({ action: "order", ...order, submissionReference: crypto.randomUUID() });
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
  const feePct = bootstrap?.tenant.brokerageFeePct ?? .5;
  const minimumFee = bootstrap?.tenant.minimumFee ?? 25;
  const allowedOrderTypes = bootstrap?.tenant.allowedOrderTypes ?? ["Market", "Limit", "Stop-loss"];
  const enabledTickers = bootstrap ? bootstrap.instruments.map((instrument) => instrument.ticker) : null;
  const bondsEnabled = bootstrap?.tenant.features.bonds ?? true;
  const roboPlansEnabled = bootstrap?.tenant.features.roboPlans ?? true;
  const theme = { "--investor-accent": bootstrap?.tenant.primaryColor ?? "#0c8189" } as CSSProperties;

  return <main className={styles.investorPage} style={theme}><section className={styles.desktopStory}><AppLogo /><span className={styles.licenseBadge}>Licensed-market demo</span><h1>Own a piece of Ethiopia&apos;s growth</h1><p>{bootstrap?.tenant.welcomeMessage ?? "Buy shares on the Ethiopian Securities Exchange, explore government bonds, or let Frank build a steady plan around your goals."}</p><Button onClick={() => setPhase("app")}>Explore the investor app</Button><div className={styles.desktopTickers}>{featured.map((item) => <span key={item.ticker}><b>{item.ticker}</b><small>{formatEtb(item.price)}</small><Delta value={item.delta} /></span>)}</div><small className={styles.riskCopy}>Prices move. Invest money you won&apos;t need soon. Demo data only.</small></section><section className={styles.appFrame} aria-label="Frank Money investor app"><div className={styles.appViewport}>{phase === "onboarding" ? <Onboarding onDone={(profile) => void completeOnboarding(profile)} /> : stock ? <StockDetail key={stock.ticker} stock={stock} account={bootstrap?.account ?? null} onBack={() => setStock(null)} placeOrder={placeOrder} feePct={feePct} minimumFee={minimumFee} allowedOrderTypes={allowedOrderTypes} /> : <><div className={styles.scrollArea}>{tab === "home" ? <HomeScreen openStock={setStock} go={navigate} account={bootstrap?.account ?? null} /> : tab === "markets" ? <MarketsScreen openStock={setStock} enabledTickers={enabledTickers} bondsEnabled={bondsEnabled} /> : tab === "portfolio" ? <PortfolioScreen openStock={setStock} account={bootstrap?.account ?? null} /> : tab === "plan" && roboPlansEnabled ? <PlanScreen /> : <ProfileScreen notify={notify} name={profileName} />}</div><BottomNav active={tab} showPlan={roboPlansEnabled} onChange={navigate} /></>}{toast && <div className={styles.toast} role="status"><Icon name="check" size={18} /><span><b>{toast}</b><small>Shared tenant workflow updated.</small></span></div>}</div></section></main>;
}
