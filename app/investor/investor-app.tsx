"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
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

function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: "home", label: "Home", icon: "home" },
    { id: "markets", label: "Markets", icon: "markets" },
    { id: "portfolio", label: "Portfolio", icon: "portfolio" },
    { id: "plan", label: "Plan", icon: "plan" },
    { id: "profile", label: "You", icon: "profile" },
  ];
  return <nav className={styles.bottomNav} aria-label="Investor navigation">{items.map((item) => <button key={item.id} className={active === item.id ? styles.navActive : ""} onClick={() => onChange(item.id)}><Icon name={item.icon} size={22} /><span>{item.label}</span></button>)}</nav>;
}

function ProgressDots({ step }: { step: number }) {
  return <div className={styles.progressDots} aria-label={`Onboarding step ${Math.min(step, 3) + 1} of 4`}>{[0, 1, 2, 3].map((dot) => <i key={dot} className={dot === Math.min(step, 3) ? styles.currentDot : ""} />)}</div>;
}

function Onboarding({ onDone }: { onDone: () => void }) {
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

function HomeScreen({ openStock, go }: { openStock: (stock: InvestorStock) => void; go: (tab: Tab) => void }) {
  const [tip, setTip] = useState(0);
  const stockValue = investorHoldings.reduce((sum, holding) => sum + investorStocks.find((stock) => stock.ticker === holding.ticker)!.price * holding.quantity, 0);
  const totalValue = stockValue + 25_000 + 4_210;
  return <div className={styles.screen}><div className={styles.homeHeader}><AppLogo /><button className={styles.iconButton} aria-label="Notifications"><Icon name="bell" size={20} /><i /></button></div><Card className={styles.heroCard}><small>Your money, all together</small><strong>{formatEtb(totalValue)}</strong><div><Delta value={1.8} pill /><span>ESX open · closes 15:30</span></div></Card><div className={styles.quickActions}><Button onClick={() => go("markets")}><Icon name="plus" size={18} /> Invest</Button><Button variant="secondary">Add money</Button></div><Card><div className={styles.cardHeader}><h2>Companies you own</h2><button onClick={() => go("portfolio")}>Details</button></div>{investorHoldings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; return <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />; })}</Card><Card className={styles.coachCard}><span><Icon name="bulb" size={20} /></span><div><small>FRANK COACH</small><h3>{coachTips[tip].title}</h3><p>{coachTips[tip].body}</p><button onClick={() => setTip((tip + 1) % coachTips.length)}>Next tip <em>{tip + 1}/{coachTips.length}</em></button></div></Card><Card><div className={styles.cardHeader}><h2>Your plan</h2><span className={styles.badge}>Steady</span></div><div className={styles.planPreview}><ScoreRing /><div><b>FrankScore 78 — healthy</b><p>70% bonds, 30% stocks. Built for sleeping well.</p><button onClick={() => go("plan")}>Review plan</button></div></div></Card></div>;
}

