"use client";

import { useState } from "react";
import {
  formatEtb,
  formatMarketTimestamp,
  getBondCouponPayment,
  getBondPricePerUnit,
  getInvestorSession,
  getMarketSnapshot,
  investorHoldings,
  investorMarketContext,
  type InvestorBond,
  type InvestorStock,
  type MarketRange,
} from "../../../lib/investor-data";
import styles from "../../../app/investor/investor.module.css";
import { BondOrderSheet, OrderSheet } from "../orders/order-sheets";
import {
  Button,
  Card,
  Delta,
  PriceChart,
  ScreenHeader,
  type InvestorBootstrap,
  type InvestorFeeRule,
  type InvestorOrderInput,
  type PlaceResult,
} from "../shared/investor-foundation";

export function BondDetail({ bond, account, onBack, placeOrder, feeRule, allowedOrderTypes }: { bond: InvestorBond; account: InvestorBootstrap["account"]; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const [buying, setBuying] = useState(false);
  const pricePerBond = getBondPricePerUnit(bond);
  const couponPayment = getBondCouponPayment(bond);
  const availableCash = account?.availableCash ?? 75_000;
  const halted = bond.status === "halted";
  return <div className={styles.detailScreen}>
    <ScreenHeader title={bond.ticker} onBack={onBack} right={<span className={`${styles.badge} ${halted ? styles.haltedBadge : ""}`}>{halted ? "Trading paused" : "Government bond"}</span>} />
    <div className={styles.detailBody}>
      <p className={styles.companyName}>{bond.name}</p>
      <div className={styles.bondQuote}><span><small>Price</small><strong>{bond.quotedPricePct.toFixed(2)}%</strong><em>of face value</em></span><span><small>Yield to maturity</small><b>{bond.yieldToMaturity.toFixed(1)}%</b><em>per year if held</em></span></div>
      <p className={styles.quoteContext}><i className={halted ? styles.pausedDot : ""} />{halted ? "Trading paused" : investorMarketContext.statusLabel}<span>{halted ? "New orders are not being accepted" : `Price updated ${formatMarketTimestamp(investorMarketContext.quoteAsOf)}`}</span></p>
      {halted && <div className={styles.tradingNotice}><b>You cannot buy this bond right now</b><span>Trading can resume after the market or your broker lifts the pause.</span></div>}
      <Card className={styles.bondFacts}>
        <div className={styles.cardHeader}><h2>Key facts</h2></div>
        <div>{[
          ["Coupon", `${bond.couponRate.toFixed(1)}% per year`],
          ["Matures", bond.maturityLabel],
          ["Price per bond", formatEtb(pricePerBond)],
          ["Face value", formatEtb(bond.faceValue)],
          ["Interest paid", "Every 6 months"],
          ["Next payment", bond.nextPayment],
          ["Minimum order", formatEtb(bond.minimumInvestment)],
          ["Settlement", bond.settlementCycle],
          ["Liquidity", bond.liquidity],
        ].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>How payments work</h2></div>
        <p className={styles.sectionIntro}>For each bond you hold, the issuer pays interest and returns the face value at maturity.</p>
        <div className={styles.cashFlow}>
          <span><i>1</i><small>Every 6 months</small><b>{formatEtb(couponPayment)}</b><em>interest per bond</em></span>
          <span><i>2</i><small>Until</small><b>{bond.maturityLabel}</b><em>the maturity date</em></span>
          <span><i>3</i><small>At maturity</small><b>{formatEtb(bond.faceValue)}</b><em>principal per bond</em></span>
        </div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>About this bond</h2></div>
        <p className={styles.about}>This bond is issued by the {bond.issuer}. Buying it means lending money to the issuer in return for scheduled interest payments.</p>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>Things to consider</h2></div>
        <ul className={styles.riskList}>{bond.riskNotes.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </Card>
      <p className={styles.disclaimer}>Yield assumes the bond is held to maturity and all scheduled payments are made.</p>
    </div>
    <div className={`${styles.tradeBar} ${styles.bondTradeBar}`}><Button disabled={halted} onClick={() => setBuying(true)}>{halted ? "Trading paused" : "Buy bond"}</Button></div>
    {buying && <BondOrderSheet bond={bond} availableCash={availableCash} feeRule={feeRule} allowedOrderTypes={allowedOrderTypes} onClose={() => setBuying(false)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status !== "validation_failed") setBuying(false); return result; }} />}
  </div>;
}

export function StockDetail({ stock, account, onBack, placeOrder, feeRule, allowedOrderTypes }: { stock: InvestorStock; account: InvestorBootstrap["account"]; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const [side, setSide] = useState<"Buy" | "Sell" | null>(null);
  const [range, setRange] = useState<MarketRange>("1M");
  const holding = account?.holdings.find((item) => item.ticker === stock.ticker) ?? investorHoldings.find((item) => item.ticker === stock.ticker);
  const session = getInvestorSession(stock);
  const snapshot = getMarketSnapshot(stock);
  return <div className={styles.detailScreen}>
    <ScreenHeader title={stock.ticker} onBack={onBack} right={<span className={styles.badge}>{stock.sector}</span>} />
    <div className={styles.detailBody}>
      <p className={styles.companyName}>{stock.name}</p>
      <div className={styles.quote}><strong>{formatEtb(stock.price)}</strong><Delta value={stock.delta} pill /></div>
      <p className={styles.quoteContext}><i />{snapshot.statusLabel}<span>Updated {formatMarketTimestamp(snapshot.quoteAsOf)} · Last trade {formatMarketTimestamp(snapshot.lastTradeAt)}</span></p>
      <PriceChart key={`${stock.ticker}-${range}`} stock={stock} range={range} />
      <div className={styles.rangeTabs}>{(["1W", "1M", "3M", "1Y", "All"] as MarketRange[]).map((item) => <button key={item} className={range === item ? styles.rangeActive : ""} onClick={() => setRange(item)} aria-pressed={range === item}>{item}</button>)}</div>
      <Card className={styles.marketStats}>{[["Open", formatEtb(session.open)], ["Day range", `${formatEtb(session.low)} – ${formatEtb(session.high)}`], ["Volume", `${session.volume.toLocaleString("en-US")} shares`], ["Listed", "ESX Main Market"]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</Card>
      <Card className={styles.liquidityCard}>
        <div className={styles.cardHeader}><h2>Market activity</h2><span className={styles.badge}>Top prices</span></div>
        <div className={styles.liquidityGrid}>
          <span><small>Best buyer</small><b>{formatEtb(snapshot.bid.price)}</b><em>{snapshot.bid.quantity.toLocaleString("en-US")} shares</em></span>
          <span><small>Best seller</small><b>{formatEtb(snapshot.ask.price)}</b><em>{snapshot.ask.quantity.toLocaleString("en-US")} shares</em></span>
          <span><small>Difference</small><b>{formatEtb(snapshot.spread)}</b><em>{snapshot.spreadPct.toFixed(2)}%</em></span>
        </div>
        <p>These are the closest prices buyers and sellers are currently offering.</p>
      </Card>
      {holding && <Card className={styles.positionCard}><small>YOUR POSITION</small><div>{[["Shares", `${holding.quantity} sh`], ["Avg cost", formatEtb(holding.averageCost)], ["Value", formatEtb(holding.quantity * stock.price)], ["Unrealized", `${holding.quantity * (stock.price - holding.averageCost) >= 0 ? "+" : "−"}${formatEtb(Math.abs(holding.quantity * (stock.price - holding.averageCost))).replace("ETB ", "")}`]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></Card>}
      <Card>
        <div className={styles.cardHeader}><h2>Company insights</h2></div>
        <div className={styles.insights}>{[["Dividend yield", stock.dividendYield], ["P/E", stock.pe], ["YTD", `${stock.ytd >= 0 ? "+" : ""}${stock.ytd}%`], ["Revenue", stock.revenueGrowth], ["Next dividend", stock.nextDividend], ["Sector", stock.sector]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
        <div className={styles.frankTake}><small>FRANK&apos;S TAKE</small><p>{stock.frankTake}</p></div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>What this company does</h2></div>
        <p className={styles.about}>{stock.about}</p>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>Latest updates</h2></div>
        <div className={styles.companyUpdates}>{stock.updates.map((update) => <article key={update.title}><span><b>{update.title}</b><small>{update.date}</small></span><p>{update.summary}</p><em>{update.source}</em></article>)}</div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>Things to consider</h2></div>
        <ul className={styles.riskList}>{stock.riskNotes.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </Card>
      <p className={styles.disclaimer}>Prices move. Invest money you won&apos;t need soon.</p>
    </div>
    <div className={styles.tradeBar}><Button onClick={() => setSide("Buy")}>Buy</Button><Button variant="secondary" disabled={!holding} onClick={() => setSide("Sell")}>Sell</Button></div>
    {side && <OrderSheet stock={stock} side={side} holdingQuantity={holding?.quantity ?? 0} feeRule={feeRule} allowedOrderTypes={allowedOrderTypes} onClose={() => setSide(null)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status !== "validation_failed") setSide(null); return result; }} />}
  </div>;
}


