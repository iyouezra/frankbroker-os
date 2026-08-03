"use client";

import { useMemo, useState } from "react";
import { formatEtb, formatMarketTimestamp, investorHoldings, investorMarketContext, investorStocks, type InvestorStock } from "../../../lib/investor-data";
import { getRecentInvestorActivity, type InvestorActivity } from "../../../lib/investor-activity";
import { getFrankCoachTips } from "../../../lib/frank-coach";
import styles from "../../../app/investor/investor.module.css";
import { ActivityRow } from "../activity/activity-screen";
import { AppLogo, Button, Card, Delta, Icon, StockRow, type InvestorBootstrap, type Tab } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";

export function HomeScreen({ openStock, go, account, activity, tradeRestricted, cashRestricted, demoFallback, unread, onBell, onCash, onActivity, onActivityItem }: { openStock: (stock: InvestorStock) => void; go: (tab: Tab) => void; account: InvestorBootstrap["account"]; activity: InvestorActivity[]; tradeRestricted: boolean; cashRestricted: boolean; demoFallback: boolean; unread: number; onBell: () => void; onCash: () => void; onActivity: () => void; onActivityItem: (item: InvestorActivity) => void }) {
  const t = useT();
  const [tip, setTip] = useState({ key: "", index: 0 });
  const holdings = account?.holdings.length
    ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker))
    : demoFallback
      ? investorHoldings
      : [];
  const featured = investorStocks.slice(0, 3);
  const stockValue = holdings.reduce((sum, holding) => sum + investorStocks.find((stock) => stock.ticker === holding.ticker)!.price * holding.quantity, 0);
  const availableCash = account?.availableCash ?? (demoFallback ? 4_210 : 0);
  const totalValue = stockValue + (demoFallback ? 25_000 : 0) + availableCash;
  const coachTips = useMemo(() => getFrankCoachTips({
    availableCash: account?.availableCash ?? 0,
    asOf: new Date().toISOString(),
    holdings: (account?.holdings ?? []).map((holding) => ({
      ticker: holding.ticker,
      name: holding.name,
      assetClass: holding.assetClass,
      sector: holding.sector,
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      marketPrice: holding.price,
      marketValue: holding.marketValue,
      faceValue: holding.faceValue,
      couponRate: holding.couponRate,
      couponFrequency: holding.couponFrequency,
      maturityDate: holding.maturityDate,
    })),
  }), [account]);
  const coachTipKey = coachTips.map((item) => item.id).join("|");
  const activeTip = tip.key === coachTipKey && tip.index < coachTips.length ? tip.index : 0;
  const recentActivity = getRecentInvestorActivity(activity);
  const fullyRestricted = tradeRestricted && cashRestricted;
  return <div className={styles.screen}><div className={styles.homeHeader}><AppLogo /><button className={styles.iconButton} aria-label={t("notifications.label")} onClick={onBell}><Icon name="bell" size={20} />{unread > 0 && <i />}</button></div><Card className={styles.heroCard}><small>{fullyRestricted ? t("home.heroRestricted") : t("home.heroLabel")}</small><strong>{formatEtb(totalValue)}</strong><div>{!fullyRestricted && <Delta value={1.8} pill />}<span>{fullyRestricted ? t("home.heroRestrictedNote") : `${investorMarketContext.statusLabel} · updated ${formatMarketTimestamp(investorMarketContext.quoteAsOf)}`}</span></div></Card><Card className={styles.homeAvailableCash}><div><small>{t("home.availableCash")}</small><strong>{cashRestricted ? t("home.cashRestricted") : formatEtb(availableCash)}</strong><span>{cashRestricted ? t("home.cashRestrictedNote") : t("home.cashNote")}</span></div>{!cashRestricted && <button onClick={onCash}>{t("home.manageCash")} <Icon name="chevron" size={15} /></button>}</Card><div className={styles.quickActions}><Button onClick={() => go("markets")}><Icon name="plus" size={18} /> {tradeRestricted ? t("home.exploreInvestments") : t("home.invest")}</Button><Button variant="secondary" disabled={cashRestricted} onClick={onCash}>{t("home.addOrWithdraw")}</Button></div>{holdings.length
      ? <Card><div className={styles.cardHeader}><h2>{t("home.companiesYouOwn")}</h2><button onClick={() => go("portfolio")}>{t("home.details")}</button></div>{holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; return <StockRow key={stock.ticker} stock={stock} holdingValue={stock.price * holding.quantity} onClick={() => openStock(stock)} />; })}</Card>
      : <Card className={styles.firstInvestCard}>
          <div className={styles.firstInvestIntro}><span className={styles.firstInvestIcon}><Icon name="plus" size={22} /></span><div><h2>{tradeRestricted ? t("home.exploreMarket") : t("home.firstInvestment")}</h2><p>{tradeRestricted ? t("home.exploreMarketNote") : t("home.firstInvestmentNote")}</p></div></div>
          <div className={styles.firstInvestPicks}><small>{t("home.fewToExplore")}</small>{featured.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}</div>
          <Button className={styles.full} onClick={() => go("markets")}>{t("home.seeAllCompanies")}</Button>
        </Card>}<Card className={styles.coachCard}><span><Icon name="bulb" size={20} /></span><div><small>{t("home.frankCoach")}</small><h3>{coachTips[activeTip].title}</h3><p>{coachTips[activeTip].body}</p><button onClick={() => setTip({ key: coachTipKey, index: (activeTip + 1) % coachTips.length })}>{t("home.nextTip")} <em>{activeTip + 1}/{coachTips.length}</em></button></div></Card><Card className={styles.recentActivityCard}><div className={styles.cardHeader}><h2>{t("home.recentActivity")}</h2><button onClick={onActivity}>{t("home.seeAll")}</button></div>{recentActivity.length > 0 ? recentActivity.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onClick={() => onActivityItem(item)} />) : <div className={styles.activityEmpty}><b>{t("home.noActivity")}</b><p>{t("home.noActivityNote")}</p></div>}</Card></div>;
}
