"use client";

import { useRef, useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { BrandSelect } from "../../shared/brand-select";
import { LanguageSwitcher } from "../shared/language-switcher";
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
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";
import { DiscrepancySheet, ProfileCorrectionSheet, SecuritySheet, StatementsTaxSheet, type ServiceRequestInput } from "./profile-workflow-sheets";

// Menu entries whose only action is a "coming soon" toast.
const PLACEHOLDER_MENU = ["profile.helpAmharic"] as TranslationKey[];
const DOCUMENT_LABELS: Record<string, TranslationKey> = {
  proof_of_address: "doc.proof_of_address",
  business_license: "doc.business_license",
  tin_certificate: "doc.tin_certificate",
  certificate_of_incorporation: "doc.certificate_of_incorporation",
  article_of_association: "doc.article_of_association",
};
const BANK_STATUS_KEYS: Record<string, TranslationKey> = {
  pending_review: "banks.statusWaiting",
  rejected: "banks.statusRejected",
  approved: "banks.statusApproved",
};

export function ProfileScreen({ notify, name, profile, accountNumber, orders, requests, legalDocument, documents, linkedBanks, supportUnread, onOpenSupport, onOpenRequest, onAddBank, onDeleteBank, onAcceptTerms, onUpdateKyc, onRequest, onDownloadStatement, onSignOut }: { notify: (message: string) => void; name: string; profile: InvestorBootstrap["profile"]; accountNumber?: string | null; orders: NonNullable<InvestorBootstrap["account"]>["orders"]; requests: InvestorBootstrap["serviceRequests"]; legalDocument: InvestorBootstrap["tenant"]["legalDocument"]; documents: InvestorBootstrap["documents"]; linkedBanks: LinkedBankAccount[]; supportUnread: number; onOpenSupport: () => void; onOpenRequest: (threadId: string) => void; onAddBank: (bankName: string, accountNumber: string) => Promise<void>; onDeleteBank: (id: string) => Promise<void>; onAcceptTerms: () => Promise<void>; onUpdateKyc: (files: Partial<Record<string, File>>) => Promise<void>; onRequest: (input: ServiceRequestInput) => Promise<boolean>; onDownloadStatement: (from: string, to: string) => Promise<boolean>; onSignOut?: () => Promise<void> }) {
  const t = useT();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM";
  const [linkedBanksOpen, setLinkedBanksOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [workflow, setWorkflow] = useState<"statements" | "security" | "discrepancy" | "correction" | null>(null);
  const termsCurrent = Boolean(legalDocument && profile?.termsAcceptedVersion === legalDocument.version);
  const addLinkedBank = async (bankName: string, accountNumber: string) => {
    if (linkedBanks.length >= 3) return notify(t("profile.bankLimit"));
    await onAddBank(bankName, accountNumber);
  };
  const deleteLinkedBank = async (id: string) => {
    await onDeleteBank(id);
  };
  return <div className={styles.screen}>
    <ScreenHeader title={t("nav.profile")} />
    <Card className={styles.profileCard}><span>{initials}</span><div><b>{name}</b><small>{t("profile.accountLine", { status: profile?.kycStatus ?? "pending" })}</small></div><em>{profile?.proofOfAddressStatus ?? t("profile.demoChecked")}</em></Card>
    <Card className={styles.complianceCard}><div className={styles.cardHeader}><h2>{t("profile.accountRecords")}</h2><span className={styles.badge}>{termsCurrent ? t("profile.termsVersion", { version: profile?.termsAcceptedVersion ?? "" }) : t("profile.termsPending")}</span></div><dl><div><dt>{t("onboarding.accountNumber")}</dt><dd>{accountNumber ?? t("profile.pendingActivation")}</dd></div><button className={styles.recordLink} onClick={() => setAgreementOpen(true)}><span><dt>{t("profile.brokerageAgreement")}</dt><small>{t(termsCurrent ? "profile.accepted" : "profile.reviewRequired")}</small></span><dd>{legalDocument?.title ?? t("profile.brokerageTerms")} <Icon name="chevron" size={14} /></dd></button><button className={styles.recordLink} onClick={() => setKycOpen(true)}><span><dt>{t("profile.kycReview")}</dt><small>{profile?.kycStatus?.replaceAll("_", " ")}</small></span><dd>{profile?.kycReviewDueAt ? new Date(profile.kycReviewDueAt).toLocaleDateString("en-GB") : t("profile.viewDocuments")} <Icon name="chevron" size={14} /></dd></button><div><dt>{t("onboarding.fieldAddressEvidence")}</dt><dd>{profile?.proofOfAddressStatus ?? t("profile.pending")}</dd></div></dl></Card>
    <LanguageSwitcher variant="row" />
    <Card className={styles.menuCard}>
      <button onClick={onOpenSupport}><span>{t("profile.messagesSupport")}</span>{supportUnread > 0 && <em className={styles.menuBadge}>{supportUnread}</em>}<Icon name="chevron" size={18} /></button>
      <button onClick={() => setLinkedBanksOpen(true)}><span>{t("profile.linkedBanks")}</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => setWorkflow("correction")}><span>{t("profile.requestCorrection")}</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => orders.length ? setWorkflow("discrepancy") : notify(t("profile.noRecentOrder"))}><span>{t("profile.reportDiscrepancy")}</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => void onRequest({ requestType: "account_closure", description: t("request.closureDescription") })}><span>{t("profile.requestClosure")}</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => setWorkflow("statements")}><span>{t("profile.statementsTax")}</span><Icon name="chevron" size={18} /></button>
      <button onClick={() => setWorkflow("security")}><span>{t("profile.security")}</span><Icon name="chevron" size={18} /></button>
      {PLACEHOLDER_MENU.map((key) => <button key={key} onClick={() => notify(t("profile.comingSoon", { item: t(key) }))}><span>{t(key)}</span><Icon name="chevron" size={18} /></button>)}
      {onSignOut && <button onClick={() => void onSignOut()}><span>{t("auth.signOut")}</span><Icon name="chevron" size={18} /></button>}
    </Card>
    {requests.length > 0 && <Card className={styles.requestCard}><div className={styles.cardHeader}><h2>{t("profile.yourRequests")}</h2></div>{requests.slice(0, 6).map((item) => <button key={item.id} disabled={!item.threadId} onClick={() => item.threadId && onOpenRequest(item.threadId)}><span><b>{item.subject}</b><small>{new Date(item.submittedAt).toLocaleDateString("en-GB")} · {item.id}</small>{item.resolutionNotes && <small className={styles.requestOutcome}>Outcome: {item.resolutionNotes}</small>}</span><em>{item.status.replaceAll("_", " ")}</em>{item.threadId && <Icon name="chevron" size={15} />}</button>)}</Card>}
    <p className={styles.license}>{t("profile.license")}</p>
    {linkedBanksOpen && <LinkedBanksSheet accounts={linkedBanks} accountHolderName={name} onClose={() => setLinkedBanksOpen(false)} onAdd={addLinkedBank} onDelete={deleteLinkedBank} />}
    {agreementOpen && <AgreementSheet document={legalDocument} accepted={termsCurrent} onClose={() => setAgreementOpen(false)} onAccept={async () => { await onAcceptTerms(); setAgreementOpen(false); }} />}
    {kycOpen && <KycDocumentsSheet clientType={profile?.clientType ?? "individual"} documents={documents} onClose={() => setKycOpen(false)} onSubmit={async (files) => { await onUpdateKyc(files); setKycOpen(false); }} />}
    {workflow === "statements" && <StatementsTaxSheet onClose={() => setWorkflow(null)} onDownload={onDownloadStatement} onSubmit={onRequest} />}
    {workflow === "security" && <SecuritySheet profile={profile} onClose={() => setWorkflow(null)} onSubmit={onRequest} />}
    {workflow === "discrepancy" && <DiscrepancySheet orders={orders} onClose={() => setWorkflow(null)} onSubmit={onRequest} />}
    {workflow === "correction" && <ProfileCorrectionSheet onClose={() => setWorkflow(null)} onSubmit={onRequest} />}
  </div>;
}

