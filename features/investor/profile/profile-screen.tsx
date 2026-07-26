"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { BrandSelect } from "../../shared/brand-select";
import {
  Button,
  Card,
  Icon,
  ScreenHeader,
  bankOptions,
  linkedBankNumber,
  linkedBankStatus,
  type InvestorBootstrap,
  type LinkedBankAccount,
} from "../shared/investor-foundation";

export function ProfileScreen({ notify, name, profile, accountNumber, orders, requests, legalDocument, linkedBanks, supportUnread, onOpenSupport, onAddBank, onDeleteBank, onRequest }: { notify: (message: string) => void; name: string; profile: InvestorBootstrap["profile"]; accountNumber?: string | null; orders: Array<{ id: string }>; requests: InvestorBootstrap["serviceRequests"]; legalDocument: InvestorBootstrap["tenant"]["legalDocument"]; linkedBanks: LinkedBankAccount[]; supportUnread: number; onOpenSupport: () => void; onAddBank: (bankName: string, accountNumber: string) => Promise<void>; onDeleteBank: (id: string) => Promise<void>; onRequest: (requestType: "trade_discrepancy" | "account_closure" | "profile_correction", orderId?: string) => void }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM";
  const latestOrderId = orders[0]?.id;
  const [linkedBanksOpen, setLinkedBanksOpen] = useState(false);
  const addLinkedBank = async (bankName: string, accountNumber: string) => {
    if (linkedBanks.length >= 3) return notify("You can link up to 3 bank accounts.");
    await onAddBank(bankName, accountNumber);
  };
  const deleteLinkedBank = async (id: string) => {
    await onDeleteBank(id);
  };
  return <div className={styles.screen}>
    <ScreenHeader title="You" />
    <Card className={styles.profileCard}><span>{initials}</span><div><b>{name}</b><small>Investor account · KYC {profile?.kycStatus ?? "pending"}</small></div><em>{profile?.proofOfAddressStatus ?? "Demo checked"}</em></Card>
    <Card className={styles.complianceCard}><div className={styles.cardHeader}><h2>Account records</h2><span className={styles.badge}>{profile?.termsAcceptedVersion ? `Terms ${profile.termsAcceptedVersion}` : "Terms pending"}</span></div><dl><div><dt>Account number</dt><dd>{accountNumber ?? "Pending activation"}</dd></div><div><dt>Brokerage agreement</dt><dd>{legalDocument?.title ?? "Demo brokerage terms"}</dd></div><div><dt>KYC review</dt><dd>{profile?.kycReviewDueAt ? new Date(profile.kycReviewDueAt).toLocaleDateString("en-GB") : "Not scheduled"}</dd></div><div><dt>Address evidence</dt><dd>{profile?.proofOfAddressStatus ?? "Pending"}</dd></div></dl></Card>
    <Card className={styles.menuCard}>
      <button onClick={onOpenSupport}><span>Messages &amp; support</span>{supportUnread > 0 && <em className={styles.menuBadge}>{supportUnread}</em>}<Icon name="chevron" size={18} /></button>
      <button onClick={() => setLinkedBanksOpen(true)}><span>Linked bank accounts</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => onRequest("profile_correction")}><span>Request profile correction</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => latestOrderId ? onRequest("trade_discrepancy", latestOrderId) : notify("There is no recent order to report.")}><span>Report an order discrepancy</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => onRequest("account_closure")}><span>Request account closure</span><Icon name="chevron" size={18} /></button>
      {["Statements & tax", "Security", "Help in Amharic"].map((item) => <button key={item} onClick={() => notify(`${item} is ready for the next demo phase.`)}><span>{item}</span><Icon name="chevron" size={18} /></button>)}
    </Card>
    {requests.length > 0 && <Card className={styles.requestCard}><div className={styles.cardHeader}><h2>Your requests</h2></div>{requests.slice(0, 4).map((item) => <div key={item.id}><span><b>{item.subject}</b><small>{new Date(item.submittedAt).toLocaleDateString("en-GB")} · {item.id}</small></span><em>{item.status.replaceAll("_", " ")}</em></div>)}</Card>}
    <p className={styles.license}>Demo experience only. Licensing and membership statements must be verified for the deploying tenant before production.</p>
    {linkedBanksOpen && <LinkedBanksSheet accounts={linkedBanks} accountHolderName={name} onClose={() => setLinkedBanksOpen(false)} onAdd={addLinkedBank} onDelete={deleteLinkedBank} />}
  </div>;
}

function LinkedBanksSheet({ accounts, accountHolderName, onClose, onAdd, onDelete }: { accounts: LinkedBankAccount[]; accountHolderName: string; onClose: () => void; onAdd: (bankName: string, accountNumber: string) => void; onDelete: (id: string) => void }) {
  const [bankName, setBankName] = useState(bankOptions[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const atLimit = accounts.length >= 3;
  const valid = bankName.trim().length > 0 && accountNumber.replace(/\D/g, "").length >= 8 && !atLimit;
  const add = () => {
    if (!valid) return;
    onAdd(bankName, accountNumber.replace(/\D/g, ""));
    setAccountNumber("");
  };
  const remove = (account: LinkedBankAccount) => {
    if (window.confirm(`Remove ${account.bankName} ${linkedBankNumber(account)} from your linked accounts?`)) onDelete(account.id);
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.linkedBanksSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="linked-banks-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}><div><small>YOUR ACCOUNT</small><h2 id="linked-banks-title">Linked bank accounts</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
      <div className={styles.linkedBankSummary}><span><b>{accounts.length} of 3 linked</b><small>Approved accounts can receive withdrawals.</small></span></div>
      <div className={styles.linkedBankList}>
        {accounts.map((account) => <div key={account.id} className={styles.linkedBankRow}>
          <span><b>{account.bankName}</b><small>{linkedBankNumber(account)} · {account.accountHolderName}</small></span>
          <span><em data-status={account.status}>{linkedBankStatus(account.status)}</em><button onClick={() => remove(account)} aria-label={`Delete ${account.bankName} account`}>Delete</button></span>
        </div>)}
      </div>
      {!atLimit ? <div className={styles.linkBankForm}>
        <h3>Add a bank account</h3>
        <label className={styles.formField}><span>Bank name</span><BrandSelect className="bselect-investor" value={bankName} onChange={setBankName} ariaLabel="Bank name" options={bankOptions.map((bank) => ({ value: bank, label: bank }))} /></label>
        <label className={styles.formField}><span>Account number</span><div><input inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="Enter the full account number" /></div></label>
        <div className={styles.accountNameWarning}><b>Account holder name must match verified records</b><span>We will check the bank account against {accountHolderName}.</span></div>
        <div className={styles.cashNotice}><b>What happens next</b><span>Your broker reviews the account details. Once approved, the bank account will appear as a withdrawal option.</span></div>
        <Button className={styles.full} disabled={!valid} onClick={add}>Send for approval</Button>
      </div> : <div className={styles.cashNotice}><b>You have linked 3 bank accounts</b><span>Delete an account before adding another one.</span></div>}
    </section>
  </div>;
}

