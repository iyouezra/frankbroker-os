"use client";

import Image from "next/image";
import { useId, useState } from "react";
import styles from "../../../app/investor/investor.module.css";
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

function KycOnboarding({ initialAccountType, onBack, onVerifyIdentity, onComplete, legalDocument }: { initialAccountType: InvestorKyc["accountType"]; onBack: () => void; onVerifyIdentity: (phone: string) => Promise<string | null>; onComplete: (submission: OnboardingSubmission) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
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
      <small>DEMO CHECK COMPLETE</small>
      <h1>Your details are ready</h1>
      <p>We checked the ID formats and captured your consent. Live Fayda and tax verification, plus bank verification, will be connected before real accounts are opened.</p>
      <Card className={styles.kycStatusCard}>
        <div><i><Icon name="check" size={14} /></i><span><b>Fayda ID format</b><small>16-digit FAN captured</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Tax information</b><small>TIN captured for review</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Linked banks</b><small>{linkedBanks.length} {linkedBanks.length === 1 ? "account" : "accounts"} submitted for review</small></span></div>
        <div><i><Icon name="check" size={14} /></i><span><b>Account type</b><small>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</small></span></div>
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
    }}>Set my investment strategy</Button>
  </div>;

  if (step === 3) return <div className={styles.onboarding}>
    <KycProgress step={3} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(2)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>Check and consent</h1><p>Review the records and the agreement that will govern this account.</p></div>
    <Card className={styles.kycReview}><dl>
      <div><dt>Account</dt><dd>{profile.accountType === "retail" ? "Retail investor" : "Institution"}</dd></div>
      <div><dt>Legal name</dt><dd>{profile.fullName}</dd></div>
      <div><dt>Email</dt><dd>{profile.email}</dd></div>
      {profile.accountType === "institution" && <>
        <div><dt>Representative</dt><dd>{profile.representativeName}</dd></div>
        <div><dt>Beneficial owner</dt><dd>{profile.beneficialOwnerName}</dd></div>
        <div><dt>Registration</dt><dd>{profile.registrationNumber}</dd></div>
      </>}
      <div><dt>Fayda ID</dt><dd>{masked(profile.faydaId)}</dd></div>
      <div><dt>TIN</dt><dd>{masked(profile.tin)}</dd></div>
      {profile.accountType === "retail"
        ? <div><dt>Address evidence</dt><dd>{profile.proofOfAddressType}{profile.proofOfAddressReference ? ` · ${profile.proofOfAddressReference}` : ""}</dd></div>
        : <div><dt>Documents</dt><dd>{[businessLicenseFile, tinCertificateFile, certificateOfIncorporationFile, articleOfAssociationFile].filter(Boolean).length} of 4 uploaded</dd></div>}
      <div><dt>Linked banks</dt><dd>{linkedBanks.length} {linkedBanks.length === 1 ? "account" : "accounts"}</dd></div>
    </dl></Card>
    <Card className={styles.termsCard}><small>{legalDocument ? `VERSION ${legalDocument.version} · EFFECTIVE ${legalDocument.effectiveAt}` : "DEMO TERMS"}</small><b>{legalDocument?.title ?? "Brokerage account terms"}</b><p>{legalDocument?.summary ?? "Account operation, order handling, fee disclosure, settlement, confirmation, discrepancy, restriction, and closure terms."}</p></Card>
    <label className={styles.consentRow}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><i>{consent && <Icon name="check" size={13} />}</i><span>I confirm these details are accurate and consent to identity and tax verification.</span></label>
    {profile.accountType === "institution" && <label className={styles.consentRow}><input type="checkbox" checked={profile.signatoryAuthorityConfirmed} onChange={(event) => update("signatoryAuthorityConfirmed", event.target.checked)} /><i>{profile.signatoryAuthorityConfirmed && <Icon name="check" size={13} />}</i><span>I confirm the representative is authorized to open and operate this account for the institution.</span></label>}
    <label className={styles.consentRow}><input type="checkbox" checked={profile.termsAccepted} onChange={(event) => update("termsAccepted", event.target.checked)} /><i>{profile.termsAccepted && <Icon name="check" size={13} />}</i><span>I accept {legalDocument?.title ?? "the brokerage account terms"} and understand that fees and order details will be disclosed before submission.</span></label>
    <label className={styles.consentRow}><input type="checkbox" checked={profile.electronicDeliveryConsent} onChange={(event) => update("electronicDeliveryConsent", event.target.checked)} /><i>{profile.electronicDeliveryConsent && <Icon name="check" size={13} />}</i><span>Send confirmations, contract notes, statements, and account notices electronically.</span></label>
    <Button className={styles.full} disabled={!consent || !profile.termsAccepted || (profile.accountType === "institution" && !profile.signatoryAuthorityConfirmed)} onClick={() => setStep(4)}>Submit for verification</Button>
  </div>;

  if (step === 2) return <div className={styles.onboarding}>
    <KycProgress step={2} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(1)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>Link a bank account</h1><p>Add an account in your name for future withdrawals. You can link up to 3.</p></div>
    <div className={`${styles.kycForm} ${styles.onboardingBankList}`}>
      {linkedBanks.map((account, index) => <Card className={styles.onboardingBankCard} key={account.id}>
        <div className={styles.onboardingBankHead}><span><small>BANK ACCOUNT {index + 1}</small><b>{account.bankName}</b></span>{linkedBanks.length > 1 && <button onClick={() => removeLinkedBank(account.id)}>Remove</button>}</div>
        <label className={styles.formField}><span>Bank name</span><div className={styles.selectField}><select value={account.bankName} onChange={(event) => updateLinkedBank(account.id, "bankName", event.target.value)}>{bankOptions.map((bank) => <option key={bank}>{bank}</option>)}</select></div></label>
        <label className={styles.formField}><span>Account number</span><div><input inputMode="numeric" value={account.accountNumber} onChange={(event) => updateLinkedBank(account.id, "accountNumber", event.target.value.replace(/\D/g, "").slice(0, 24))} placeholder="Enter the full account number" /></div></label>
        <label className={styles.formField}><span>Account holder name</span><div><input value={account.accountHolderName} onChange={(event) => updateLinkedBank(account.id, "accountHolderName", event.target.value)} placeholder="As shown on the bank account" /></div>{account.accountHolderName.trim() && account.accountHolderName.trim().toLocaleLowerCase() !== profile.fullName.trim().toLocaleLowerCase() && <small className={styles.fieldError}>Use the same name shown in your verified records.</small>}</label>
      </Card>)}
      {linkedBanks.length < 3 && <button className={styles.addBankButton} onClick={addLinkedBank}><span>+</span>Add another bank account</button>}
      <div className={styles.accountNameWarning}><b>Account holder name must match verified records</b><span>We will check the bank account against {profile.fullName}.</span></div>
      <div className={styles.cashNotice}><b>What happens next</b><span>Your broker reviews the account details. Once approved, the bank account will appear as a withdrawal option.</span></div>
    </div>
    <Button className={styles.full} disabled={!bankStepValid} onClick={() => setStep(3)}>Review details</Button>
  </div>;

  if (step === 1) return <div className={styles.onboarding}>
    <KycProgress step={1} />
    <div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(0)} aria-label="Go back"><Icon name="back" size={20} /></button></div>
    <div className={styles.onboardingCopy}><h1>{profile.accountType === "retail" ? "Confirm your identity" : "Tell us about the institution"}</h1><p>{profile.accountType === "retail" ? "Use the details linked to your Fayda ID." : "We also need the representative, authority, and ownership records."}</p></div>
    <div className={styles.kycForm}>
      <KycField label={profile.accountType === "retail" ? "Fayda ID number (FAN)" : "Representative’s Fayda ID (FAN)"} value={profile.faydaId} onChange={(value) => update("faydaId", value.replace(/\D/g, "").slice(0, 16))} inputMode="numeric" maxLength={16} placeholder="16 digits" hint={profile.faydaId && !faydaValid ? "Fayda FAN must contain 16 digits." : "We’ll use this for identity verification."} />
      <KycField label="Taxpayer Identification Number (TIN)" value={profile.tin} onChange={(value) => update("tin", value.replace(/[^0-9-]/g, "").slice(0, 13))} inputMode="numeric" placeholder="0012814908" hint={profile.tin && !tinValid ? "Enter a 10-digit TIN or a TIN with its two-digit subTIN." : "Used for tax reporting and account records."} />
      {profile.accountType === "institution" && <>
        <KycField label="Business registration number" value={profile.registrationNumber} onChange={(value) => update("registrationNumber", value)} placeholder="Registration or license number" />
        <KycField label="Authorized representative" value={profile.representativeName} onChange={(value) => update("representativeName", value)} placeholder="Full legal name" />
        <KycField label="Beneficial owner / controller" value={profile.beneficialOwnerName} onChange={(value) => update("beneficialOwnerName", value)} placeholder="Primary declared owner or controller" />
      </>}
      {profile.accountType === "retail" ? <>
        <fieldset className={styles.proofTypeOptions}>
          <legend>Proof of address type</legend>
          {["Drivers License", "Kebele ID"].map((option) => <label key={option}>
            <input type="radio" name="proof-of-address-type" value={option} checked={profile.proofOfAddressType === option} onChange={() => update("proofOfAddressType", option)} />
            <i>{profile.proofOfAddressType === option && <Icon name="check" size={12} />}</i>
            <span>{option}</span>
          </label>)}
        </fieldset>
        <div className={styles.uploadField}>
          <span>Proof of address document</span>
          <input id={proofUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setProofFile(file);
            update("proofOfAddressReference", file?.name ?? "");
          }} />
          <label htmlFor={proofUploadId}>
            <b>{proofFile ? proofFile.name : "Upload proof of address"}</b>
            <small>{proofFile ? `${(proofFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
            <em>{proofFile ? "✓" : "+"}</em>
          </label>
        </div>
      </> : <>
        <KycField label="Registered address" value={profile.address} onChange={(value) => update("address", value)} placeholder="City and sub-city" />
        <div className={styles.uploadField}>
          <span>Business license</span>
          <input id={businessLicenseUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setBusinessLicenseFile(file);
            update("proofOfAddressType", file ? "Business license" : "");
            update("proofOfAddressReference", file?.name ?? "");
          }} />
          <label htmlFor={businessLicenseUploadId}>
            <b>{businessLicenseFile ? businessLicenseFile.name : "Upload business license"}</b>
            <small>{businessLicenseFile ? `${(businessLicenseFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
            <em>{businessLicenseFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>TIN certificate</span>
          <input id={tinCertificateUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setTinCertificateFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={tinCertificateUploadId}>
            <b>{tinCertificateFile ? tinCertificateFile.name : "Upload TIN certificate"}</b>
            <small>{tinCertificateFile ? `${(tinCertificateFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
            <em>{tinCertificateFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>Certificate of Incorporation</span>
          <input id={certificateOfIncorporationUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setCertificateOfIncorporationFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={certificateOfIncorporationUploadId}>
            <b>{certificateOfIncorporationFile ? certificateOfIncorporationFile.name : "Upload Certificate of Incorporation"}</b>
            <small>{certificateOfIncorporationFile ? `${(certificateOfIncorporationFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
            <em>{certificateOfIncorporationFile ? "✓" : "+"}</em>
          </label>
        </div>
        <div className={styles.uploadField}>
          <span>Article of Association</span>
          <input id={articleOfAssociationUploadId} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setArticleOfAssociationFile(event.target.files?.[0] ?? null)} />
          <label htmlFor={articleOfAssociationUploadId}>
            <b>{articleOfAssociationFile ? articleOfAssociationFile.name : "Upload Article of Association"}</b>
            <small>{articleOfAssociationFile ? `${(articleOfAssociationFile.size / 1024).toFixed(0)} KB · Choose a different file` : "PDF, PNG or JPG"}</small>
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
    }}>{verifyingIdentity ? "Checking code…" : "Verify and continue"}</Button>
  </div>;

  return <div className={styles.onboarding}><KycProgress step={0} /><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={onBack} aria-label="Return to demo journeys"><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>Open your investment account</h1><p>Start with blank details and submit a separate application for broker review.</p></div><div className={styles.accountTypeGrid}><button className={profile.accountType === "retail" ? styles.accountTypeSelected : ""} onClick={() => chooseType("retail")}><i>{profile.accountType === "retail" && <Icon name="check" size={13} />}</i><b>Retail investor</b><small>An account for you</small></button><button className={profile.accountType === "institution" ? styles.accountTypeSelected : ""} onClick={() => chooseType("institution")}><i>{profile.accountType === "institution" && <Icon name="check" size={13} />}</i><b>Institution</b><small>A company or organization</small></button></div><div className={styles.kycForm}><KycField label={profile.accountType === "retail" ? "Full legal name" : "Legal organization name"} value={profile.fullName} onChange={(value) => update("fullName", value)} placeholder="As shown on official records" /><KycField label="Mobile number" value={profile.phone} onChange={(value) => update("phone", value.replace(/[^0-9+]/g, ""))} inputMode="tel" placeholder="09… or +251…" hint="We’ll use this for account updates and security." /><KycField label="Email address" value={profile.email} onChange={(value) => update("email", value.trimStart())} type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" hint={profile.email && !emailValid ? "Enter a valid email address." : "We’ll use this for confirmations and account notices."} /></div><div className={styles.demoNotice}><b>Demo only</b><span>This creates a new applicant record. It does not change Selam or Blue Nile.</span></div><Button className={styles.full} disabled={!firstStepValid} onClick={() => setStep(1)}>Continue</Button></div>;
}

export function Onboarding({ initialAccountType, onBack, onVerifyIdentity, onDone, legalDocument }: { initialAccountType: InvestorKyc["accountType"]; onBack: () => void; onVerifyIdentity: (phone: string) => Promise<string | null>; onDone: (submission: OnboardingSubmission) => void; legalDocument: InvestorBootstrap["tenant"]["legalDocument"] }) {
  const [submission, setSubmission] = useState<OnboardingSubmission | null>(null);
  return submission ? <InvestmentOnboarding onDone={() => onDone(submission)} /> : <KycOnboarding initialAccountType={initialAccountType} onBack={onBack} onVerifyIdentity={onVerifyIdentity} onComplete={setSubmission} legalDocument={legalDocument} />;
}

export function InvestmentOnboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("");
  const [reaction, setReaction] = useState("");
  const strategy = horizon === "short" || reaction === "sell" || goal === "income" ? "Steady" : horizon === "long" && reaction === "buy" && goal === "grow" ? "Growth" : "Balanced";
  const mix = strategy === "Steady" ? [70, 30] : strategy === "Growth" ? [30, 70] : [50, 50];
  const choices = step === 1
    ? [["grow", "Grow long-term wealth", "Build something bigger over many years."], ["big", "Save for something big", "A house, a business, or another major goal."], ["income", "Earn steady income", "Regular dividends and bond interest."], ["learn", "Start learning", "Begin small and learn as you go."]]
    : step === 2
      ? [["short", "Within 3 years", "Soon. We’ll keep it mostly in bonds."], ["mid", "3 to 10 years", "Time to ride out some bumps."], ["long", "10 years or more", "Plenty of time for stocks to work."]]
      : [["sell", "Sell before it drops more", "Losses keep you up at night."], ["wait", "Wait it out", "Prices move; the plan has not changed."], ["buy", "Buy more while it’s cheaper", "A dip can be an opportunity."]];
  const selection = step === 1 ? goal : step === 2 ? horizon : reaction;
  const choose = (value: string) => step === 1 ? setGoal(value) : step === 2 ? setHorizon(value) : setReaction(value);

  if (step === 0) return <div className={styles.onboarding}><button className={styles.skip} onClick={onDone}>Skip for now</button><div className={styles.onboardingIntro}><Image src="/frankscore-icon.png" alt="Frank" width={74} height={104} priority /><h1>Let&apos;s find<br />your strategy</h1><p>Three honest questions. We&apos;ll suggest a mix of ESX stocks and government bonds that may fit you.</p></div><Button className={styles.full} onClick={() => setStep(1)}>Start</Button><ProgressDots step={0} /></div>;

  if (step === 4) return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(3)} aria-label="Go back"><Icon name="back" size={20} /></button></div><div className={styles.onboardingCopy}><h1>Your suggested strategy: {strategy}</h1><p>{strategy === "Steady" ? "More bonds can mean less movement, with some stocks for growth." : strategy === "Growth" ? "More stocks can offer more room to grow, with bonds to soften some of the movement." : "An even mix of stocks and bonds balances growth with steadiness."}</p></div><Card className={styles.strategyResult}><div className={styles.strategyResultTop}><span><b>{strategy} strategy</b><small>{mix[0]}% bonds · {mix[1]}% stocks</small></span></div><AllocationBar bonds={mix[0]} stocks={mix[1]} light /></Card><p className={styles.strategyNote}>This is a starting point based on your answers, not an automatic investment service. You stay in control of what you buy.</p><Button className={styles.full} onClick={onDone}>Get started</Button><ProgressDots step={3} /></div>;

  const heading = step === 1 ? "What is this money for?" : step === 2 ? "When will you need it?" : "One month in, ETB 10,000 shows ETB 8,500. What do you do?";
  const subheading = step === 1 ? "Your goal decides how much risk makes sense." : step === 2 ? "Time is the biggest safety net an investor has." : "There’s no wrong answer. Just an honest one.";
  return <div className={styles.onboarding}><div className={styles.onboardingTop}><button className={styles.iconButton} onClick={() => setStep(step - 1)} aria-label="Go back"><Icon name="back" size={20} /></button><button className={styles.skip} onClick={onDone}>Skip for now</button></div><div className={styles.onboardingCopy}><h1>{heading}</h1><p>{subheading}</p></div><div className={styles.choiceList}>{choices.map(([value, label, description]) => <button key={value} className={`${styles.choiceCard} ${selection === value ? styles.choiceSelected : ""}`} onClick={() => choose(value)}><i>{selection === value && <Icon name="check" size={13} />}</i><span><b>{label}</b><small>{description}</small></span></button>)}</div><Button className={styles.full} disabled={!selection} onClick={() => setStep(step === 3 ? 4 : step + 1)}>Continue</Button><ProgressDots step={step} /></div>;
}
