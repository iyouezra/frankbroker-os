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
import { useT } from "../../../lib/i18n/context";

export function BondDetail({ bond, account, restricted, onBack, placeOrder, feeRule, allowedOrderTypes }: { bond: InvestorBond; account: InvestorBootstrap["account"]; restricted: boolean; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const t = useT();
  const [buying, setBuying] = useState(false);
  const pricePerBond = getBondPricePerUnit(bond);
  const couponPayment = getBondCouponPayment(bond);
  const availableCash = restricted ? 0 : account?.availableCash ?? 75_000;
  const halted = bond.status === "halted";
  return <div className={`${styles.detailScreen} ${restricted ? styles.restrictedDetail : ""}`}>
    <ScreenHeader title={bond.ticker} onBack={onBack} right={<span className={`${styles.badge} ${halted ? styles.haltedBadge : ""}`}>{t(halted ? "detail.tradingPaused" : "detail.governmentBond")}</span>} />
    <div className={styles.detailBody}>
      <p className={styles.companyName}>{bond.name}</p>
      <div className={styles.bondQuote}><span><small>Price</small><strong>{bond.quotedPricePct.toFixed(2)}%</strong><em>of face value</em></span><span><small>Yield to maturity</small><b>{bond.yieldToMaturity.toFixed(1)}%</b><em>per year if held</em></span></div>
      <p className={styles.quoteContext}><i className={halted ? styles.pausedDot : ""} />{halted ? t("detail.tradingPaused") : investorMarketContext.statusLabel}<span>{halted ? t("detail.ordersNotAccepted") : t("detail.priceUpdated", { time: formatMarketTimestamp(investorMarketContext.quoteAsOf) })}</span></p>
      {halted && <div className={styles.tradingNotice}><b>{t("detail.cannotBuyNow")}</b><span>{t("detail.pauseNote")}</span></div>}
      <Card className={styles.bondFacts}>
        <div className={styles.cardHeader}><h2>{t("detail.keyFacts")}</h2></div>
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
        <div className={styles.cardHeader}><h2>{t("detail.howPaymentsWork")}</h2></div>
        <p className={styles.sectionIntro}>{t("detail.paymentsIntro")}</p>
        <div className={styles.cashFlow}>
          <span><i>1</i><small>{t("detail.everySixMonths")}</small><b>{formatEtb(couponPayment)}</b><em>{t("detail.interestPerBond")}</em></span>
          <span><i>2</i><small>{t("detail.until")}</small><b>{bond.maturityLabel}</b><em>{t("detail.maturityDate")}</em></span>
          <span><i>3</i><small>{t("detail.atMaturity")}</small><b>{formatEtb(bond.faceValue)}</b><em>{t("detail.principalPerBond")}</em></span>
        </div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.aboutBond")}</h2></div>
        <p className={styles.about}>{t("detail.bondIssuerNote", { issuer: bond.issuer })}</p>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.thingsToConsider")}</h2></div>
        <ul className={styles.riskList}>{bond.riskNotes.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </Card>
      <p className={styles.disclaimer}>{t("detail.bondDisclaimer")}</p>
    </div>
    <div className={`${styles.tradeBar} ${styles.bondTradeBar}`}><Button disabled={halted || restricted} onClick={() => setBuying(true)}>{t(restricted ? "detail.approvalRequired" : halted ? "detail.tradingPaused" : "detail.buyBond")}</Button></div>
    {buying && <BondOrderSheet bond={bond} availableCash={availableCash} feeRule={feeRule} allowedOrderTypes={allowedOrderTypes} onClose={() => setBuying(false)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status && !["error", "verification_cancelled"].includes(result.status)) setBuying(false); return result; }} />}
  </div>;
}

