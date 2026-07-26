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

export function CashSheet({ pools: configuredPools, movements, linkedBanks, availableCash, onClose, onSubmit, onViewActivity }: { pools: CashPool[]; movements: CashMovementView[]; linkedBanks: LinkedBankAccount[]; availableCash: number; onClose: () => void; onSubmit: (input: CashMovementInput) => Promise<boolean>; onViewActivity: () => void }) {
  const pools = configuredPools.length ? configuredPools : [{ id: "pool_aby_general", bankName: "Commercial Bank of Ethiopia", accountName: "Abyssinia Securities Client Money", accountNumberMasked: "•••• 4108", currency: "ETB", purpose: "general", beneficialBalance: availableCash || 75_000 }];
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
      });
      if (saved) onClose();
    } finally { setBusy(false); }
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.cashSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="cash-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}>
        <div><small>CLIENT MONEY</small><h2 id="cash-title">Move money</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={styles.segmented}>
        <button className={type === "deposit" ? styles.segmentActive : ""} onClick={() => setType("deposit")}>Add money</button>
        <button className={type === "withdrawal" ? styles.segmentActive : ""} onClick={() => setType("withdrawal")}>Withdraw</button>
      </div>
      {pools.length === 0 ? <div className={styles.cashNotice}>Your broker has not configured a client-money bank account yet.</div> : <>
        {type === "deposit" ? <>
          <div className={styles.bankInstruction}>
            <span><small>TRANSFER TO</small><b>{selectedPool?.accountName}</b></span>
            <dl>
              <div><dt>Bank</dt><dd>{selectedPool?.bankName}</dd></div>
              <div><dt>Account</dt><dd>{transferAccountNumber}</dd></div>
              <div><dt>Reference</dt><dd>Use your investor name</dd></div>
            </dl>
          </div>
          <label className={styles.formField}>
            <span>Deposit amount</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </label>
          <label className={styles.formField}>
            <span>Bank transfer reference</span>
            <div><input value={bankReference} onChange={(event) => setBankReference(event.target.value)} placeholder="e.g. CBE-FT-908231" /></div>
            <small>Your broker will use this reference to match the transfer.</small>
          </label>
          <div className={styles.uploadField}>
            <span>Receipt or deposit slip</span>
            <input id={receiptUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setReceiptFile(file);
              setProofReference(file?.name ?? "");
            }} />
            <label htmlFor={receiptUploadId}>
              <b>{receiptFile ? receiptFile.name : "Upload a document"}</b>
              <small>{receiptFile ? `${(receiptFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
              <em>{receiptFile ? "✓" : "+"}</em>
            </label>
          </div>
        </> : <>
          <div className={styles.availableCashCard}><span>AVAILABLE TO WITHDRAW</span><b>{formatEtb(withdrawableCash)}</b><small>Pending orders and withdrawals are already excluded.</small></div>
          <label className={styles.formField}>
            <span>Amount to withdraw</span>
            <div><em>ETB</em><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
            {value > withdrawableCash && <small className={styles.fieldError}>Enter an amount within your available cash.</small>}
          </label>
          {approvedBanks.length > 0 ? <>
            <label className={styles.formField}><span>Destination bank</span><BrandSelect className="bselect-investor" value={selectedDestination?.id ?? ""} onChange={setDestinationBankId} ariaLabel="Destination bank" options={approvedBanks.map((account) => ({ value: account.id, label: account.bankName }))} /></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>Account number</span><div><input value={selectedDestination ? linkedBankNumber(selectedDestination) : ""} readOnly /></div></label>
            <label className={`${styles.formField} ${styles.readOnlyField}`}><span>Account holder name</span><div><input value={selectedDestination?.accountHolderName ?? ""} readOnly /></div></label>
          </> : <div className={styles.cashNotice}><b>No approved bank account</b><span>Add a bank account under You. It will appear here after review and approval.</span></div>}
          <div className={styles.cashNotice}><b>What happens next</b><span>{formatEtb(value)} will be reserved immediately, reviewed by your broker, then debited only after payment is confirmed. Rejection or payment failure releases the reservation.</span></div>
        </>}
        <Button className={styles.full} disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Sending…" : type === "deposit" ? "Send for verification" : "Request withdrawal"}</Button>
      </>}
      {movements.length > 0 && <div className={styles.cashHistory}><h3>Recent instructions</h3>{movements.slice(0, 3).map((movement) => <div key={movement.id}><span><b>{movement.type === "deposit" ? "Deposit" : "Withdrawal"}</b><small>{new Date(movement.submittedAt).toLocaleDateString("en-GB")} · {movement.id}</small></span><span><b>{formatEtb(movement.amount)}</b><em data-status={movement.status}>{getInvestorActivityStatus(movement.status)}</em></span></div>)}<button className={styles.cashActivityLink} onClick={onViewActivity}>See all activity</button></div>}
    </section>
  </div>;
}
