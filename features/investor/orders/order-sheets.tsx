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

export function OrderSheet({ stock, side, holdingQuantity, feeRule, allowedOrderTypes, onClose, onPlaced }: { stock: InvestorStock; side: "Buy" | "Sell"; holdingQuantity: number; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
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
        <h2 id="order-title">{side} {stock.ticker}</h2>
        <div className={styles.chips}>{options.map((option) => <button key={option} className={orderType === option ? styles.chipActive : ""} onClick={() => setOrderType(option)}>{option}</button>)}</div>
        <p className={styles.orderHint}>{orderType === "Market" ? "Trades at the best available ESX price." : orderType === "Limit" ? `${side}s only at your selected price or better.` : "When the price reaches your trigger, this becomes a Market sell. The final price may be lower."}</p>
        {orderType === "Limit" && <label className={styles.formField}><span>{isSell ? "Sell at or above" : "Buy at or below"}</span><div><em>ETB</em><input inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>}
        {isStopLoss && <label className={styles.formField}><span>Trigger when price falls to</span><div><em>ETB</em><input inputMode="decimal" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value.replace(/[^0-9.]/g, ""))} /></div><small className={triggerValid ? "" : styles.fieldError}>{triggerValid ? `Current price: ${formatEtb(stock.price)}` : `Enter a price below ${formatEtb(stock.price)}.`}</small></label>}
        <label className={styles.formField}><span>Shares</span><div><input inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} /><em>× {formatEtb(executionPrice)}</em></div><small>{isSell ? `You hold ${holdingQuantity} shares` : "Enter a whole number of shares"}</small></label>
        <dl className={styles.orderTotals}>
          {isStopLoss && <div><dt>Trigger price</dt><dd>{formatEtb(triggerValue)}</dd></div>}
          <div><dt>Gross consideration</dt><dd>{formatEtb(gross)}</dd></div>
          <div><dt>Brokerage</dt><dd>{formatEtb(fees.brokerage)}</dd></div>
          {fees.regulator > 0 && <div><dt>Regulatory fee</dt><dd>{formatEtb(fees.regulator)}</dd></div>}
          {fees.exchange > 0 && <div><dt>Exchange fee</dt><dd>{formatEtb(fees.exchange)}</dd></div>}
          {fees.csd > 0 && <div><dt>CSD fee</dt><dd>{formatEtb(fees.csd)}</dd></div>}
          <div><dt>Total estimated fees</dt><dd>{formatEtb(fees.total)}</dd></div>
          <div><dt>{isSell ? "Estimated net proceeds" : "Estimated cash required"}</dt><dd>{formatEtb(isSell ? gross - fees.total : gross + fees.total)}</dd></div>
        </dl>
        {heldChecks.length > 0 && <div className={styles.orderAlert} role="alert"><b>Order held: {heldChecks.length === 1 ? "1 check needs attention" : `${heldChecks.length} checks need attention`}</b><ul>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}
        <Button className={styles.full} variant={isSell ? "danger" : "primary"} disabled={gross <= 0 || options.length === 0 || (isSell && shares > holdingQuantity) || !triggerValid} onClick={() => setReviewing(true)}>Review order</Button>
      </section>
    </div>
    {reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm order</h2><p>You&apos;re {isSell ? "selling" : "buying"} <b>{shares.toFixed(0)} shares of {stock.ticker}</b> for about <b>{formatEtb(gross)}</b>, plus estimated fees of <b>{formatEtb(fees.total)}</b>. {isStopLoss ? <>If the price reaches <b>{formatEtb(triggerValue)}</b>, this becomes a Market sell and the final price may differ.</> : "A market order can execute at a different price; a limit order may not fill."}</p><label className={styles.consentRow}><input type="checkbox" checked={disclosureAccepted} onChange={(event) => setDisclosureAccepted(event.target.checked)} /><i>{disclosureAccepted && <Icon name="check" size={13} />}</i><span>I reviewed the instrument, quantity, order type, estimated value, fee breakdown, and execution risk and authorize this instruction.</span></label><div><Button variant="secondary" onClick={() => setReviewing(false)}>Cancel</Button><Button variant={isSell ? "danger" : "primary"} disabled={placing || !disclosureAccepted} onClick={() => void place()}>{placing ? "Sending…" : side}</Button></div></section></div>}
  </>;
}

