"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatEtb } from "../../../lib/investor-data";
import {
  filterInvestorActivity,
  getInvestorActivityStatus,
  getInvestorActivityTone,
  type InvestorActivity,
  type InvestorActivityFilter,
} from "../../../lib/investor-activity";
import styles from "../../../app/investor/investor.module.css";
import { Card, Icon, ScreenHeader, type IconName } from "../shared/investor-foundation";

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));
}

function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));
}

function formatActivityQuantity(value: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 8 }).format(value);
}

function activityTitle(item: InvestorActivity) {
  if (item.kind === "order") return `${item.side === "buy" ? "Buy" : "Sell"} order for ${formatActivityQuantity(item.quantity)} ${item.ticker}`;
  if (item.kind === "trade") return `${item.side === "buy" ? "Bought" : "Sold"} ${formatActivityQuantity(item.quantity)} ${item.ticker}`;
  return item.movementType === "deposit" ? "Money added" : "Withdrawal";
}

function activityAmount(item: InvestorActivity) {
  if (item.kind === "order") return item.estimatedNet;
  if (item.kind === "trade") return item.netAmount;
  return item.amount;
}

function activityIcon(item: InvestorActivity): IconName {
  if (item.kind === "order") return "order";
  if (item.kind === "trade") return "markets";
  return "money";
}

export function ActivityRow({ item, onClick }: { item: InvestorActivity; onClick: () => void }) {
  return <button className={styles.activityRow} onClick={onClick}>
    <span className={styles.activityIcon} data-kind={item.kind}><Icon name={activityIcon(item)} size={18} /></span>
    <span className={styles.activityIdentity}><b>{activityTitle(item)}</b><small>{formatActivityDate(item.occurredAt)}</small></span>
    <span className={styles.activityValue}><b>{formatEtb(activityAmount(item))}</b><em data-tone={getInvestorActivityTone(item.status)}>{getInvestorActivityStatus(item.status)}</em></span>
    <Icon name="chevron" size={15} />
  </button>;
}

function ActivityDetail({ item }: { item: InvestorActivity }) {
  const rows: Array<[string, ReactNode]> = item.kind === "order"
    ? [
        ["Company or bond", `${item.instrumentName} (${item.ticker})`],
        ["Action", item.side === "buy" ? "Buy" : "Sell"],
        ["Order type", item.orderType === "stop_loss" ? "Stop-Loss" : item.orderType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())],
        ["Quantity", formatActivityQuantity(item.quantity)],
        ["Price", formatEtb(item.price)],
        ...(item.triggerPrice ? [["Trigger price", formatEtb(item.triggerPrice)] as [string, ReactNode]] : []),
        ["Filled", formatActivityQuantity(item.filledQuantity)],
        ["Estimated fees", formatEtb(item.estimatedFees)],
        ["Estimated total", formatEtb(item.estimatedNet)],
        ["Submitted", formatActivityDateTime(item.submittedAt)],
        ["Reference", item.reference],
        ...(item.rejectionReason ? [["Why it was not approved", item.rejectionReason] as [string, ReactNode]] : []),
      ]
    : item.kind === "trade"
      ? [
          ["Company or bond", `${item.instrumentName} (${item.ticker})`],
          ["Action", item.side === "buy" ? "Bought" : "Sold"],
          ["Quantity", formatActivityQuantity(item.quantity)],
          ["Execution price", formatEtb(item.executionPrice)],
          ["Gross value", formatEtb(item.grossAmount)],
          ["Fees", formatEtb(item.fees)],
          [item.side === "buy" ? "Total paid" : "Total received", formatEtb(item.netAmount)],
          ["Trade date", formatActivityDate(`${item.tradeDate}T12:00:00Z`)],
          ["Settlement date", formatActivityDate(`${item.settlementDate}T12:00:00Z`)],
          ["Settlement", getInvestorActivityStatus(item.settlementStatus)],
          ["Reference", item.reference],
        ]
      : [
          ["Type", item.movementType === "deposit" ? "Deposit" : "Withdrawal"],
          ["Amount", formatEtb(item.amount)],
          ...(item.bankName ? [["Bank", item.bankName] as [string, ReactNode]] : []),
          ...(item.accountName ? [["Account holder", item.accountName] as [string, ReactNode]] : []),
          ...(item.accountMasked ? [["Account", item.accountMasked] as [string, ReactNode]] : []),
          ...(item.bankReference ? [["Bank reference", item.bankReference] as [string, ReactNode]] : []),
          ["Submitted", formatActivityDateTime(item.submittedAt)],
          ...(item.reviewedAt ? [["Reviewed", formatActivityDateTime(item.reviewedAt)] as [string, ReactNode]] : []),
          ...(item.completedAt ? [["Completed", formatActivityDateTime(item.completedAt)] as [string, ReactNode]] : []),
          ["Reference", item.reference],
          ...(item.rejectionReason ? [["Why it was not approved", item.rejectionReason] as [string, ReactNode]] : []),
          ...(item.failureReason ? [["Why it failed", item.failureReason] as [string, ReactNode]] : []),
        ];
  return <>
    <Card className={styles.activityDetailHero}>
      <span className={styles.activityIcon} data-kind={item.kind}><Icon name={activityIcon(item)} size={20} /></span>
      <div><small>{item.kind === "money" ? "MONEY" : item.kind.toUpperCase()}</small><h2>{activityTitle(item)}</h2><b>{formatEtb(activityAmount(item))}</b></div>
      <em data-tone={getInvestorActivityTone(item.status)}>{getInvestorActivityStatus(item.status)}</em>
    </Card>
    <Card className={styles.activityDetailCard}><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Card>
  </>;
}

export function ActivityScreen({ activity, initialItem, onBack }: { activity: InvestorActivity[]; initialItem: InvestorActivity | null; onBack: () => void }) {
  const [filter, setFilter] = useState<InvestorActivityFilter>("all");
  const [selected, setSelected] = useState<InvestorActivity | null>(initialItem);
  const topRef = useRef<HTMLDivElement>(null);
  const filtered = filterInvestorActivity(activity, filter);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  return <div className={styles.screen} ref={topRef}>
    <ScreenHeader title={selected ? "Activity details" : "Activity"} onBack={() => selected ? setSelected(null) : onBack()} />
    {selected ? <ActivityDetail item={selected} /> : <>
      <p className={styles.activityIntro}>Orders, trades, deposits, and withdrawals in one place.</p>
      <div className={styles.activityFilters}>{([
        ["all", "All"],
        ["orders", "Orders"],
        ["trades", "Trades"],
        ["money", "Money"],
      ] as Array<[InvestorActivityFilter, string]>).map(([value, label]) => <button key={value} className={filter === value ? styles.activityFilterActive : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <Card className={styles.activityList}>{filtered.length > 0 ? filtered.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onClick={() => setSelected(item)} />) : <div className={styles.activityEmpty}><Icon name="order" size={24} /><b>No activity here yet</b><p>Your account updates will appear here.</p></div>}</Card>
    </>}
  </div>;
}