export function StockDetail({ stock, account, restricted, onBack, placeOrder, feeRule, allowedOrderTypes }: { stock: InvestorStock; account: InvestorBootstrap["account"]; restricted: boolean; onBack: () => void; placeOrder: (order: InvestorOrderInput) => Promise<PlaceResult>; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss"> }) {
  const t = useT();
  const [side, setSide] = useState<"Buy" | "Sell" | null>(null);
  const [range, setRange] = useState<MarketRange>("1M");
  const holding = account?.holdings.find((item) => item.ticker === stock.ticker) ?? (restricted ? undefined : investorHoldings.find((item) => item.ticker === stock.ticker));
  const session = getInvestorSession(stock);
  const snapshot = getMarketSnapshot(stock);
  return <div className={`${styles.detailScreen} ${restricted ? styles.restrictedDetail : ""}`}>
    <ScreenHeader title={stock.ticker} onBack={onBack} right={<span className={styles.badge}>{stock.sector}</span>} />
    <div className={styles.detailBody}>
      <p className={styles.companyName}>{stock.name}</p>
      <div className={styles.quote}><strong>{formatEtb(stock.price)}</strong><Delta value={stock.delta} pill /></div>
      <p className={styles.quoteContext}><i />{snapshot.statusLabel}<span>{t("detail.updatedRange", { quote: formatMarketTimestamp(snapshot.quoteAsOf), trade: formatMarketTimestamp(snapshot.lastTradeAt) })}</span></p>
      <PriceChart key={`${stock.ticker}-${range}`} stock={stock} range={range} />
      <div className={styles.rangeTabs}>{(["1W", "1M", "3M", "1Y", "All"] as MarketRange[]).map((item) => <button key={item} className={range === item ? styles.rangeActive : ""} onClick={() => setRange(item)} aria-pressed={range === item}>{item}</button>)}</div>
      <Card className={styles.marketStats}>{[["Open", formatEtb(session.open)], ["Day range", `${formatEtb(session.low)} – ${formatEtb(session.high)}`], ["Volume", `${session.volume.toLocaleString("en-US")} shares`], ["Listed", "ESX Main Market"]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</Card>
      <Card className={styles.liquidityCard}>
        <div className={styles.cardHeader}><h2>{t("detail.marketActivity")}</h2><span className={styles.badge}>{t("detail.topPrices")}</span></div>
        <div className={styles.liquidityGrid}>
          <span><small>Best buyer</small><b>{formatEtb(snapshot.bid.price)}</b><em>{snapshot.bid.quantity.toLocaleString("en-US")} shares</em></span>
          <span><small>Best seller</small><b>{formatEtb(snapshot.ask.price)}</b><em>{snapshot.ask.quantity.toLocaleString("en-US")} shares</em></span>
          <span><small>Difference</small><b>{formatEtb(snapshot.spread)}</b><em>{snapshot.spreadPct.toFixed(2)}%</em></span>
        </div>
        <p>{t("detail.closestPrices")}</p>
      </Card>
      {holding && <Card className={styles.positionCard}><small>YOUR POSITION</small><div>{[["Shares", `${holding.quantity} sh`], ["Avg cost", formatEtb(holding.averageCost)], ["Value", formatEtb(holding.quantity * stock.price)], ["Unrealized", `${holding.quantity * (stock.price - holding.averageCost) >= 0 ? "+" : "−"}${formatEtb(Math.abs(holding.quantity * (stock.price - holding.averageCost))).replace("ETB ", "")}`]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></Card>}
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.companyInsights")}</h2></div>
        <div className={styles.insights}>{[["Dividend yield", stock.dividendYield], ["P/E", stock.pe], ["YTD", `${stock.ytd >= 0 ? "+" : ""}${stock.ytd}%`], ["Revenue", stock.revenueGrowth], ["Next dividend", stock.nextDividend], ["Sector", stock.sector]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
        <div className={styles.frankTake}><small>{t("detail.franksTake")}</small><p>{stock.frankTake}</p></div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.whatCompanyDoes")}</h2></div>
        <p className={styles.about}>{stock.about}</p>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.latestUpdates")}</h2></div>
        <div className={styles.companyUpdates}>{stock.updates.map((update) => <article key={update.title}><span><b>{update.title}</b><small>{update.date}</small></span><p>{update.summary}</p><em>{update.source}</em></article>)}</div>
      </Card>
      <Card>
        <div className={styles.cardHeader}><h2>{t("detail.thingsToConsider")}</h2></div>
        <ul className={styles.riskList}>{stock.riskNotes.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </Card>
      <p className={styles.disclaimer}>{t("detail.stockDisclaimer")}</p>
    </div>
    <div className={styles.tradeBar}><Button disabled={restricted} onClick={() => setSide("Buy")}>{t(restricted ? "detail.approvalRequired" : "order.buy")}</Button><Button variant="secondary" disabled={restricted || !holding} onClick={() => setSide("Sell")}>{t("order.sell")}</Button></div>
    {side && <OrderSheet stock={stock} side={side} holdingQuantity={holding?.quantity ?? 0} feeRule={feeRule} allowedOrderTypes={allowedOrderTypes} onClose={() => setSide(null)} onPlaced={async (order) => { const result = await placeOrder(order); if (result?.status && !["error", "verification_cancelled"].includes(result.status)) setSide(null); return result; }} />}
  </div>;
}
