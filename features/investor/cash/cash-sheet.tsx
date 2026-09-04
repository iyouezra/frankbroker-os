"use client";

import { useState } from "react";
import { formatEtb } from "../../../lib/investor-data";
import { getInvestorActivityStatus } from "../../../lib/investor-activity";
import styles from "../../../app/investor/investor.module.css";
import { BrandSelect } from "../../shared/brand-select";
import {
  Button,
  linkedBankNumber,
  type CashMovementInput,
  type CashMovementView,
  type CashPool,
  type LinkedBankAccount,
} from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import { INVESTOR_STATUS_KEYS } from "../../../lib/i18n/status";

export function CashSheet({ pools: configuredPools, movements, linkedBanks, availableCash, onClose, onSubmit, onViewActivity }: { pools: CashPool[]; movements: CashMovementView[]; linkedBanks: LinkedBankAccount[]; availableCash: number; onClose: () => void; onSubmit: (input: CashMovementInput) => Promise<boolean>; onViewActivity: () => void }) {
  const pools = configuredPools.length ? configuredPools : [{ id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", beneficialBalance: availableCash || 75_000 }];
  const t = useT();
  // `type` is submitted as movementType, so the values stay English.
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("15000");
  const approvedBanks = linkedBanks.filter((account) => account.status === "approved");
  const [selectedBankId, setSelectedBankId] = useState(approvedBanks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const selectedPool = pools[0];
  const selectedBank = approvedBanks.find((account) => account.id === selectedBankId) ?? approvedBanks[0];
  const value = Number(amount) || 0;
  const withdrawableCash = configuredPools.length ? availableCash : 75_000;
  const valid = Boolean(selectedPool && selectedBank && value > 0 && (type === "deposit" || value <= withdrawableCash));
  const submit = async () => {
    if (!selectedPool) return;
    setBusy(true);
    try {
      const saved = await onSubmit({
        movementType: type,
        pooledBankAccountId: selectedPool.id,
        amount: value,
        linkedBankAccountId: type === "withdrawal" ? selectedBank?.id : undefined,
        sourceLinkedBankAccountId: type === "deposit" ? selectedBank?.id : undefined,
      });
      if (saved) onClose();
    } finally { setBusy(false); }
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.cashSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="cash-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}>
        <div><small>{t("cash.clientMoney")}</small><h2 id="cash-title">{t("cash.title")}</h2></div>
        <button onClick={onClose} aria-label={t("cash.close")}>×</button>
      </div>
      <div className={styles.segmented}>
        <button className={type === "deposit" ? styles.segmentActive : ""} onClick={() => setType("deposit")}>{t("cash.addMoney")}</button>
        <button className={type === "withdrawal" ? styles.segmentActive : ""} onClick={() => setType("withdrawal")}>{t("cash.withdraw")}</button>
      </div>
      {pools.length === 0 ? <div className={styles.cashNotice}>{t("cash.noPool")}</div> : <>
        {type === "deposit" ? <>
          <label className={styles.formField}>
            <span>{t("cash.depositAmount")}</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </label>
          {approvedBanks.length > 0
            ? <label className={styles.formField}><span>{t("cash.payFromBank")}</span><BrandSelect className="bselect-investor" value={selectedBank?.id ?? ""} onChange={setSelectedBankId} ariaLabel={t("cash.payFromBank")} options={approvedBanks.map((account) => ({ value: account.id, label: `${account.bankName} · ${linkedBankNumber(account)}` }))} /></label>
            : <div className={styles.cashNotice}><b>{t("cash.noApprovedBank")}</b><span>{t("cash.noApprovedBankNote")}</span></div>}
          <div className={styles.gatewayDepositCard}>
            <span className={styles.gatewayDepositIcon}>↗</span>
            <div><small>{t("cash.gatewayEyebrow")}</small><h3>{t("cash.gatewayTitle")}</h3><p>{t("cash.gatewayIntro")}</p></div>
            <ol>
              <li><i>1</i><span><b>{t("cash.gatewayChooseTitle")}</b><small>{t("cash.gatewayChooseNote")}</small></span></li>
              <li><i>2</i><span><b>{t("cash.gatewayApproveTitle")}</b><small>{t("cash.gatewayApproveNote")}</small></span></li>
              <li><i>3</i><span><b>{t("cash.gatewayConfirmTitle")}</b><small>{t("cash.gatewayConfirmNote")}</small></span></li>
            </ol>
          </div>
          <div className={styles.gatewayDestination}>
            <span><small>{t("cash.gatewayDestination")}</small><b>{selectedPool?.accountName}</b></span>
            <em>{selectedPool?.bankName}</em>
          </div>
        </> : <>
          <div className={styles.availableCashCard}><span>{t("cash.availableToWithdraw")}</span><b>{formatEtb(withdrawableCash)}</b><small>{t("cash.pendingExcluded")}</small></div>
          <label className={styles.formField}>
            <span>{t("cash.withdrawAmount")}</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
            {value > withdrawableCash && <small className={styles.fieldError}>{t("bond.cashError")}</small>}
          </label>
          {approvedBanks.length > 0 ? <>
            <label className={styles.formField}><span>{t("cash.destinationBank")}</span><BrandSelect className="bselect-investor" value={selectedBank?.id ?? ""} onChange={setSelectedBankId} ariaLabel={t("cash.destinationBank")} options={approvedBanks.map((account) => ({ value: account.id, label: account.bankName }))} /></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>{t("onboarding.accountNumber")}</span><div><input value={selectedBank ? linkedBankNumber(selectedBank) : ""} readOnly /></div></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>{t("onboarding.accountHolder")}</span><div><input value={selectedBank?.accountHolderName ?? ""} readOnly /></div></label>
          </> : <div className={styles.cashNotice}><b>{t("cash.noApprovedBank")}</b><span>{t("cash.noApprovedBankNote")}</span></div>}
          <div className={styles.cashNotice}><b>{t("onboarding.whatNext")}</b><span>{t("cash.withdrawalNote", { amount: formatEtb(value) })}</span></div>
        </>}
        <Button className={styles.full} disabled={!valid || busy} onClick={() => void submit()}>{busy ? t("order.sending") : t(type === "deposit" ? "cash.continueToPayment" : "cash.requestWithdrawal")}</Button>
      </>}
      {movements.length > 0 && <div className={styles.cashHistory}><h3>{t("cash.recentInstructions")}</h3>{movements.slice(0, 3).map((movement) => <div key={movement.id}><span><b>{t(movement.type === "deposit" ? "cash.deposit" : "cash.withdrawal")}</b><small>{new Date(movement.submittedAt).toLocaleDateString("en-GB")} · {movement.id}</small></span><span><b>{formatEtb(movement.amount)}</b><em data-status={movement.status}>{INVESTOR_STATUS_KEYS[movement.status] ? t(INVESTOR_STATUS_KEYS[movement.status]) : getInvestorActivityStatus(movement.status)}</em></span></div>)}<button className={styles.cashActivityLink} onClick={onViewActivity}>{t("cash.seeAllActivity")}</button></div>}
    </section>
  </div>;
}
