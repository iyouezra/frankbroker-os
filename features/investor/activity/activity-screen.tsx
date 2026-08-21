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
import { useT, type Translate } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";
import { INVESTOR_STATUS_KEYS } from "../../../lib/i18n/status";
import { orderValidityLabel } from "../../../lib/order-input";

// Filter values drive filterInvestorActivity, so they stay English.
const FILTERS = [["all", "activity.filterAll"], ["orders", "activity.filterOrders"], ["trades", "activity.filterTrades"], ["money", "activity.filterMoney"]] as const satisfies ReadonlyArray<readonly [InvestorActivityFilter, TranslationKey]>;
// `activity.typeStopLoss` is "Stop-Loss" here but "Stop-loss" on the order
// sheet; both match the English each screen rendered before translation.
const ORDER_TYPE_KEYS: Record<string, TranslationKey> = { market: "order.typeMarket", limit: "order.typeLimit", stop_loss: "activity.typeStopLoss" };

/** Translates a status, falling back to the English label for unknown values. */
function statusLabel(status: string, t: Translate) {
  const key = INVESTOR_STATUS_KEYS[status];
  return key ? t(key) : getInvestorActivityStatus(status);
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));
}

function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));
}

function formatActivityQuantity(value: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 8 }).format(value);
}

function activityTitle(item: InvestorActivity, t: Translate) {
  if (item.kind === "order") return t(item.side === "buy" ? "activity.buyOrder" : "activity.sellOrder", { quantity: formatActivityQuantity(item.quantity), ticker: item.ticker });
  if (item.kind === "trade") return t(item.side === "buy" ? "activity.bought" : "activity.sold", { quantity: formatActivityQuantity(item.quantity), ticker: item.ticker });
  return t(item.movementType === "deposit" ? "activity.moneyAdded" : "cash.withdrawal");
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
  const t = useT();
  return <button className={styles.activityRow} onClick={onClick}>
    <span className={styles.activityIcon} data-kind={item.kind}><Icon name={activityIcon(item)} size={18} /></span>
    <span className={styles.activityIdentity}><b>{activityTitle(item, t)}</b><small>{formatActivityDate(item.occurredAt)}</small></span>
    <span className={styles.activityValue}><b>{formatEtb(activityAmount(item))}</b><em data-tone={getInvestorActivityTone(item.status)}>{statusLabel(item.status, t)}</em></span>
    <Icon name="chevron" size={15} />
  </button>;
}

