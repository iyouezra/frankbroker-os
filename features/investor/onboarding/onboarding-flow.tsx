"use client";

import Image from "next/image";
import { useId, useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { BrandSelect } from "../../shared/brand-select";
import {
  AllocationBar,
  Button,
  Card,
  Icon,
  KycField,
  KycProgress,
  ProgressDots,
  bankOptions,
  emptyInvestorKyc,
  type InvestorBootstrap,
  type InvestorKyc,
  type LinkedBankAccount,
  type OnboardingSubmission,
} from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

// Stored values are sent to the API and compared against saved records, so they
// stay in English; only the labels beside them are translated.
const PROOF_TYPES = [["Drivers License", "onboarding.proofDriversLicense"], ["Kebele ID", "onboarding.proofKebeleId"]] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;
const STRATEGY_LABELS = { Steady: "strategy.steady", Growth: "strategy.growth", Balanced: "strategy.balanced" } satisfies Record<string, TranslationKey>;
const STRATEGY_NOTES = { Steady: "strategy.steadyNote", Growth: "strategy.growthNote", Balanced: "strategy.balancedNote" } satisfies Record<string, TranslationKey>;

function KycOnboarding({ initialAccountType, onBack, onVerifyIdentity, onComplete, legalDocument }: { initialAccountType: InvestorKyc["accountType"]; onBack: () => void; onVerifyIdentity: (phone: string) => Promise<string | null>; onComplete: (submission: OnboardingSubmission) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<InvestorKyc>(() => emptyInvestorKyc(initialAccountType));
  const [consent, setConsent] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [businessLicenseFile, setBusinessLicenseFile] = useState<File | null>(null);
  const [tinCertificateFile, setTinCertificateFile] = useState<File | null>(null);
  const [certificateOfIncorporationFile, setCertificateOfIncorporationFile] = useState<File | null>(null);
  const [articleOfAssociationFile, setArticleOfAssociationFile] = useState<File | null>(null);
  const [verifyingIdentity, setVerifyingIdentity] = useState(false);
  const proofUploadId = useId();
  const businessLicenseUploadId = useId();
  const tinCertificateUploadId = useId();
  const certificateOfIncorporationUploadId = useId();
  const articleOfAssociationUploadId = useId();
  const [linkedBanks, setLinkedBanks] = useState<LinkedBankAccount[]>([
    { id: "onboarding_bank_1", bankName: bankOptions[0], accountNumber: "", accountHolderName: "", status: "pending" },
  ]);
  const update = (field: keyof InvestorKyc, value: string | boolean) => setProfile((current) => ({
    ...current,
    [field]: value,
    ...(field === "phone" ? { verificationId: undefined } : {}),
  }));
  const chooseType = (accountType: InvestorKyc["accountType"]) => {
    const nextProfile = emptyInvestorKyc(accountType);
    setProfile(nextProfile);
    setProofFile(null);
    setBusinessLicenseFile(null);
    setTinCertificateFile(null);
    setCertificateOfIncorporationFile(null);
    setArticleOfAssociationFile(null);
    setLinkedBanks([{ id: "onboarding_bank_1", bankName: bankOptions[0], accountNumber: "", accountHolderName: "", status: "pending" }]);
  };
  const updateLinkedBank = (id: string, field: "bankName" | "accountNumber" | "accountHolderName", value: string) => {
    setLinkedBanks((current) => current.map((account) => account.id === id ? { ...account, [field]: value } : account));
  };
  const addLinkedBank = () => {
    if (linkedBanks.length >= 3) return;
    setLinkedBanks((current) => [...current, { id: crypto.randomUUID(), bankName: bankOptions[0], accountNumber: "", accountHolderName: profile.fullName, status: "pending" }]);
  };
  const removeLinkedBank = (id: string) => {
    if (linkedBanks.length <= 1) return;
    setLinkedBanks((current) => current.filter((account) => account.id !== id));
  };
  const phoneValid = profile.phone.replace(/\D/g, "").length >= 9;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) && profile.email.length <= 160;
  const faydaValid = /^\d{16}$/.test(profile.faydaId);
  const tinValid = /^\d{10}(?:-\d{2})?$/.test(profile.tin);
  const firstStepValid = profile.fullName.trim().length >= 3 && phoneValid && emailValid;
  const identityStepValid = faydaValid
    && tinValid
    && profile.pepStatus !== "not_declared"
    && (profile.accountType === "retail" || (profile.address.trim().length >= 4 && profile.registrationNumber.trim().length >= 4 && profile.representativeName.trim().length >= 3 && profile.beneficialOwnerName.trim().length >= 3));
  const bankStepValid = linkedBanks.length > 0 && linkedBanks.length <= 3 && linkedBanks.every((account) =>
    account.bankName.trim().length > 0
    && account.accountNumber.replace(/\D/g, "").length >= 8
    && account.accountHolderName.trim().toLocaleLowerCase() === profile.fullName.trim().toLocaleLowerCase()
  );
  const masked = (value: string) => value.length <= 4 ? value : `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}`;

  if (step === 4) return <div className={styles.onboarding}>
    <KycProgress step={4} />
    <div className={styles.kycComplete}>
      <span><Icon name="check" size={24} /></span>
      <small>{t("onboarding.demoCheckComplete")}</small>
      <h1>{t("onboarding.detailsReady")}</h1>
      <p>{t("onboarding.detailsReadyNote")}</p>
      <Card className={styles.kycStatusCard}>
        <div><i><Icon name="check" size={14} /></i><span><b>{t("onboarding.faydaFormat")}</b><small>{t("onboarding.faydaFormatNote")}</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>{t("onboarding.taxInfo")}</b><small>{t("onboarding.taxInfoNote")}</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>{t("onboarding.linkedBanks")}</b><small>{t(linkedBanks.length === 1 ? "onboarding.banksSubmittedOne" : "onboarding.banksSubmittedMany", { count: linkedBanks.length })}</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>{t("onboarding.accountType")}</b><small>{t(profile.accountType === "retail" ? "onboarding.retailInvestor" : "onboarding.institution")}</small></span></div>
      </Card>
    </div>
    <Button className={styles.full} onClick={() => {
      onComplete({
        profile,
        linkedBanks,
        documents: {
          ...(proofFile ? { proof_of_address: proofFile } : {}),
          ...(businessLicenseFile ? { business_license: businessLicenseFile } : {}),
          ...(tinCertificateFile ? { tin_certificate: tinCertificateFile } : {}),
          ...(certificateOfIncorporationFile ? { certificate_of_incorporation: certificateOfIncorporationFile } : {}),
          ...(articleOfAssociationFile ? { article_of_association: articleOfAssociationFile } : {}),
        },
      });
    }}>{t("onboarding.setStrategy")}</Button>
  </div>;

  if (step === 3) return <div className={styles.onboarding}>
    <KycProgress step={3} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(2)} aria-label={t("common.back")}><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>{t("onboarding.checkConsent")}</h1><p>{t("onboarding.checkConsentNote")}</p></div>
    <Card className={styles.kycReview}><dl>
      <div><dt>{t("onboarding.fieldAccount")}</dt><dd>{t(profile.accountType === "retail" ? "onboarding.retailInvestor" : "onboarding.institution")}</dd></div>
      <div><dt>{t("onboarding.fieldLegalName")}</dt><dd>{profile.fullName}</dd></div>
      <div><dt>{t("onboarding.fieldEmail")}</dt><dd>{profile.email}</dd></div>
      {profile.accountType === "institution" && <>
        <div><dt>{t("onboarding.fieldRepresentative")}</dt><dd>{profile.representativeName}</dd></div>
        <div><dt>{t("onboarding.fieldBeneficialOwner")}</dt><dd>{profile.beneficialOwnerName}</dd></div>
        <div><dt>{t("onboarding.fieldRegistration")}</dt><dd>{profile.registrationNumber}</dd></div>
      </>}
      <div><dt>{t("onboarding.fieldFaydaId")}</dt><dd>{masked(profile.faydaId)}</dd></div>
      <div><dt>{t("onboarding.fieldTin")}</dt><dd>{masked(profile.tin)}</dd></div>
      <div><dt>{t("onboarding.fieldPep")}</dt><dd>{t(profile.pepStatus === "not_pep" ? "onboarding.pepNone" : profile.pepStatus === "pep" ? "onboarding.pepDeclared" : "onboarding.pepRelatedDeclared")}</dd></div>
      {profile.accountType === "retail"
        ? <div><dt>{t("onboarding.fieldAddressEvidence")}</dt><dd>{profile.proofOfAddressType}{profile.proofOfAddressReference ? ` · ${profile.proofOfAddressReference}` : ""}</dd></div>
        : <div><dt>{t("onboarding.fieldDocuments")}</dt><dd>{t("onboarding.documentsUploaded", { count: [businessLicenseFile, tinCertificateFile, certificateOfIncorporationFile, articleOfAssociationFile].filter(Boolean).length })}</dd></div>}
      <div><dt>{t("onboarding.linkedBanks")}</dt><dd>{t(linkedBanks.length === 1 ? "onboarding.bankCountOne" : "onboarding.bankCountMany", { count: linkedBanks.length })}</dd></div>
    </dl></Card>
    <Card className={styles.termsCard}><small>{legalDocument ? t("onboarding.termsVersion", { version: legalDocument.version, date: legalDocument.effectiveAt }) : t("onboarding.demoTerms")}</small><b>{legalDocument?.title ?? t("onboarding.defaultTermsTitle")}</b><p>{legalDocument?.summary ?? t("onboarding.defaultTermsSummary")}</p></Card>
    <label className={styles.consentRow}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i>{consent && <Icon name="check" size={13} />}</i><span>{t("onboarding.consentAccurate")}</span></label>
    {profile.accountType === "institution" && <label className={styles.consentRow}><input type="checkbox" checked={profile.signatoryAuthorityConfirmed} onChange={(event) => update("signatoryAuthorityConfirmed", event.target.checked)} /><i>{profile.signatoryAuthorityConfirmed && <Icon name="check" size={13} />}</i><span>{t("onboarding.consentSignatory")}</span></label>}
    <label className={styles.consentRow}><input type="checkbox" checked={profile.termsAccepted} onChange={(event) => update("termsAccepted", event.target.checked)} /><i>{profile.termsAccepted && <Icon name="check" size={13} />}</i><span>{t("onboarding.consentTerms", { terms: legalDocument?.title ?? t("onboarding.defaultTermsInline") })}</span></label>
    <label className={styles.consentRow}><input type="checkbox" checked={profile.electronicDeliveryConsent} onChange={(event) => update("electronicDeliveryConsent", event.target.checked)} /><i>{profile.electronicDeliveryConsent && <Icon name="check" size={13} />}</i><span>{t("onboarding.consentElectronic")}</span></label>
    <Button className={styles.full} disabled={!consent || !profile.termsAccepted || (profile.accountType === "institution" && !profile.signatoryAuthorityConfirmed)} onClick={() => setStep(4)}>{t("onboarding.submitForVerification")}</Button>
  </div>;

  if (step === 2) return <div className={styles.onboarding}>
    <KycProgress step={2} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(1)} aria-label={t("common.back")}><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>{t("onboarding.linkBank")}</h1><p>{t("onboarding.linkBankNote")}</p></div>
    <div className={`${styles.kycForm} ${styles.onboardingBankList}`}>
      {linkedBanks.map((account, index) => <Card className={styles.onboardingBankCard} key={account.id}>
        <div className={styles.onboardingBankHead}><span><small>{t("onboarding.bankAccountIndex", { index: index + 1 })}</small><b>{account.bankName}</b></span>{linkedBanks.length > 1 && <button onClick={() => removeLinkedBank(account.id)}>{t("onboarding.remove")}</button>}</div>
        <label className={styles.formField}><span>{t("onboarding.bankName")}</span><BrandSelect className="bselect-investor" value={account.bankName} onChange={(next) => updateLinkedBank(account.id, "bankName", next)} ariaLabel={t("onboarding.bankName")} options={bankOptions.map((bank) => ({ value: bank, label: bank }))} /></label>
        <label className={styles.formField}><span>{t("onboarding.accountNumber")}</span><div><input inputMode="numeric" value={account.accountNumber} onChange={(event) => updateLinkedBank(account.id, "accountNumber", event.target.value.replace(/\D/g, "").slice(0, 24))} placeholder={t("onboarding.accountNumberPlaceholder")} /></div></label>
        <label className={styles.formField}><span>{t("onboarding.accountHolder")}</span><div><input value={account.accountHolderName} onChange={(event) => updateLinkedBank(account.id, "accountHolderName", event.target.value)} placeholder={t("onboarding.accountHolderPlaceholder")} /></div>{account.accountHolderName.trim() && account.accountHolderName.trim().toLocaleLowerCase() !== profile.fullName.trim().toLocaleLowerCase() && <small className={styles.fieldError}>{t("onboarding.nameMismatch")}</small>}</label>
      </Card>)}
      {linkedBanks.length < 3 && <button className={styles.addBankButton} onClick={addLinkedBank}><span>+</span>{t("onboarding.addBank")}</button>}
      <div className={styles.accountNameWarning}><b>{t("onboarding.nameMustMatch")}</b><span>{t("onboarding.nameCheckNote", { name: profile.fullName })}</span></div>
      <div className={styles.cashNotice}><b>{t("onboarding.whatNext")}</b><span>{t("onboarding.whatNextNote")}</span></div>
    </div>
    <Button className={styles.full} disabled={!bankStepValid} onClick={() => setStep(3)}>{t("onboarding.reviewDetails")}</Button>
  </div>;

  if (step === 1) return <div className={styles.onboarding}>
    <KycProgress step={1} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(0)} aria-label={t("common.back")}><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>{t(profile.accountType === "retail" ? "onboarding.confirmIdentity" : "onboarding.tellInstitution")}</h1><p>{t(profile.accountType === "retail" ? "onboarding.confirmIdentityNote" : "onboarding.tellInstitutionNote")}</p></div>
    <div className={styles.kycForm}>
      <KycField label={t(profile.accountType === "retail" ? "onboarding.faydaLabel" : "onboarding.faydaRepLabel")} value={profile.faydaId} onChange={(value) => update("faydaId", value.replace(/\D/g, "").slice(0, 16))} inputMode="numeric" maxLength={16} placeholder={t("onboarding.faydaPlaceholder")} hint={profile.faydaId && !faydaValid ? t("onboarding.faydaError") : t("onboarding.faydaHint")} />
      <KycField label={t("onboarding.tinLabel")} value={profile.tin} onChange={(value) => update("tin", value.replace(/[^0-9-]/g, "").slice(0, 13))} inputMode="numeric" placeholder="0012814908" hint={profile.tin && !tinValid ? t("onboarding.tinError") : t("onboarding.tinHint")} />
      {profile.accountType === "institution" && <>
        <KycField label={t("onboarding.regNumber")} value={profile.registrationNumber} onChange={(value) => update("registrationNumber", value)} placeholder={t("onboarding.regNumberPlaceholder")} />
        <KycField label={t("onboarding.authorizedRep")} value={profile.representativeName} onChange={(value) => update("representativeName", value)} placeholder={t("onboarding.fullLegalName")} />
        <KycField label={t("onboarding.beneficialOwnerField")} value={profile.beneficialOwnerName} onChange={(value) => update("beneficialOwnerName", value)} placeholder={t("onboarding.beneficialOwnerPlaceholder")} />
      </>}
      <label className={styles.formField}>
        <span>{t(profile.accountType === "retail" ? "onboarding.pepLabel" : "onboarding.pepInstitutionLabel")}</span>
        <BrandSelect value={profile.pepStatus} onChange={(next) => update("pepStatus", next)} ariaLabel={t("onboarding.pepAria")} options={profile.accountType === "retail" ? [
          { value: "not_declared", label: t("onboarding.pepSelect") },
          { value: "not_pep", label: t("onboarding.pepRetailNot") },
          { value: "pep", label: t("onboarding.pepRetailIs") },
          { value: "related_to_pep", label: t("onboarding.pepRetailRelated") },
        ] : [
          { value: "not_declared", label: t("onboarding.pepSelect") },
          { value: "not_pep", label: t("onboarding.pepInstNot") },
          { value: "pep", label: t("onboarding.pepInstIs") },
          { value: "related_to_pep", label: t("onboarding.pepInstRelated") },
        ]} />
        <small>{t(profile.accountType === "retail" ? "onboarding.pepRetailHint" : "onboarding.pepInstHint")}</small>
      </label>
      {profile.accountType === "retail" ? <>
        <fieldset className={styles.proofTypeOptions}>
          <legend>{t("onboarding.proofType")}</legend>
          {PROOF_TYPES.map(([option, labelKey]) => <label key={option}>
            <input type="radio" name="proof-of-address-type" value={option} checked={profile.proofOfAddressType === option} onChange={() => update("proofOfAddressType", option)} />
            <i>{profile.proofOfAddressType === option && <Icon name="check" size={12} />}</i>
            <span>{t(labelKey)}</span>
          </label>)}
        </fieldset>
        <div className={styles.uploadField}>
          <span>{t("onboarding.proofDocument")}</span>
          <input id={proofUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setProofFile(file);
            update("proofOfAddressReference", file?.name ?? "");
          }} />
          <label htmlFor={proofUploadId}>
            <b>{proofFile ? proofFile.name : t("onboarding.uploadProof")}</b>
            <small>{proofFile ? t("onboarding.fileChosen", { size: (proofFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
            <em>{proofFile ? "✓" : "+"}</em>
          </label>
        </div>
      </> : <>
        <KycField label={t("onboarding.registeredAddress")} value={profile.address} onChange={(value) => update("address", value)} placeholder={t("onboarding.addressPlaceholder")} />
        <div className={styles.uploadField}>
          <span>{t("onboarding.businessLicense")}</span>
          <input id={businessLicenseUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setBusinessLicenseFile(file);
            update("proofOfAddressType", file ? "Business license" : "");
            update("proofOfAddressReference", file?.name ?? "");
          }} />
          <label htmlFor={businessLicenseUploadId}>
            <b>{businessLicenseFile ? businessLicenseFile.name : t("onboarding.uploadBusinessLicense")}</b>
            <small>{businessLicenseFile ? t("onboarding.fileChosen", { size: (businessLicenseFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
            <em>{businessLicenseFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>{t("onboarding.tinCertificate")}</span>
          <input id={tinCertificateUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setTinCertificateFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={tinCertificateUploadId}>
            <b>{tinCertificateFile ? tinCertificateFile.name : t("onboarding.uploadTinCertificate")}</b>
            <small>{tinCertificateFile ? t("onboarding.fileChosen", { size: (tinCertificateFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
            <em>{tinCertificateFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>{t("onboarding.certIncorporation")}</span>
          <input id={certificateOfIncorporationUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setCertificateOfIncorporationFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={certificateOfIncorporationUploadId}>
            <b>{certificateOfIncorporationFile ? certificateOfIncorporationFile.name : t("onboarding.uploadCertIncorporation")}</b>
            <small>{certificateOfIncorporationFile ? t("onboarding.fileChosen", { size: (certificateOfIncorporationFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
            <em>{certificateOfIncorporationFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>{t("onboarding.articleAssociation")}</span>
          <input id={articleOfAssociationUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setArticleOfAssociationFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={articleOfAssociationUploadId}>
            <b>{articleOfAssociationFile ? articleOfAssociationFile.name : t("onboarding.uploadArticleAssociation")}</b>
            <small>{articleOfAssociationFile ? t("onboarding.fileChosen", { size: (articleOfAssociationFile.size / 1024).toFixed(0) }) : t("onboarding.fileFormats")}</small>
            <em>{articleOfAssociationFile ? "✓" : "+"}</em>
          </label>
        </div>
      </>}
    </div>
    <Button className={styles.full} disabled={!identityStepValid || verifyingIdentity} onClick={() => {
      setVerifyingIdentity(true);
      void onVerifyIdentity(profile.phone).then((verificationId) => {
        if (!verificationId) return;
        setProfile((current) => ({ ...current, verificationId }));
        setStep(2);
      }).finally(() => setVerifyingIdentity(false));
    }}>{t(verifyingIdentity ? "onboarding.checkingCode" : "onboarding.verifyContinue")}</Button>
  </div>;

  return <div className={styles.onboarding}><KycProgress step={0} /><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={onBack} aria-label={t("onboarding.backToJourneys")}><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>{t("onboarding.openAccount")}</h1><p>{t("onboarding.openAccountNote")}</p></div><div className={styles.accountTypeGrid}><button className={profile.accountType === "retail" ? styles.accountTypeSelected : ""} onClick={() => chooseType("retail")}><i>{profile.accountType === "retail" && <Icon name="check" size={13} />}</i><b>{t("onboarding.retailInvestor")}</b><small>{t("onboarding.retailNote")}</small></button><button className={profile.accountType === "institution" ? styles.accountTypeSelected : ""} onClick={() => chooseType("institution")}><i>{profile.accountType === "institution" && <Icon name="check" size={13} />}</i><b>{t("onboarding.institution")}</b><small>{t("onboarding.institutionNote")}</small></button></div><div className={styles.kycForm}><KycField label={t(profile.accountType === "retail" ? "onboarding.fullLegalName" : "onboarding.legalOrgName")} value={profile.fullName} onChange={(value) => update("fullName", value)} placeholder={t("onboarding.namePlaceholder")} /><KycField label={t("onboarding.mobileNumber")} value={profile.phone} onChange={(value) => update("phone", value.replace(/[^0-9+]/g, ""))} inputMode="tel" placeholder={t("onboarding.mobilePlaceholder")} hint={t("onboarding.mobileHint")} /><KycField label={t("onboarding.emailAddress")} value={profile.email} onChange={(value) => update("email", value.trimStart())} type="email" inputMode="email" autoComplete="email" placeholder={t("onboarding.emailPlaceholder")} hint={profile.email && !emailValid ? t("onboarding.emailError") : t("onboarding.emailHint")} /></div><div className={styles.demoNotice}><b>{t("onboarding.demoOnly")}</b></div><Button className={styles.full} disabled={!firstStepValid} onClick={() => setStep(1)}>{t("onboarding.continue")}</Button></div>;
}

export function Onboarding({ initialAccountType, onBack, onVerifyIdentity, onDone, legalDocument }: { initialAccountType: InvestorKyc["accountType"]; onBack: () => void; onVerifyIdentity: (phone: string) => Promise<string | null>; onDone: (submission: OnboardingSubmission) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
  const [submission, setSubmission] = useState<OnboardingSubmission | null>(null);
  return submission ? <InvestmentOnboarding onDone={() => onDone(submission)} /> : <KycOnboarding initialAccountType={initialAccountType} onBack={onBack} onVerifyIdentity={onVerifyIdentity} onComplete={setSubmission} legalDocument={legalDocument} />;
}

export function InvestmentOnboarding({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("");
  const [reaction, setReaction] = useState("");
  const strategy = horizon === "short" || reaction === "sell" || goal === "income" ? "Steady" : horizon === "long" && reaction === "buy" && goal === "grow" ? "Growth" : "Balanced";
  const mix = strategy === "Steady" ? [70, 30] : strategy === "Growth" ? [30, 70] : [50, 50];
  // The first element of each row is the stored answer value and stays in English.
  const choices: ReadonlyArray<readonly [string, TranslationKey, TranslationKey]> = step === 1
    ? [["grow", "strategy.growLabel", "strategy.growNote"], ["big", "strategy.bigLabel", "strategy.bigNote"], ["income", "strategy.incomeLabel", "strategy.incomeNote"], ["learn", "strategy.learnLabel", "strategy.learnNote"]]
    : step === 2
      ? [["short", "strategy.shortLabel", "strategy.shortNote"], ["mid", "strategy.midLabel", "strategy.midNote"], ["long", "strategy.longLabel", "strategy.longNote"]]
      : [["sell", "strategy.sellLabel", "strategy.sellNote"], ["wait", "strategy.waitLabel", "strategy.waitNote"], ["buy", "strategy.buyLabel", "strategy.buyNote"]];
  const selection = step === 1 ? goal : step === 2 ? horizon : reaction;
  const choose = (value: string) => step === 1 ? setGoal(value) : step === 2 ? setHorizon(value) : setReaction(value);

  if (step === 0) return <div className={styles.onboarding}><button className={styles.skip} onClick={onDone}>{t("strategy.skip")}</button><div className={styles.onboardingIntro}><Image src="/frankscore-icon.png" alt={t("strategy.logoAlt")} width={74} height={104} priority /><h1>{t("strategy.introTitleLine1")}<br />{t("strategy.introTitleLine2")}</h1><p>{t("strategy.introNote")}</p></div><Button className={styles.full} onClick={() => setStep(1)}>{t("strategy.start")}</Button><ProgressDots step={0} /></div>;

  if (step === 4) return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(3)} aria-label={t("common.back")}><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>{t("strategy.resultTitle", { strategy: t(STRATEGY_LABELS[strategy]) })}</h1><p>{t(STRATEGY_NOTES[strategy])}</p></div><Card className={styles.strategyResult}><div className={styles.strategyResultTop}><span><b>{t("strategy.mixLabel", { strategy: t(STRATEGY_LABELS[strategy]) })}</b><small>{t("strategy.mixDetail", { bonds: mix[0], stocks: mix[1] })}</small></span></div><AllocationBar bonds={mix[0]} stocks={mix[1]} light /></Card><p className={styles.strategyNote}>{t("strategy.note")}</p><Button className={styles.full} onClick={onDone}>{t("strategy.getStarted")}</Button><ProgressDots step={3} /></div>;

  const heading = t(step === 1 ? "strategy.q1" : step === 2 ? "strategy.q2" : "strategy.q3");
  const subheading = t(step === 1 ? "strategy.q1Sub" : step === 2 ? "strategy.q2Sub" : "strategy.q3Sub");
  return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(step - 1)} aria-label={t("common.back")}><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>{t("strategy.skip")}</button></div><div className={styles.onboardingCopy}><h1>{heading}</h1><p>{subheading}</p></div><div className={styles.choiceList}>{choices.map(([value, labelKey, descriptionKey]) => <button key={value} className={`${styles.choiceCard} ${selection === value ? styles.choiceSelected : ""}`} onClick={() => choose(value)}><i>{selection === value && <Icon name="check" size={13} />}</i><span><b>{t(labelKey)}</b><small>{t(descriptionKey)}</small></span></button>)}</div><Button className={styles.full} disabled={!selection} onClick={() => setStep(step === 3 ? 4 : step + 1)}>{t("onboarding.continue")}</Button><ProgressDots step={step} /></div>;
}