function AgreementSheet({ document, accepted, onClose, onAccept }: { document: InvestorBootstrap["tenant"]["legalDocument"]; accepted: boolean; onClose: () => void; onAccept: () => Promise<void> }) {
  const t = useT();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.recordsSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="agreement-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}><div><small>{t("agreement.eyebrow")}</small><h2 id="agreement-title">{t("profile.brokerageAgreement")}</h2></div><button onClick={onClose} aria-label={t("cash.close")}>×</button></div>
      {document ? <><div className={styles.agreementMeta}><b>{document.title}</b><span>{t("agreement.meta", { version: document.version, date: new Date(`${document.effectiveAt}T12:00:00Z`).toLocaleDateString("en-GB") })}</span></div><div className={styles.agreementText}><p>{document.summary}</p><p>{document.content}</p></div>{accepted ? <div className={styles.recordSuccess}><Icon name="check" size={17} /><span><b>{t("agreement.currentAccepted")}</b><small>{t("agreement.onRecord", { version: document.version })}</small></span></div> : <><label className={styles.recordConsent}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("agreement.consent")}</span></label><Button className={styles.full} disabled={!confirmed || busy} onClick={() => { setBusy(true); void onAccept().finally(() => setBusy(false)); }}>{busy ? t("agreement.recording") : t("agreement.accept", { version: document.version })}</Button></>}</> : <div className={styles.cashNotice}><b>{t("agreement.none")}</b><span>{t("agreement.noneNote")}</span></div>}
    </section>
  </div>;
}

