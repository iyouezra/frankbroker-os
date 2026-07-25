"use client";

import { useState } from "react";
import { formatEtb, formatMarketTimestamp, investorMarketContext, investorStocks, type InvestorBond, type InvestorStock } from "../../../lib/investor-data";
import styles from "../../../app/investor/investor.module.css";
import { Card, Icon, ScreenHeader, StockRow } from "../shared/investor-foundation";

export function MarketsScreen({ openStock, openBond, enabledTickers, bondsEnabled, bonds }: { openStock: (stock: InvestorStock) => void; openBond: (bond: InvestorBond) => void; enabledTickers: string[] | null; bondsEnabled: boolean; bonds: InvestorBond[] }) {
  const [asset, setAsset] = useState<"Stocks" | "Bonds">("Stocks");
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const stocks = investorStocks.filter((stock) => (!enabledTickers || enabledTickers.includes(stock.ticker)) && (sector === "All" || stock.sector === sector) && `${stock.ticker} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  const matchingBonds = bonds.filter((bond) => (!enabledTickers || enabledTickers.includes(bond.ticker)) && `${bond.ticker} ${bond.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.screen}><ScreenHeader title="Markets" /><p className={styles.marketContext}><i />{investorMarketContext.statusLabel}<span>Prices updated {formatMarketTimestamp(investorMarketContext.quoteAsOf)}</span></p><label className={styles.searchField}><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies or tickers" /></label><div className={styles.segmented}>{(["Stocks", "Bonds"] as const).filter((item) => item === "Stocks" || bondsEnabled).map((item) => <button key={item} className={asset === item ? styles.segmentActive : ""} onClick={() => setAsset(item)}>{item}</button>)}</div>{asset === "Stocks" || !bondsEnabled ? <><div className={styles.chips}>{["All", "Banks", "Telecom"].map((item) => <button key={item} className={sector === item ? styles.chipActive : ""} onClick={() => setSector(item)}>{item}</button>)}</div><Card><p className={styles.cardIntro}>Companies enabled by your broker</p>{stocks.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}{stocks.length === 0 && <p className={styles.empty}>No enabled instruments match this search.</p>}</Card></> : <Card><p className={styles.cardIntro}>Bonds let you lend money and earn regular interest.</p>{matchingBonds.map((bond) => <button className={styles.bondRow} key={bond.ticker} onClick={() => openBond(bond)}><span><Icon name="shield" size={20} /></span><span><b>{bond.name}</b><small>Matures {bond.maturityLabel} · from {formatEtb(bond.minimumInvestment)}</small></span><span><b>{bond.couponRate.toFixed(1)}%</b><small>{bond.status === "halted" ? "paused" : "coupon"}</small></span></button>)}{matchingBonds.length === 0 && <p className={styles.empty}>No enabled bonds match this search.</p>}</Card>}</div>;
}


