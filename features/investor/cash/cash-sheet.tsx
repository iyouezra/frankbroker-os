"use client";

import { useId, useState } from "react";
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
  const [bankReference, setBankReference] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const approvedBanks = linkedBanks.filter((account) => account.status === "approved");
  const [destinationBankId, setDestinationBankId] = useState(approvedBanks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const receiptUploadId = useId();
  const selectedPool = pools[0];
  const selectedDestination = approvedBanks.find((account) => account.id === destinationBankId) ?? approvedBanks[0];
  const accountNumbers: Record<string, string> = {
    pool_aby_general: "100057894108",
    pool_aby_fixed_income: "100057897721",
  };
  const transferAccountNumber = selectedPool ? accountNumbers[selectedPool.id] ?? selectedPool.accountNumberMasked.replace(/[•\s]/g, "") : "";
  const value = Number(amount) || 0;
  const withdrawableCash = configuredPools.length ? availableCash : 75_000;
  const valid = Boolean(selectedPool && value > 0 && (type === "deposit" ? bankReference.trim() : selectedDestination && value <= withdrawableCash));
  const submit = async () => {
    if (!selectedPool) return;
    setBusy(true);
    try {
      const saved = await onSubmit({
        movementType: type,
        pooledBankAccountId: selectedPool.id,
        amount: value,
        bankReference,
        proofReference,
        linkedBankAccountId: selectedDestination?.id,
        proofFile: receiptFile ?? undefined,
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
          <div className={styles.bankInstruction}>
            <span><small>{t("cash.transferTo")}</small><b>{selectedPool?.accountName}</b></span>
            <dl>
              <div><dt>{t("cash.bank")}</dt><dd>{selectedPool?.bankName}</dd></div>
              <div><dt>{t("cash.account")}</dt><dd>{transferAccountNumber}</dd></div>
              <div><dt>{t("cash.reference")}</dt><dd>{t("cash.useInvestorName")}</dd></div>
            </dl>
          </div>
          <label className={styles.formField}>
            <span>{t("cash.depositAmount")}</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </label>
          <label className={styles.formField}>
            <span>{t("cash.transferReference")}</span>
            <div><input value={bankReference} onChange={(event) => setBankReference(event.target.value)} placeholder={t("cash.transferReferencePlaceholder")} /></div>
            <small>{t("cash.transferReferenceHint")}</small>
          </label>
          <div className={styles.uploadField}>
            <span>{t("cash.receipt")}</span>
            <input id={receiptUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setReceiptFile(file);
              setProofReference(file?.name ?? "");
            }} />
            <label htmlFor={receiptUploadId}>
              <b>{receiptFile ? receiptFile.name : t("cash.uploadDocument")}</b>
              <small>{receiptFile ? t("onboarding.fileChosen", { size: (receiptFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
              <em>{receiptFile ? "✓" : "+"}</em>
            </label>
          </div>
        </> : <>
          <div className={styles.availableCashCard}><span>{t("cash.availableToWithdraw")}</span><b>{formatEtb(withdrawableCash)}</b><small>{t("cash.pendingExcluded")}</small></div>
          <label className={styles.formField}>
            <span>{t("cash.withdrawAmount")}</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
            {value > withdrawableCash && <small className={styles.fieldError}>{t("bond.cashError")}</small>}
          </label>
          {approvedBanks.length > 0 ? <>
            <label className={styles.formField}><span>{t("cash.destinationBank")}</span><BrandSelect className="bselect-investor" value={selectedDestination?.id ?? ""} onChange={setDestinationBankId} ariaLabel={t("cash.destinationBank")} options={approvedBanks.map((account) => ({ value: account.id, label: account.bankName }))} /></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>{t("onboarding.accountNumber")}</span><div><input value={selectedDestination ? linkedBankNumber(selectedDestination) : ""} readOnly /></div></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>{t("onboarding.accountHolder")}</span><div><input value={selectedDestination?.accountHolderName ?? ""} readOnly /></div></label>
          </> : <div className={styles.cashNotice}><b>{t("cash.noApprovedBank")}</b><span>{t("cash.noApprovedBankNote")}</span></div>}
          <div className={styles.cashNotice}><b>{t("onboarding.whatNext")}</b><span>{t("cash.withdrawalNote", { amount: formatEtb(value) })}</span></div>
        </>}
        <Button className={styles.full} disabled={!valid || busy} onClick={() => void submit()}>{busy ? t("order.sending") : t(type === "deposit" ? "cash.sendForVerification" : "cash.requestWithdrawal")}</Button>
      </>}
      {movements.length > 0 && <div className={styles.cashHistory}><h3>{t("cash.recentInstructions")}</h3>{movements.slice(0, 3).map((movement) => <div key={movement.id}><span><b>{t(movement.type === "deposit" ? "cash.deposit" : "cash.withdrawal")}</b><small>{new Date(movement.submittedAt).toLocaleDateString("en-GB")} · {movement.id}</small></span><span><b>{formatEtb(movement.amount)}</b><em data-status={movement.status}>{INVESTOR_STATUS_KEYS[movement.status] ? t(INVESTOR_STATUS_KEYS[movement.status]) : getInvestorActivityStatus(movement.status)}</em></span></div>)}<button className={styles.cashActivityLink} onClick={onViewActivity}>{t("cash.seeAllActivity")}</button></div>}
    </section>
  </div>;
}
