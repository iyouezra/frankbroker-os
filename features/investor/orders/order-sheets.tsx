"use client";

import { useState } from "react";
import { calculateBondOrder, formatEtb, getBondPricePerUnit, type InvestorBond, type InvestorStock } from "../../../lib/investor-data";
import styles from "../../../app/investor/investor.module.css";
import {
  Button,
  Icon,
  calculateInvestorFees,
  type InvestorFeeRule,
  type InvestorOrderInput,
  type OrderCheck,
  type PlaceResult,
} from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

// Order types are submitted to the API as these exact English values, so only
// the chip labels beside them are translated.
const ORDER_TYPE_LABELS = { Market: "order.typeMarket", Limit: "order.typeLimit", "Stop-loss": "order.typeStopLoss" } satisfies Record<string, TranslationKey>;

export function OrderSheet({ stock, side, holdingQuantity, feeRule, allowedOrderTypes, onClose, onPlaced }: { stock: InvestorStock; side: "Buy" | "Sell"; holdingQuantity: number; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
  const t = useT();
  const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop-loss">("Market");
  const [quantity, setQuantity] = useState("10");
  const [limitPrice, setLimitPrice] = useState(String(Math.round(stock.price * .98)));
  const [triggerPrice, setTriggerPrice] = useState(String(Number((stock.price * .95).toFixed(stock.price >= 1_000 ? 0 : 2))));
  const [reviewing, setReviewing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [heldChecks, setHeldChecks] = useState<OrderCheck[]>([]);
  const isSell = side === "Sell";
  const isStopLoss = orderType === "Stop-loss";
  const executionPrice = orderType === "Limit" ? Number(limitPrice) || stock.price : stock.price;
  const triggerValue = Number(triggerPrice) || 0;
  const triggerValid = !isStopLoss || (triggerValue > 0 && triggerValue < stock.price);
  const shares = Number(quantity) || 0;
  const gross = shares * executionPrice;
  const fees = calculateInvestorFees(gross, feeRule);
  const candidateOptions: Array<"Market" | "Limit" | "Stop-loss"> = isSell ? ["Market", "Limit", "Stop-loss"] : ["Market", "Limit"];
  const options = candidateOptions.filter((option) => allowedOrderTypes.includes(option));
  const place = async () => {
    setPlacing(true);
    setHeldChecks([]);
    try {
      const result = await onPlaced({ symbol: stock.ticker, side: isSell ? "sell" : "buy", quantity: shares, price: executionPrice, triggerPrice: isStopLoss ? triggerValue : undefined, orderType, disclosureAccepted: true, disclosureVersion: "order-v1" });
      const failed = (result?.checks ?? []).filter((check) => !check.passed);
      if (failed.length) { setHeldChecks(failed); setReviewing(false); }
    }
    finally { setPlacing(false); }
  };
  return <>
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <section className={styles.orderSheet} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="order-title">
        <i className={styles.sheetHandle} />
        <h2 id="order-title">{t(isSell ? "order.titleSell" : "order.titleBuy", { ticker: stock.ticker })}</h2>
        <div className={styles.chips}>{options.map((option) => <button key={option} className={orderType === option ? styles.chipActive : ""} onClick={() => setOrderType(option)}>{t(ORDER_TYPE_LABELS[option])}</button>)}</div>
        <p className={styles.orderHint}>{t(orderType === "Market" ? "order.hintMarket" : orderType === "Limit" ? (isSell ? "order.hintLimitSell" : "order.hintLimitBuy") : "order.hintStopLoss")}</p>
        {orderType === "Limit" && <label className={styles.formField}><span>{t(isSell ? "order.limitSell" : "order.limitBuy")}</span><div><em>ETB</em><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>}
        {isStopLoss && <label className={styles.formField}><span>{t("order.triggerLabel")}</span><div><em>ETB</em><input inputMode="decimal" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div><small className={triggerValid ? "" : styles.fieldError}>{t(triggerValid ? "order.currentPrice" : "order.triggerError", { price: formatEtb(stock.price) })}</small></label>}
        <label className={styles.formField}><span>{t("order.shares")}</span><div><input inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} /><em>× {formatEtb(executionPrice)}</em></div><small>{isSell ? t("order.youHold", { count: holdingQuantity }) : t("order.wholeShares")}</small></label>
        <dl className={styles.orderTotals}>
          {isStopLoss && <div><dt>{t("order.triggerPrice")}</dt><dd>{formatEtb(triggerValue)}</dd></div>}
          <div><dt>{t("order.grossConsideration")}</dt><dd>{formatEtb(gross)}</dd></div>
          <div><dt>{t("order.brokerage")}</dt><dd>{formatEtb(fees.brokerage)}</dd></div>
          <div><dt>{t("order.ecmaFee")}</dt><dd>{formatEtb(fees.regulator)}</dd></div>
          <div><dt>{t("order.esxFee")}</dt><dd>{formatEtb(fees.exchange)}</dd></div>
          <div><dt>{t("order.csdFee")}</dt><dd>{formatEtb(fees.csd)}</dd></div>
          <div><dt>{t("order.totalEstimatedFees")}</dt><dd>{formatEtb(fees.total)}</dd></div>
          <div><dt>{t(isSell ? "order.netProceedsEstimated" : "order.totalCost")}</dt><dd>{formatEtb(isSell ? gross - fees.total : gross + fees.total)}</dd></div>
        </dl>
        {heldChecks.length > 0 && <div className={styles.orderAlert} role="alert"><b>{heldChecks.length === 1 ? t("order.heldOne") : t("order.heldMany", { count: heldChecks.length })}</b><ul>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}
        <Button className={styles.full} variant={isSell ? "danger" : "primary"} disabled={gross <= 0 || options.length === 0 || (isSell && shares > holdingQuantity) || !triggerValid} onClick={() => setReviewing(true)}>{t("order.review")}</Button>
      </section>
    </div>
    {reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{t("order.confirmTitle")}</h2><p>{t(isSell ? "order.confirmPrefixSell" : "order.confirmPrefixBuy")}<b>{t("order.confirmSubject", { count: shares.toFixed(0), ticker: stock.ticker })}</b>{t(isSell ? "order.confirmSuffixSell" : "order.confirmSuffixBuy")}{isStopLoss ? <>{t("order.stopLossPrefix")}<b>{formatEtb(triggerValue)}</b>{t("order.stopLossSuffix")}</> : t("order.executionRisk")}</p><dl className={styles.orderTotals}><div><dt>{t("order.orderValue")}</dt><dd>{formatEtb(gross)}</dd></div><div><dt>{t("order.brokerage")}</dt><dd>{formatEtb(fees.brokerage)}</dd></div><div><dt>{t("order.ecmaFee")}</dt><dd>{formatEtb(fees.regulator)}</dd></div><div><dt>{t("order.esxFee")}</dt><dd>{formatEtb(fees.exchange)}</dd></div><div><dt>{t("order.csdFee")}</dt><dd>{formatEtb(fees.csd)}</dd></div><div><dt>{t("order.totalFees")}</dt><dd>{formatEtb(fees.total)}</dd></div><div><dt>{t(isSell ? "order.netProceeds" : "order.totalCost")}</dt><dd>{formatEtb(isSell ? gross - fees.total : gross + fees.total)}</dd></div></dl><label className={styles.consentRow}><input type="checkbox" checked={disclosureAccepted} onChange={(event) => setDisclosureAccepted(event.target.checked)} /><i>{disclosureAccepted && <Icon name="check" size={13} />}</i><span>{t("order.disclosure")}</span></label><div><Button variant="secondary" onClick={() => setReviewing(false)}>{t("order.cancel")}</Button><Button variant={isSell ? "danger" : "primary"} disabled={placing || !disclosureAccepted} onClick={() => void place()}>{placing ? t("order.sending") : t(isSell ? "order.sell" : "order.buy")}</Button></div></section></div>}
  </>;
}

export function BondOrderSheet({ bond, availableCash, feeRule, allowedOrderTypes, onClose, onPlaced }: { bond: InvestorBond; availableCash: number; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
  const t = useT();
  const pricePerBond = getBondPricePerUnit(bond);
  const suggestedAmount = Math.ceil((bond.minimumInvestment + pricePerBond + feeRule.minimumFee) / 100) * 100;
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [reviewing, setReviewing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [heldChecks, setHeldChecks] = useState<OrderCheck[]>([]);
  const value = Number(amount) || 0;
  const allocation = calculateBondOrder(value, pricePerBond, (gross) => calculateInvestorFees(gross, feeRule).total);
  const fees = calculateInvestorFees(allocation.gross, feeRule);
  const meetsMinimum = allocation.gross >= bond.minimumInvestment;
  const hasCash = allocation.total <= availableCash;
  const limitAllowed = allowedOrderTypes.includes("Limit");
  const valid = bond.status === "tradable" && allocation.units > 0 && meetsMinimum && hasCash && limitAllowed;
  const place = async () => {
    setPlacing(true);
    setHeldChecks([]);
    try {
      const result = await onPlaced({ symbol: bond.ticker, side: "buy", quantity: allocation.units, price: pricePerBond, orderType: "Limit", disclosureAccepted: true, disclosureVersion: "order-v1" });
      const failed = (result?.checks ?? []).filter((check) => !check.passed);
      if (failed.length) {
        setHeldChecks(failed);
        setReviewing(false);
      }
    } finally { setPlacing(false); }
  };
  return <>
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <section className={`${styles.orderSheet} ${styles.bondOrderSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="bond-order-title">
        <i className={styles.sheetHandle} />
        <div className={styles.bondOrderHead}><span><small>{t("bond.eyebrow")}</small><h2 id="bond-order-title">{bond.ticker}</h2></span><em>{t("bond.limitOrder")}</em></div>
        <p className={styles.orderHint}>{t("bond.hint")}</p>
        <label className={styles.formField}><span>{t("bond.amountLabel")}</span><div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div><small>{t("bond.availableCash", { amount: formatEtb(availableCash) })}</small></label>
        {!meetsMinimum && value > 0 && <p className={styles.inlineError}>{t("bond.minimumError", { amount: formatEtb(bond.minimumInvestment) })}</p>}
        {!hasCash && <p className={styles.inlineError}>{t("bond.cashError")}</p>}
        {!limitAllowed && <p className={styles.inlineError}>{t("bond.limitDisabledError")}</p>}
        <dl className={styles.orderTotals}>
          <div><dt>{t("bond.wholeBonds")}</dt><dd>{allocation.units}</dd></div>
          <div><dt>{t("bond.pricePerBond")}</dt><dd>{formatEtb(pricePerBond)}</dd></div>
          <div><dt>{t("bond.bondValue")}</dt><dd>{formatEtb(allocation.gross)}</dd></div>
          <div><dt>{t("order.brokerage")}</dt><dd>{formatEtb(fees.brokerage)}</dd></div>
          <div><dt>{t("order.ecmaFee")}</dt><dd>{formatEtb(fees.regulator)}</dd></div>
          <div><dt>{t("order.esxFee")}</dt><dd>{formatEtb(fees.exchange)}</dd></div>
          <div><dt>{t("order.csdFee")}</dt><dd>{formatEtb(fees.csd)}</dd></div>
          <div><dt>{t("order.totalEstimatedFees")}</dt><dd>{formatEtb(fees.total)}</dd></div>
          <div><dt>{t("order.totalCost")}</dt><dd>{formatEtb(allocation.total)}</dd></div>
          <div><dt>{t("bond.amountLeft")}</dt><dd>{formatEtb(allocation.unused)}</dd></div>
        </dl>
        {heldChecks.length > 0 && <div className={styles.orderAlert} role="alert"><b>{heldChecks.length === 1 ? t("order.heldOne") : t("order.heldMany", { count: heldChecks.length })}</b><ul>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}
        <Button className={styles.full} disabled={!valid} onClick={() => setReviewing(true)}>{t("order.review")}</Button>
      </section>
    </div>
    {reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="bond-confirm-title"><h2 id="bond-confirm-title">{t("bond.confirmTitle")}</h2><p>{t("bond.confirmPrefix")}<b>{t(allocation.units === 1 ? "bond.confirmSubjectOne" : "bond.confirmSubjectMany", { count: allocation.units, ticker: bond.ticker })}</b>{t("bond.confirmSuffix")}</p><dl className={styles.orderTotals}><div><dt>{t("bond.bondValue")}</dt><dd>{formatEtb(allocation.gross)}</dd></div><div><dt>{t("order.brokerage")}</dt><dd>{formatEtb(fees.brokerage)}</dd></div><div><dt>{t("order.ecmaFee")}</dt><dd>{formatEtb(fees.regulator)}</dd></div><div><dt>{t("order.esxFee")}</dt><dd>{formatEtb(fees.exchange)}</dd></div><div><dt>{t("order.csdFee")}</dt><dd>{formatEtb(fees.csd)}</dd></div><div><dt>{t("order.totalFees")}</dt><dd>{formatEtb(fees.total)}</dd></div><div><dt>{t("order.totalCost")}</dt><dd>{formatEtb(allocation.total)}</dd></div></dl><label className={styles.consentRow}><input type="checkbox" checked={disclosureAccepted} onChange={(event) => setDisclosureAccepted(event.target.checked)} /><i>{disclosureAccepted && <Icon name="check" size={13} />}</i><span>{t("bond.disclosure")}</span></label><div><Button variant="secondary" onClick={() => setReviewing(false)}>{t("order.cancel")}</Button><Button disabled={placing || !disclosureAccepted} onClick={() => void place()}>{placing ? t("order.sending") : t("bond.buy")}</Button></div></section></div>}
  </>;
}
