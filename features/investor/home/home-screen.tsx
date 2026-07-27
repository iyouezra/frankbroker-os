"use client";

import { useState } from "react";
import { coachTips, formatEtb, formatMarketTimestamp, investorHoldings, investorMarketContext, investorStocks, type InvestorStock } from "../../../lib/investor-data";
import { getRecentInvestorActivity, type InvestorActivity } from "../../../lib/investor-activity";
import styles from "../../../app/investor/investor.module.css";
import { ActivityRow } from "../activity/activity-screen";
import { AppLogo, Button, Card, Delta, Icon, StockRow, type InvestorBootstrap, type Tab } from "../shared/investor-foundation";

export function HomeScreen({ openStock, go, account, activity, restricted, demoFallback, unread, onBell, onCash, onActivity, onActivityItem }: { openStock: (stock: InvestorStock) => void; go: (tab: Tab) => void; account: InvestorBootstrap["account"]; activity: InvestorActivity[]; restricted: boolean; demoFallback: boolean; unread: number; onBell: () => void; onCash: () => void; onActivity: () => void; onActivityItem: (item: InvestorActivity) => void }) {
  const [tip, setTip] = useState(0);
  const holdings = account?.holdings.length
    ? account.holdings.filter((holding) => investorStocks.some((stock) => stock.ticker === holding.ticker))
    : demoFallback
      ? investorHoldings
      : [];
  const stockValue = holdings.reduce((sum, holding) => sum + investorStocks.find((stock) => stock.ticker === holding.ticker)!.price * holding.quantity, 0);
  const availableCash = account?.availableCash ?? (demoFallback ? 4_210 : 0);
  const totalValue = stockValue + (demoFallback ? 25_000 : 0) + availableCash;
  const recentActivity = getRecentInvestorActivity(activity);
  return <div className={styles.screen}><div className={styles.homeHeader}><AppLogo /><button className={styles.iconButton} aria-label="Notifications" onClick={onBell}><Icon name="bell" size={20} />{unread > 0 && <i />}</button></div><Card className={styles.heroCard}><small>{restricted ? "Account pending approval" : "Your money, all together"}</small><strong>{formatEtb(totalValue)}</strong><div>{!restricted && <Delta value={1.8} pill />}<span>{restricted ? "Balances will appear after account activation" : `${investorMarketContext.statusLabel} · updated ${formatMarketTimestamp(investorMarketContext.quoteAsOf)}`}</span></div></Card><Card className={styles.homeAvailableCash}><div><small>AVAILABLE CASH</small><strong>{restricted ? "Available after approval" : formatEtb(availableCash)}</strong><span>{restricted ? "Investing and withdrawals unlock when your account is approved." : "Ready to invest or withdraw. Active reservations are already excluded."}</span></div>{!restricted && <button onClick={onCash}>Manage cash <Icon name="chevron" size={15} /></button>}</Card><div className={styles.quickActions}><Button onClick={() => go("markets")}><Icon name="plus" size={18} /> {restricted ? "Explore investments" : "Invest"}</Button><Button variant="secondary" disabled={restricted} onClick={onCash}>Add or withdraw</Button></div><Card><div className={styles.cardHeader}><h2>Companies you own</h2><button onClick={() => go("portfolio")}>Details</button></div>{holdings.length ? holdings.map((holding) => { const stock = investorStocks.find((item) => item.ticker === holding.ticker)!; return <StockRow key={stock.ticker} stock={stock} holdingValue={stock.price * holding.quantity} onClick={() => openStock(stock)} />; }) : <div className={styles.activityEmpty}><b>No holdings yet</b><p>Your investments will appear after approval and your first completed order.</p></div>}</Card><Card className={styles.coachCard}><span><Icon name="bulb" size={20} /></span><div><small>FRANK COACH</small><h3>{coachTips[tip].title}</h3><p>{coachTips[tip].body}</p><button onClick={() => setTip((tip + 1) % coachTips.length)}>Next tip <em>{tip + 1}/{coachTips.length}</em></button></div></Card><Card className={styles.recentActivityCard}><div className={styles.cardHeader}><h2>Recent activity</h2><button onClick={onActivity}>See all</button></div>{recentActivity.length > 0 ? recentActivity.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onClick={() => onActivityItem(item)} />) : <div className={styles.activityEmpty}><b>No activity yet</b><p>Your orders and money movements will appear here.</p></div>}</Card></div>;
}