function KycDocumentsSheet({ clientType, documents, onClose, onSubmit }: { clientType: string; documents: InvestorBootstrap["documents"]; onClose: () => void; onSubmit: (files: Partial<Record<string, File>>) => Promise<void> }) {
  const types = clientType === "individual"
    ? ["proof_of_address"]
    : ["business_license", "tin_certificate", "certificate_of_incorporation", "article_of_association"];
  const t = useT();
  const [files, setFiles] = useState<Partial<Record<string, File>>>({});
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.recordsSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="kyc-documents-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}><div><small>{t("kycSheet.eyebrow")}</small><h2 id="kyc-documents-title">{t("kycSheet.title")}</h2></div><button onClick={onClose} aria-label={t("cash.close")}>×</button></div>
      <p className={styles.recordsIntro}>{t("kycSheet.intro")}</p>
      <div className={styles.kycDocumentList}>{types.map((type) => {
        const current = documents.find((document) => document.type === type);
        const label = DOCUMENT_LABELS[type] ? t(DOCUMENT_LABELS[type]) : type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        return <div key={type}><span><b>{label}</b><small>{files[type]?.name ?? current?.name ?? t("kycSheet.notUploaded")}{current ? ` · ${current.status.replaceAll("_", " ")}` : ""}</small>{current?.rejectionReason && <em>{current.rejectionReason}</em>}</span><input ref={(node) => { inputRefs.current[type] = node; }} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFiles((value) => ({ ...value, [type]: file })); }} /><button onClick={() => inputRefs.current[type]?.click()}>{t(current ? "kycSheet.replace" : "kycSheet.upload")}</button></div>;
      })}</div>
      <Button className={styles.full} disabled={!Object.keys(files).length || busy} onClick={() => { setBusy(true); void onSubmit(files).finally(() => setBusy(false)); }}>{t(busy ? "kycSheet.uploading" : "kycSheet.send")}</Button>
    </section>
  </div>;
}

function LinkedBanksSheet({ accounts, accountHolderName, onClose, onAdd, onDelete }: { accounts: LinkedBankAccount[]; accountHolderName: string; onClose: () => void; onAdd: (bankName: string, accountNumber: string) => void; onDelete: (id: string) => void }) {
  const t = useT();
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
    if (window.confirm(t("banks.confirmRemove", { bank: account.bankName, number: linkedBankNumber(account) }))) onDelete(account.id);
  };
  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={`${styles.orderSheet} ${styles.linkedBanksSheet}`} onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="linked-banks-title">
      <i className={styles.sheetHandle} />
      <div className={styles.cashSheetHead}><div><small>{t("banks.eyebrow")}</small><h2 id="linked-banks-title">{t("profile.linkedBanks")}</h2></div><button onClick={onClose} aria-label={t("cash.close")}>×</button></div>
      <div className={styles.linkedBankSummary}><span><b>{t("banks.linkedCount", { count: accounts.length })}</b><small>{t("banks.approvedNote")}</small></span></div>
      <div className={styles.linkedBankList}>
        {accounts.map((account) => <div key={account.id} className={styles.linkedBankRow}>
          <span><b>{account.bankName}</b><small>{linkedBankNumber(account)} · {account.accountHolderName}</small></span>
          <span><em data-status={account.status}>{BANK_STATUS_KEYS[account.status] ? t(BANK_STATUS_KEYS[account.status]) : linkedBankStatus(account.status)}</em><button onClick={() => remove(account)} aria-label={t("banks.deleteLabel", { bank: account.bankName })}>{t("banks.delete")}</button></span>
        </div>)}
      </div>
      {!atLimit ? <div className={styles.linkBankForm}>
        <h3>{t("banks.addTitle")}</h3>
        <label className={styles.formField}><span>{t("onboarding.bankName")}</span><BrandSelect className="bselect-investor" value={bankName} onChange={setBankName} ariaLabel={t("onboarding.bankName")} options={bankOptions.map((bank) => ({ value: bank, label: bank }))} /></label>
        <label className={styles.formField}><span>{t("onboarding.accountNumber")}</span><div><input inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder={t("onboarding.accountNumberPlaceholder")} /></div></label>
        <div className={styles.accountNameWarning}><b>{t("onboarding.nameMustMatch")}</b><span>{t("onboarding.nameCheckNote", { name: accountHolderName })}</span></div>
        <div className={styles.cashNotice}><b>{t("onboarding.whatNext")}</b><span>{t("onboarding.whatNextNote")}</span></div>
        <Button className={styles.full} disabled={!valid} onClick={add}>{t("banks.sendForApproval")}</Button>
      </div> : <div className={styles.cashNotice}><b>{t("banks.atLimit")}</b><span>{t("banks.atLimitNote")}</span></div>}
    </section>
  </div>;
}
