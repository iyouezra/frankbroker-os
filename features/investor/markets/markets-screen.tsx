"use client";

import { useState } from "react";
import { formatEtb, formatMarketTimestamp, investorMarketContext, investorStocks, type InvestorBond, type InvestorStock } from "../../../lib/investor-data";
import styles from "../../../app/investor/investor.module.css";
import { Card, Icon, ScreenHeader, StockRow } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

// The asset and sector values are matched against instrument data, so they stay
// in English; only the button labels are translated.
const ASSET_LABELS = { Stocks: "markets.assetStocks", Bonds: "markets.assetBonds" } satisfies Record<string, TranslationKey>;
const SECTOR_LABELS = { All: "markets.sectorAll", Banks: "markets.sectorBanks", Telecom: "markets.sectorTelecom" } satisfies Record<string, TranslationKey>;

export function MarketsScreen({ openStock, openBond, enabledTickers, bondsEnabled, bonds }: { openStock: (stock: InvestorStock) => void; openBond: (bond: InvestorBond) => void; enabledTickers: string[] | null; bondsEnabled: boolean; bonds: InvestorBond[] }) {
  const t = useT();
  const [asset, setAsset] = useState<"Stocks" | "Bonds">("Stocks");
  const [sector, setSector] = useState("All");
  const [query, setQuery] = useState("");
  const stocks = investorStocks.filter((stock) => (!enabledTickers || enabledTickers.includes(stock.ticker)) && (sector === "All" || stock.sector === sector) && `${stock.ticker} ${stock.name}`.toLowerCase().includes(query.toLowerCase()));
  const matchingBonds = bonds.filter((bond) => (!enabledTickers || enabledTickers.includes(bond.ticker)) && `${bond.ticker} ${bond.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.screen}><ScreenHeader title={t("markets.title")} /><p className={styles.marketContext}><i />{investorMarketContext.statusLabel}<span>{t("markets.pricesUpdated", { time: formatMarketTimestamp(investorMarketContext.quoteAsOf) })}</span></p><label className={styles.searchField}><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("markets.searchPlaceholder")} /></label><div className={styles.segmented}>{(["Stocks", "Bonds"] as const).filter((item) => item === "Stocks" || bondsEnabled).map((item) => <button key={item} className={asset === item ? styles.segmentActive : ""} onClick={() => setAsset(item)}>{t(ASSET_LABELS[item])}</button>)}</div>{asset === "Stocks" || !bondsEnabled ? <><div className={styles.chips}>{["All", "Banks", "Telecom"].map((item) => <button key={item} className={sector === item ? styles.chipActive : ""} onClick={() => setSector(item)}>{t(SECTOR_LABELS[item as keyof typeof SECTOR_LABELS])}</button>)}</div><Card><p className={styles.cardIntro}>{t("markets.enabledIntro")}</p>{stocks.map((stock) => <StockRow key={stock.ticker} stock={stock} onClick={() => openStock(stock)} />)}{stocks.length === 0 && <p className={styles.empty}>{t("markets.noInstruments")}</p>}</Card></> : <Card><p className={styles.cardIntro}>{t("markets.bondsIntro")}</p>{matchingBonds.map((bond) => <button className={styles.bondRow} key={bond.ticker} onClick={() => openBond(bond)}><span><Icon name="shield" size={20} /></span><span><b>{bond.name}</b><small>{t("markets.bondMeta", { maturity: bond.maturityLabel, minimum: formatEtb(bond.minimumInvestment) })}</small></span><span><b>{bond.couponRate.toFixed(1)}%</b><small>{bond.status === "halted" ? t("markets.paused") : t("markets.coupon")}</small></span></button>)}{matchingBonds.length === 0 && <p className={styles.empty}>{t("markets.noBonds")}</p>}</Card>}</div>;
}