export function BondOrderSheet({ bond, availableCash, feeRule, allowedOrderTypes, onClose, onPlaced }: { bond: InvestorBond; availableCash: number; feeRule: InvestorFeeRule; allowedOrderTypes: Array<"Market" | "Limit" | "Stop-loss">; onClose: () => void; onPlaced: (order: InvestorOrderInput) => Promise<PlaceResult> }) {
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
        <div className={styles.bondOrderHead}><span><small>BUY GOVERNMENT BOND</small><h2 id="bond-order-title">{bond.ticker}</h2></span><em>Limit order</em></div>
        <p className={styles.orderHint}>Enter the most you want to spend. We will fit the largest whole number of bonds within it, including estimated fees.</p>
        <label className={styles.formField}><span>Amount to invest</span><div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div><small>Available cash: {formatEtb(availableCash)}</small></label>
        {!meetsMinimum && value > 0 && <p className={styles.inlineError}>The bond value must be at least {formatEtb(bond.minimumInvestment)}.</p>}
        {!hasCash && <p className={styles.inlineError}>Enter an amount within your available cash.</p>}
        {!limitAllowed && <p className={styles.inlineError}>Your broker has not enabled limit orders for this account.</p>}
        <dl className={styles.orderTotals}>
          <div><dt>Whole bonds</dt><dd>{allocation.units}</dd></div>
          <div><dt>Price per bond</dt><dd>{formatEtb(pricePerBond)}</dd></div>
          <div><dt>Bond value</dt><dd>{formatEtb(allocation.gross)}</dd></div>
          <div><dt>Brokerage</dt><dd>{formatEtb(fees.brokerage)}</dd></div>
          {fees.regulator > 0 && <div><dt>Regulatory fee</dt><dd>{formatEtb(fees.regulator)}</dd></div>}
          {fees.exchange > 0 && <div><dt>Exchange fee</dt><dd>{formatEtb(fees.exchange)}</dd></div>}
          {fees.csd > 0 && <div><dt>CSD fee</dt><dd>{formatEtb(fees.csd)}</dd></div>}
          <div><dt>Total required</dt><dd>{formatEtb(allocation.total)}</dd></div>
          <div><dt>Amount left</dt><dd>{formatEtb(allocation.unused)}</dd></div>
        </dl>
        {heldChecks.length > 0 && <div className={styles.orderAlert} role="alert"><b>Order held: {heldChecks.length === 1 ? "1 check needs attention" : `${heldChecks.length} checks need attention`}</b><ul>{heldChecks.map((check) => <li key={check.code}>{check.message}</li>)}</ul></div>}
        <Button className={styles.full} disabled={!valid} onClick={() => setReviewing(true)}>Review order</Button>
      </section>
    </div>
    {reviewing && <div className={styles.dialogBackdrop}><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="bond-confirm-title"><h2 id="bond-confirm-title">Confirm bond order</h2><p>You&apos;re buying <b>{allocation.units} {allocation.units === 1 ? "bond" : "bonds"} of {bond.ticker}</b> for <b>{formatEtb(allocation.gross)}</b>, plus estimated fees of <b>{formatEtb(fees.total)}</b>. This limit order may not fill.</p><label className={styles.consentRow}><input type="checkbox" checked={disclosureAccepted} onChange={(event) => setDisclosureAccepted(event.target.checked)} /><i>{disclosureAccepted && <Icon name="check" size={13} />}</i><span>I reviewed the bond, quantity, price, estimated value, fees, maturity, and execution risk and authorize this instruction.</span></label><div><Button variant="secondary" onClick={() => setReviewing(false)}>Cancel</Button><Button disabled={placing || !disclosureAccepted} onClick={() => void place()}>{placing ? "Sending…" : "Buy bond"}</Button></div></section></div>}
  </>;
}