function ActivityDetail({ item }: { item: InvestorActivity }) {
  const t = useT();
  const rows: Array<[string, ReactNode]> = item.kind === "order"
    ? [
        [t("activity.companyOrBond"), `${item.instrumentName} (${item.ticker})`],
        [t("activity.action"), t(item.side === "buy" ? "order.buy" : "order.sell")],
        [t("activity.orderTypeLabel"), ORDER_TYPE_KEYS[item.orderType] ? t(ORDER_TYPE_KEYS[item.orderType]) : item.orderType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())],
        [t("order.validity"), orderValidityLabel(item.validity, item.goodTillDate)],
        [t("activity.quantity"), formatActivityQuantity(item.quantity)],
        [t("activity.priceLabel"), formatEtb(item.price)],
        ...(item.triggerPrice ? [[t("order.triggerPrice"), formatEtb(item.triggerPrice)] as [string, ReactNode]] : []),
        [t("activity.filled"), formatActivityQuantity(item.filledQuantity)],
        [t("activity.estimatedFees"), formatEtb(item.estimatedFees)],
        [t("activity.estimatedTotal"), formatEtb(item.estimatedNet)],
        [t("activity.submitted"), formatActivityDateTime(item.submittedAt)],
        [t("cash.reference"), item.reference],
        ...(item.rejectionReason ? [[t("activity.whyNotApproved"), item.rejectionReason] as [string, ReactNode]] : []),
      ]
    : item.kind === "trade"
      ? [
          [t("activity.companyOrBond"), `${item.instrumentName} (${item.ticker})`],
          [t("activity.action"), t(item.side === "buy" ? "activity.boughtAction" : "activity.soldAction")],
          [t("activity.quantity"), formatActivityQuantity(item.quantity)],
          [t("activity.executionPrice"), formatEtb(item.executionPrice)],
          [t("activity.grossValue"), formatEtb(item.grossAmount)],
          [t("activity.fees"), formatEtb(item.fees)],
          [t(item.side === "buy" ? "activity.totalPaid" : "activity.totalReceived"), formatEtb(item.netAmount)],
          [t("activity.tradeDate"), formatActivityDate(`${item.tradeDate}T12:00:00Z`)],
          [t("activity.settlementDate"), formatActivityDate(`${item.settlementDate}T12:00:00Z`)],
          [t("activity.settlement"), statusLabel(item.settlementStatus, t)],
          [t("cash.reference"), item.reference],
        ]
      : [
          [t("activity.type"), t(item.movementType === "deposit" ? "cash.deposit" : "cash.withdrawal")],
          [t("activity.amount"), formatEtb(item.amount)],
          ...(item.bankName ? [[t("cash.bank"), item.bankName] as [string, ReactNode]] : []),
          ...(item.accountName ? [[t("activity.accountHolder"), item.accountName] as [string, ReactNode]] : []),
          ...(item.accountMasked ? [[t("cash.account"), item.accountMasked] as [string, ReactNode]] : []),
          ...(item.bankReference ? [[t("activity.bankReference"), item.bankReference] as [string, ReactNode]] : []),
          [t("activity.submitted"), formatActivityDateTime(item.submittedAt)],
          ...(item.reviewedAt ? [[t("activity.reviewed"), formatActivityDateTime(item.reviewedAt)] as [string, ReactNode]] : []),
          ...(item.completedAt ? [[t("activity.completedAt"), formatActivityDateTime(item.completedAt)] as [string, ReactNode]] : []),
          [t("cash.reference"), item.reference],
          ...(item.rejectionReason ? [[t("activity.whyNotApproved"), item.rejectionReason] as [string, ReactNode]] : []),
          ...(item.failureReason ? [[t("activity.whyFailed"), item.failureReason] as [string, ReactNode]] : []),
        ];
  return <>
    <Card className={styles.activityDetailHero}>
      <span className={styles.activityIcon} data-kind={item.kind}><Icon name={activityIcon(item)} size={20} /></span>
      <div><small>{t(item.kind === "order" ? "activity.kindOrder" : item.kind === "trade" ? "activity.kindTrade" : "activity.kindMoney")}</small><h2>{activityTitle(item, t)}</h2><b>{formatEtb(activityAmount(item))}</b></div>
      <em data-tone={getInvestorActivityTone(item.status)}>{statusLabel(item.status, t)}</em>
    </Card>
    <Card className={styles.activityDetailCard}><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Card>
  </>;
}

export function ActivityScreen({ activity, initialItem, onBack }: { activity: InvestorActivity[]; initialItem: InvestorActivity | null; onBack: () => void }) {
  const t = useT();
  const [filter, setFilter] = useState<InvestorActivityFilter>("all");
  const [selected, setSelected] = useState<InvestorActivity | null>(initialItem);
  const topRef = useRef<HTMLDivElement>(null);
  const filtered = filterInvestorActivity(activity, filter);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  return <div className={styles.screen} ref={topRef}>
    <ScreenHeader title={t(selected ? "activity.detailsTitle" : "activity.title")} onBack={() => selected ? setSelected(null) : onBack()} />
    {selected ? <ActivityDetail item={selected} /> : <>
      <p className={styles.activityIntro}>{t("activity.intro")}</p>
      <div className={styles.activityFilters}>{FILTERS.map(([value, labelKey]) => <button key={value} className={filter === value ? styles.activityFilterActive : ""} onClick={() => setFilter(value)}>{t(labelKey)}</button>)}</div>
      <Card className={styles.activityList}>{filtered.length > 0 ? filtered.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} onClick={() => setSelected(item)} />) : <div className={styles.activityEmpty}><Icon name="order" size={24} /><b>{t("activity.empty")}</b><p>{t("activity.emptyNote")}</p></div>}</Card>
    </>}
  </div>;
}