function MarketsScreen({ openStock }: { openStock: (stock: InvestorStock) => void }) {
  const [asset, setAsset] = useState<"Stocks" | "Bonds">("Stocks");
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const stocks = investorStocks.filter((stock) => (sector === "All" || stock.sector === sector) && `${stock.ticker} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.screen}><ScreenHeader title="Markets" /><label className={styles.searchField}><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies or tickers" /></label><div className={styles.segmented}>{(["Stocks", "Bonds"] as const).map((item) => <button key={item} className={asset === item ? styles.segmentActive : ""} onClick={() => setAsset(item)}>{item}</button>)}</div>{asset === "Stocks" ? <><div className={styles.chips}>{["All", "Banks", "Telecom"].map((item) => <button key={item} className={sector === item ? styles.chipActive : ""} onClick={() => setSector(item)}>{item}</button>)}</div><Card><p className={styles.cardIntro}>All five companies on the Ethiopian Securities Exchange</p>{stocks.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}{stocks.length === 0 && <p className={styles.empty}>No matches. Try a ticker like TELE.</p>}</Card></> : <Card><p className={styles.cardIntro}>Bonds — you lend, they pay you back with interest.</p>{investorBonds.map((bond) => <button className={styles.bondRow} key={bond.ticker}><span><Icon name="shield" size={20} /></span><span><b>{bond.name}</b><small>{bond.maturity} · from {bond.minimum}</small></span><span><b>{bond.rate}</b><small>per year</small></span></button>)}</Card>}</div>;
}

function PortfolioScreen({ openStock }: { openStock: (stock: InvestorStock) => void }) {
  const rows = investorHoldings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; const value = stock.price * holding.quantity; const cost = holding.averageCost * holding.quantity; return { holding, stock, value, cost, gain: value - cost }; });
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const total = stockValue + 25_000 + 4_210;
  return <div className={styles.screen}><ScreenHeader title="Portfolio" /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(total)}</strong><div className={styles.summaryGrid}><span><small>Cost basis (stocks)</small><b>{formatEtb(cost)}</b></span><span><small>Unrealized gain</small><b className={styles.gain}>+{formatEtb(stockValue - cost).replace("ETB ", "")}</b></span><span><small>Dividends this year</small><b>ETB 1,440.00</b></span><span><small>Today</small><Delta value={1.8} /></span></div></Card><Card><div className={styles.cardHeader}><h2>Performance</h2><span className={`${styles.badge} ${styles.gainBadge}`}>+18.5% all time</span></div><Sparkline values={[92, 95, 94, 98, 97, 101, 100, 104, 103, 107, 106, 110]} large /><div className={styles.chartDates}><span>Mar 2026</span><span>Today</span></div></Card><Card><div className={styles.cardHeader}><h2>What you own</h2></div><AllocationBar bonds={Math.round((25_000 / total) * 100)} stocks={Math.round((stockValue / total) * 100)} /><div className={styles.legend}><span><i />Stocks {Math.round((stockValue / total) * 100)}%</span><span><i />Bonds {Math.round((25_000 / total) * 100)}%</span><span><i />Cash {Math.round((4_210 / total) * 100)}%</span></div>{rows.map((row) => <button className={styles.holdingRow} key={row.stock.ticker} onClick={() => openStock(row.stock)}><span className={styles.tickerTile}>{row.stock.ticker.slice(0, 4)}</span><span><b>{row.stock.name}</b><small>{row.holding.quantity} sh · avg {formatEtb(row.holding.averageCost)}</small></span><span><b>{formatEtb(row.value)}</b><small className={row.gain >= 0 ? styles.gain : styles.loss}>{row.gain >= 0 ? "+" : "−"}{formatEtb(Math.abs(row.gain)).replace("ETB ", "")}</small></span></button>)}<div className={styles.holdingRow}><span className={styles.tickerTile}><Icon name="shield" size={19} /></span><span><b>GoE Treasury Bonds</b><small>14.5–16.0% per year · held to maturity</small></span><span><b>ETB 25,000.00</b></span></div></Card><p className={styles.disclaimer}>Unrealized gains are on paper until you sell. Estimates use the last traded ESX price.</p></div>;
}

function PlanScreen() {
  const [plan, setPlan] = useState<"steady" | "balanced" | "growth">("steady");
  const [autoInvest, setAutoInvest] = useState(true);
  const mix = plan === "steady" ? [70, 30] : plan === "balanced" ? [50, 50] : [30, 70];
  return <div className={styles.screen}><ScreenHeader title="Your plan" /><Card className={styles.planHero}><ScoreRing /><div><h2>FrankScore 78</h2><p>Healthy. Diversified and on track for your goal.</p></div></Card><Card><div className={styles.cardHeader}><h2>Mix</h2></div><AllocationBar bonds={mix[0]} stocks={mix[1]} /><div className={styles.legend}><span><i />Bonds {mix[0]}%</span><span><i />Stocks {mix[1]}%</span></div></Card><Card className={styles.planChoices}>{([ ["steady", "Steady", "70% bonds, 30% stocks. Built for sleeping well."], ["balanced", "Balanced", "Half and half. Some movement, some calm."], ["growth", "Growth", "70% stocks. Bigger swings, bigger potential."] ] as const).map(([value, label, description]) => <label key={value}><input type="radio" name="plan" checked={plan === value} onChange={() => setPlan(value)} /><i /><span><b>{label}</b><small>{description}</small></span></label>)}</Card><Card><div className={styles.cardHeader}><h2>Your goal</h2><span className={styles.badge}>2036</span></div><Sparkline values={[78, 82, 89, 101, 117, 140]} large /><div className={styles.goalValue}><span>On track for</span><b>ETB 1,240,000</b></div><p className={styles.cardIntro}>If you keep investing ETB 2,000 monthly. A rough estimate, not a promise — markets move.</p></Card><Card><label className={styles.switchRow}><span><b>Auto-invest ETB 2,000 monthly</b><small>We buy your mix on the 1st. Change or pause anytime.</small></span><input type="checkbox" checked={autoInvest} onChange={(event) => setAutoInvest(event.target.checked)} /><i /></label></Card><Button className={styles.full}>Keep this plan</Button></div>;
}

function ProfileScreen({ notify }: { notify: (message: string) => void }) {
  return <div className={styles.screen}><ScreenHeader title="You" /><Card className={styles.profileCard}><span>SM</span><div><b>Selam Mekonnen</b><small>Investing since March 2026</small></div><em>Verified</em></Card><Card className={styles.menuCard}>{["Add money", "Withdraw", "Statements & tax", "Price alerts", "Security", "Help in Amharic"].map((item) => <button key={item} onClick={() => notify(`${item} is ready for the next demo phase.`)}><span>{item}</span><Icon name="chevron" size={18} /></button>)}</Card><p className={styles.license}>Frank Money is licensed by the Ethiopian Capital Market Authority.<br />Member of the Ethiopian Securities Exchange.</p></div>;
}

function OrderSheet({ stock, side, onClose, onPlaced }: { stock: InvestorStock; side: "Buy" | "Sell"; onClose: () => void; onPlaced: (detail: string) => void }) {
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop-loss">("Market");
  const [mode, setMode] = useState<"birr" | "shares">("birr");
  const [amount, setAmount] = useState("2000");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState(String(Math.round(stock.price * .98)));
  const [reviewing, setReviewing] = useState(false);
  const isSell = side === "Sell";
  const executionPrice = orderType === "Limit" ? Number(limitPrice) || stock.price : stock.price;
  const shares = mode === "birr" && !isSell && orderType === "Market" ? (Number(amount) || 0) / executionPrice : Number(quantity) || 0;
  const gross = mode === "birr" && !isSell && orderType === "Market" ? Number(amount) || 0 : shares * executionPrice;
  const fee = gross * .005;
  const options = isSell ? ["Market", "Limit", "Stop-loss"] as const : ["Market", "Limit"] as const;
  return <><div className={styles.sheetBackdrop} onClick={onClose}><section className={styles.orderSheet} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="order-title"><i className={styles.sheetHandle} /><h2 id="order-title">{side} {stock.ticker}</h2><div className={styles.chips}>{options.map((option) => <button key={option} className={orderType === option ? styles.chipActive : ""} onClick={() => setOrderType(option)}>{option}</button>)}</div><p className={styles.orderHint}>{orderType === "Market" ? "Trades at the best available ESX price." : orderType === "Limit" ? `${side}s only at your selected price or better.` : "Sells at the next available price after your trigger is reached."}</p>{!isSell && orderType === "Market" && <div className={styles.segmented}><button className={mode === "birr" ? styles.segmentActive : ""} onClick={() => setMode("birr")}>In birr</button><button className={mode === "shares" ? styles.segmentActive : ""} onClick={() => setMode("shares")}>In shares</button></div>}{orderType === "Limit" && <label className={styles.formField}><span>{isSell ? "Sell at or above" : "Buy at or below"}</span><div><em>ETB</em><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>}{mode === "birr" && !isSell && orderType === "Market" ? <label className={styles.formField}><span>Amount</span><div><em>ETB</em><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} /></div><small>≈ {shares.toFixed(3)} shares — own a slice, no matter the share price</small></label> : <label className={styles.formField}><span>Shares</span><div><input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ""))} /><em>× {formatEtb(executionPrice)}</em></div>{isSell && <small>You hold {investorHoldings.find((holding) => holding.ticker === stock.ticker)?.quantity ?? 0} shares</small>}</label>}<dl className={styles.orderTotals}><div><dt>{isSell ? "Estimated proceeds" : "Estimated cost"}</dt><dd>{formatEtb(gross)}</dd></div><div><dt>Fee (0.5%)</dt><dd>{formatEtb(fee)}</dd></div></dl><Button className={styles.full} variant={isSell ? "danger" : "primary"} disabled={gross <= 0} onClick={() => setReviewing(true)}>Review order</Button></section></div>{reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm order</h2><p>You&apos;re {isSell ? "selling" : "buying"} <b>{shares.toFixed(mode === "birr" ? 3 : 0)} shares of {stock.ticker}</b> for about <b>{formatEtb(gross)}</b>. Fee: {formatEtb(fee)}.</p><div><Button variant="secondary" onClick={() => setReviewing(false)}>Cancel</Button><Button variant={isSell ? "danger" : "primary"} onClick={() => onPlaced(`${side} order placed · ${shares.toFixed(mode === "birr" ? 3 : 0)} ${stock.ticker}`)}>{side}</Button></div></section></div>}</>;
}

function StockDetail({ stock, onBack, notify }: { stock: InvestorStock; onBack: () => void; notify: (message: string) => void }) {
  const [side, setSide] = useState<"Buy" | "Sell" | null>(null);
  const holding = investorHoldings.find((item) => item.ticker === stock.ticker);
  return <div className={styles.detailScreen}><ScreenHeader title={stock.ticker} onBack={onBack} right={<span className={styles.badge}>{stock.sector}</span>} /><div className={styles.detailBody}><p className={styles.companyName}>{stock.name}</p><div className={styles.quote}><strong>{formatEtb(stock.price)}</strong><Delta value={stock.delta} pill /></div><Sparkline values={stock.series} large /><div className={styles.rangeTabs}>{["1W", "1M", "3M", "1Y", "All"].map((range, index) => <button key={range} className={index === 1 ? styles.rangeActive : ""}>{range}</button>)}</div><Card className={styles.marketStats}>{[["Open", formatEtb(stock.series[0])], ["Day range", `${formatEtb(Math.min(...stock.series))} – ${formatEtb(Math.max(...stock.series))}`], ["Volume", "24,180 shares"], ["Listed", "ESX Main Market"]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</Card>{holding && <Card className={styles.positionCard}><small>YOUR POSITION</small><div>{[["Shares", `${holding.quantity} sh`], ["Avg cost", formatEtb(holding.averageCost)], ["Value", formatEtb(holding.quantity * stock.price)], ["Unrealized", `${holding.quantity * (stock.price - holding.averageCost) >= 0 ? "+" : "−"}${formatEtb(Math.abs(holding.quantity * (stock.price - holding.averageCost))).replace("ETB ", "")}`]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></Card>}<Card><div className={styles.cardHeader}><h2>Company insights</h2></div><div className={styles.insights}>{[["Dividend yield", stock.dividendYield], ["P/E", stock.pe], ["YTD", `${stock.ytd >= 0 ? "+" : ""}${stock.ytd}%`], ["Revenue", stock.revenueGrowth], ["Next dividend", stock.nextDividend], ["Sector", stock.sector]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div><div className={styles.frankTake}><small>FRANK&apos;S TAKE</small><p>{stock.frankTake}</p></div></Card><Card><div className={styles.cardHeader}><h2>About</h2></div><p className={styles.about}>{stock.about}</p></Card><p className={styles.disclaimer}>Prices move. Invest money you won&apos;t need soon.</p></div><div className={styles.tradeBar}><Button onClick={() => setSide("Buy")}>Buy</Button><Button variant="secondary" disabled={!holding} onClick={() => setSide("Sell")}>Sell</Button></div>{side && <OrderSheet stock={stock} side={side} onClose={() => setSide(null)} onPlaced={(message) => { setSide(null); notify(message); }} />}</div>;
}

export default function InvestorApp() {
  const [phase, setPhase] = useState<"onboarding" | "app">("onboarding");
  const [tab, setTab] = useState<Tab>("home");
  const [stock, setStock] = useState<InvestorStock | null>(null);
  const [toast, setToast] = useState("");
  const featured = useMemo(() => investorStocks.slice(0, 3), []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const navigate = (next: Tab) => { setTab(next); setStock(null); };

  return <main className={styles.investorPage}><section className={styles.desktopStory}><AppLogo /><span className={styles.licenseBadge}>Licensed-market demo</span><h1>Own a piece of Ethiopia&apos;s growth</h1><p>Buy shares on the Ethiopian Securities Exchange, explore government bonds, or let Frank build a steady plan around your goals.</p><Button onClick={() => setPhase("app")}>Explore the investor app</Button><div className={styles.desktopTickers}>{featured.map((item) => <span key={item.ticker}><b>{item.ticker}</b><small>{formatEtb(item.price)}</small><Delta value={item.delta} /></span>)}</div><small className={styles.riskCopy}>Prices move. Invest money you won&apos;t need soon. Demo data only.</small></section><section className={styles.appFrame} aria-label="Frank Money investor app"><div className={styles.appViewport}>{phase === "onboarding" ? <Onboarding onDone={() => setPhase("app")} /> : stock ? <StockDetail key={stock.ticker} stock={stock} onBack={() => setStock(null)} notify={notify} /> : <><div className={styles.scrollArea}>{tab === "home" ? <HomeScreen openStock={setStock} go={navigate} /> : tab === "markets" ? <MarketsScreen openStock={setStock} /> : tab === "portfolio" ? <PortfolioScreen openStock={setStock} /> : tab === "plan" ? <PlanScreen /> : <ProfileScreen notify={notify} />}</div><BottomNav active={tab} onChange={navigate} /></>}{toast && <div className={styles.toast} role="status"><Icon name="check" size={18} /><span><b>{toast}</b><small>Saved in this demo session.</small></span></div>}</div></section></main>;
}
