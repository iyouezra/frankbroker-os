"use client";

import { formatEtb, investorHoldings, investorStocks, type InvestorStock } from "../../../lib/investor-data";
import styles from "../../../app/investor/investor.module.css";
import { AllocationBar, Card, Delta, Icon, PortfolioChart, ScreenHeader, type InvestorBootstrap } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";

// Metric labels (Total value, Cost basis, Unrealized gain, the allocation
// legend) stay in English by product decision - market and portfolio readouts
// are not translated until the terminology is agreed.
export function PortfolioScreen({ openStock, account, servicing, demoFallback }: { openStock: (stock: InvestorStock) => void; account: InvestorBootstrap["account"]; servicing: InvestorBootstrap["servicing"]; demoFallback: boolean }) {
  const t = useT();
  if (!account && !demoFallback) {
    return <div className={styles.screen}><ScreenHeader title={t("portfolio.title")} /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(0)}</strong><div className={styles.summaryGrid}><span><small>Account status</small><b>Pending approval</b></span><span><small>Trading account</small><b>Not assigned</b></span></div></Card><Card><div className={styles.cardHeader}><h2>{t("portfolio.whatYouOwn")}</h2></div><div className={styles.activityEmpty}><b>{t("portfolio.noHoldings")}</b><p>{t("portfolio.noHoldingsNote")}</p></div></Card></div>;
  }
  if (!demoFallback && account?.holdings.length === 0) {
    return <div className={styles.screen}><ScreenHeader title={t("portfolio.title")} /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(account.availableCash)}</strong><div className={styles.summaryGrid}><span><small>Available cash</small><b>{formatEtb(account.availableCash)}</b></span><span><small>Holdings</small><b>0</b></span></div></Card><Card><div className={styles.cardHeader}><h2>{t("portfolio.whatYouOwn")}</h2></div><div className={styles.activityEmpty}><b>{t("portfolio.noHoldings")}</b><p>{t("portfolio.noHoldingsNote")}</p></div></Card></div>;
  }
  const holdings = demoFallback
    ? investorHoldings
    : (account?.holdings ?? []).filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker));
  const otherHoldings = demoFallback
    ? []
    : (account?.holdings ?? []).filter((holding) => !investorStocks.some((stock) => stock.ticker === holding.ticker));
  const rows = holdings.map((holding) => {
    const stock = investorStocks.find((item) => item.ticker === holding.ticker)!;
    const value = "marketValue" in holding ? holding.marketValue : stock.price * holding.quantity;
    const cost = holding.averageCost * holding.quantity;
    return { holding, stock, value, cost, gain: value - cost };
  });
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const otherValue = demoFallback ? 25_000 : otherHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0) + otherHoldings.reduce((sum, holding) => sum + holding.averageCost * holding.quantity, 0);
  const cash = account?.availableCash ?? (demoFallback ? 4_210 : 0);
  const total = stockValue + otherValue + cash;
  const securitiesValue = stockValue + otherValue;
  const gain = securitiesValue - cost;
  const denominator = total || 1;
  return <div className={styles.screen}><ScreenHeader title={t("portfolio.title")} /><Card className={styles.portfolioSummary}><small>Total value</small><strong>{formatEtb(total)}</strong><div className={styles.summaryGrid}><span><small>Cost basis</small><b>{formatEtb(cost)}</b></span><span><small>Unrealized gain</small><b className={gain >= 0 ? styles.gain : styles.loss}>{gain >= 0 ? "+" : "−"}{formatEtb(Math.abs(gain)).replace("ETB ", "")}</b></span>{demoFallback ? <><span><small>Dividends this year</small><b>ETB 1,440.00</b></span><span><small>Today</small><Delta value={1.8} /></span></> : <><span><small>Available cash</small><b>{formatEtb(cash)}</b></span><span><small>Holdings</small><b>{account?.holdings.length ?? 0}</b></span></>}</div></Card>{demoFallback && <Card><div className={styles.cardHeader}><h2>{t("portfolio.performance")}</h2><span className={`${styles.badge} ${styles.gainBadge}`}>+18.5% all time</span></div><PortfolioChart total={total} /></Card>}<Card><div className={styles.cardHeader}><h2>{t("portfolio.whatYouOwn")}</h2></div><AllocationBar bonds={Math.round((otherValue / denominator) * 100)} stocks={Math.round((stockValue / denominator) * 100)} /><div className={styles.legend}><span><i />Stocks {Math.round((stockValue / denominator) * 100)}%</span><span><i />Other securities {Math.round((otherValue / denominator) * 100)}%</span><span><i />Cash {Math.round((cash / denominator) * 100)}%</span></div>{rows.map((row) => <button className={styles.holdingRow} key={row.stock.ticker} onClick={() => openStock(row.stock)}><span className={styles.tickerTile}>{row.stock.ticker.slice(0, 4)}</span><span><b>{row.stock.name}</b><small>{row.holding.quantity} sh · avg {formatEtb(row.holding.averageCost)}</small></span><span><b>{formatEtb(row.value)}</b><small className={row.gain >= 0 ? styles.gain : styles.loss}>{row.gain >= 0 ? "+" : "−"}{formatEtb(Math.abs(row.gain)).replace("ETB ", "")}</small></span></button>)}{demoFallback ? <div className={styles.holdingRow}><span className={styles.tickerTile}><Icon name="shield" size={19} /></span><span><b>GoE Treasury Bonds</b><small>14.5–16.0% per year · held to maturity</small></span><span><b>ETB 25,000.00</b></span></div> : otherHoldings.map((holding) => <div className={styles.holdingRow} key={holding.ticker}><span className={styles.tickerTile}><Icon name="shield" size={19} /></span><span><b>{holding.name}</b><small>{holding.quantity} units · avg {formatEtb(holding.averageCost)}</small></span><span><b>{formatEtb(holding.marketValue)}</b></span></div>)}</Card>{servicing && (servicing.income.length > 0 || servicing.realizations.length > 0 || servicing.basisSummary.unknownBasisLots > 0) && <Card><div className={styles.cardHeader}><h2>Income & tax records</h2><span className={styles.badge}>Estimates</span></div>{servicing.basisSummary.unknownBasisLots > 0 && <p className={styles.recordNotice}>{servicing.basisSummary.unknownBasisLots} position lot(s) have no documented purchase cost. Gains and tax remain unavailable for those disposals until evidence is recorded.</p>}{servicing.income.slice(0, 5).map((item) => <div className={styles.recordRow} key={item.id}><span><b>{item.instrument} · {item.type.replaceAll("_", " ")}</b><small>Record {item.recordDate} · pay {item.paymentDate} · {item.status.replaceAll("_", " ")}</small></span><span><b>{item.netCash === null ? item.securityQuantity === null ? "Pending" : `${item.securityQuantity} units` : formatEtb(item.netCash)}</b><small>{item.withholdingAmount === null ? "Tax treatment pending" : `${formatEtb(item.withholdingAmount)} withheld`}</small></span></div>)}{servicing.realizations.slice(0, 5).map((item) => <div className={styles.recordRow} key={item.id}><span><b>{item.instrument} sale · {item.tradeDate}</b><small>{item.quantity} units · net proceeds {formatEtb(item.netProceeds)}</small></span><span><b>{item.realizedGain === null ? "Basis needed" : `${item.realizedGain >= 0 ? "+" : "−"}${formatEtb(Math.abs(item.realizedGain)).replace("ETB ", "")}`}</b><small>{item.latestTaxEstimate ? `Tax estimate ${formatEtb(item.latestTaxEstimate.amount)}` : "Tax policy unconfigured"}</small></span></div>)}</Card>}<p className={styles.disclaimer}>{t("portfolio.disclaimer")} Tax figures shown here are provisional records, not a tax return or final liability.</p></div>;
}
