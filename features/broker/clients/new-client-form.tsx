"use client";

import type { FormEvent } from "react";
import type {
  NewClientBank,
  NewClientValue,
  OnboardingDocumentType,
} from "../shared/broker-foundation";
import { BrandSelect } from "../../shared/brand-select";

export function NewClientForm({ value, setValue, busy, onCancel, onSubmit }: { value: NewClientValue; setValue: (value: NewClientValue) => void; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent) => void }) {
  const organization = value.clientType === "institution" || value.clientType === "corporate";
  const faydaValid = /^\d{16}$/.test(value.faydaId);
  const tinValid = /^\d{10,12}$/.test(value.tin.replace(/\D/g, ""));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email);
  const banksValid = value.linkedBanks.length >= 1 && value.linkedBanks.length <= 3 && value.linkedBanks.every((bank) =>
    bank.bankName.trim().length >= 2
    && bank.accountNumber.replace(/\s/g, "").length >= 8
    && bank.accountHolderName.trim().toLocaleLowerCase() === value.fullName.trim().toLocaleLowerCase()
  );
  const ready = value.fullName.trim().length >= 3
    && value.phone.trim().length >= 7
    && emailValid
    && faydaValid
    && tinValid
    && (!organization || value.address.trim().length >= 4)
    && value.sourceOfFunds.trim().length >= 3
    && value.investmentObjective.trim().length >= 3
    && value.taxResidency.trim().length >= 3
    && value.termsAccepted
    && (!organization || (
      value.businessRegistrationNumber.trim().length >= 4
      && value.authorizedRepresentativeName.trim().length >= 3
      && value.beneficialOwnerName.trim().length >= 3
      && value.signatoryAuthorityConfirmed
    ))
    && banksValid;
  const set = <K extends keyof NewClientValue>(key: K, next: NewClientValue[K]) => setValue({ ...value, [key]: next });
  const setLegalName = (next: string) => setValue({
    ...value,
    fullName: next,
    linkedBanks: value.linkedBanks.map((bank) => ({
      ...bank,
      accountHolderName: !bank.accountHolderName || bank.accountHolderName === value.fullName ? next : bank.accountHolderName,
    })),
  });
  const setDocument = (type: OnboardingDocumentType, file: File | null) => setValue({
    ...value,
    documentFiles: { ...value.documentFiles, [type]: file ?? undefined },
  });
  const updateBank = (id: string, field: keyof Omit<NewClientBank, "id">, next: string) => setValue({
    ...value,
    linkedBanks: value.linkedBanks.map((bank) => bank.id === id ? { ...bank, [field]: next } : bank),
  });
  const addBank = () => value.linkedBanks.length < 3 && setValue({
    ...value,
    linkedBanks: [...value.linkedBanks, { id: crypto.randomUUID(), bankName: "Commercial Bank of Ethiopia", accountNumber: "", accountHolderName: value.fullName }],
  });
  const removeBank = (id: string) => value.linkedBanks.length > 1 && setValue({ ...value, linkedBanks: value.linkedBanks.filter((bank) => bank.id !== id) });
  const chooseClientType = (clientType: NewClientValue["clientType"]) => {
    const nextOrganization = clientType !== "individual";
    setValue({
      ...value,
      clientType,
      proofOfAddressType: nextOrganization ? "" : "Drivers License",
      proofOfAddressReference: "",
      documentFiles: nextOrganization
        ? { ...value.documentFiles, proof_of_address: undefined }
        : {
          proof_of_address: value.documentFiles.proof_of_address,
          business_license: undefined,
          tin_certificate: undefined,
          certificate_of_incorporation: undefined,
          article_of_association: undefined,
        },
    });
  };
  const documentFields: Array<[OnboardingDocumentType, string]> = organization
    ? [
      ["business_license", "Business license"],
      ["tin_certificate", "TIN certificate"],
      ["certificate_of_incorporation", "Certificate of Incorporation"],
      ["article_of_association", "Article of Association"],
    ]
    : [["proof_of_address", "Proof of address document"]];
  return <form onSubmit={onSubmit} className="drawer-content client-onboarding-form">
    <div className="drawer-title"><span className="eyebrow">CONTROLLED CLIENT ONBOARDING</span><h2>Add a client</h2><p>Capture identity, documents, authority, and consent. The account remains unavailable for trading until an authorized second user approves it.</p></div>
    <div className="stepper"><span className="active">1 <b>Client record</b></span><i /><span className={ready ? "active" : ""}>2 <b>Approval</b></span><i /><span>3 <b>Trading active</b></span></div>
    <section className="form-section">
      <h3>Account owner</h3>
      <div className="field-row"><label>Onboarding source<BrandSelect value={value.onboardingChannel} onChange={(next) => set("onboardingChannel", next as NewClientValue["onboardingChannel"])} ariaLabel="Onboarding source" options={[{ value: "digital", label: "Digital" }, { value: "in_person", label: "In person" }, { value: "neway", label: "Neway" }, { value: "phone", label: "Phone" }]} /></label><label>External reference<input value={value.externalClientReference} onChange={(event) => set("externalClientReference", event.target.value)} placeholder="e.g. Neway reference" /><small className="optional-label">Optional</small></label></div>
      <div className="segmented three"><button type="button" className={value.clientType === "individual" ? "active buy" : ""} onClick={() => chooseClientType("individual")}>INDIVIDUAL</button><button type="button" className={value.clientType === "corporate" ? "active buy" : ""} onClick={() => chooseClientType("corporate")}>CORPORATE</button><button type="button" className={value.clientType === "institution" ? "active buy" : ""} onClick={() => chooseClientType("institution")}>INSTITUTIONAL</button></div>
      <label>{organization ? "Legal organization name" : "Full legal name"}<input value={value.fullName} onChange={(event) => setLegalName(event.target.value)} placeholder="As shown on official records" /></label>
      <div className="field-row"><label>Phone<input value={value.phone} onChange={(event) => set("phone", event.target.value.replace(/[^0-9+]/g, ""))} placeholder="+251…" /></label><label>Email<input type="email" value={value.email} onChange={(event) => set("email", event.target.value)} placeholder="client@example.et" /></label></div>
      {organization && <label>Registered address<input value={value.address} onChange={(event) => set("address", event.target.value)} placeholder="City, sub-city, and locality" /></label>}
      <div className="field-row"><label>Nationality<input value={value.nationality} onChange={(event) => set("nationality", event.target.value)} /></label><label>Country of residence<input value={value.countryOfResidence} onChange={(event) => set("countryOfResidence", event.target.value)} /></label></div>
    </section>
    <section className="form-section">
      <h3>Identity and tax</h3>
      <div className="field-row"><label>{organization ? "Representative Fayda FAN" : "Fayda FAN"}<input inputMode="numeric" maxLength={16} value={value.faydaId} onChange={(event) => set("faydaId", event.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="16 digits" /><small>{value.faydaId && !faydaValid ? "FAN must contain 16 digits." : "Only a masked reference is retained."}</small></label><label>TIN<input inputMode="numeric" value={value.tin} onChange={(event) => set("tin", event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="10–12 digits" /><small>{value.tin && !tinValid ? "Enter a valid TIN." : "Used for tax and account records."}</small></label></div>
      {!organization && <label>Proof of address type<BrandSelect value={value.proofOfAddressType} onChange={(next) => set("proofOfAddressType", next)} ariaLabel="Proof of address type" options={[{ value: "Drivers License", label: "Drivers License" }, { value: "Kebele ID", label: "Kebele ID" }]} /></label>}
      <div className="broker-document-uploads">{documentFields.map(([type, label]) => <label className="broker-document-upload" key={type}>{label}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setDocument(type, event.target.files?.[0] ?? null)} /><span>{value.documentFiles[type] ? value.documentFiles[type]!.name : `Upload ${label.toLocaleLowerCase()}`}</span><small>PDF, PNG or JPG, up to 10 MB</small></label>)}</div>
      <label>CSD account/reference <span className="optional-label">optional</span><input value={value.csdReference} onChange={(event) => set("csdReference", event.target.value)} placeholder="Record when available" /></label>
      <div className="field-row"><label>Occupation / business activity<input value={value.occupation} onChange={(event) => set("occupation", event.target.value)} /></label><label>Source of funds<input value={value.sourceOfFunds} onChange={(event) => set("sourceOfFunds", event.target.value)} placeholder="Employment, business, pension…" /></label></div>
      <div className="field-row"><label>Investment objective<input value={value.investmentObjective} onChange={(event) => set("investmentObjective", event.target.value)} /></label><label>Tax residency<input value={value.taxResidency} onChange={(event) => set("taxResidency", event.target.value)} /></label></div>
      <label>PEP declaration<BrandSelect value={value.pepStatus} onChange={(next) => set("pepStatus", next as NewClientValue["pepStatus"])} ariaLabel="PEP declaration" options={[{ value: "not_pep", label: "Not a politically exposed person" }, { value: "pep", label: "Politically exposed person" }, { value: "related_to_pep", label: "Family member / close associate" }]} /></label>
    </section>
    {organization && <section className="form-section">
      <h3>{value.clientType === "corporate" ? "Corporate authority" : "Institutional authority"}</h3>
      <label>Business registration number<input value={value.businessRegistrationNumber} onChange={(event) => set("businessRegistrationNumber", event.target.value)} /></label>
      <div className="field-row"><label>Authorized representative<input value={value.authorizedRepresentativeName} onChange={(event) => set("authorizedRepresentativeName", event.target.value)} /></label><label>Beneficial owner / controller<input value={value.beneficialOwnerName} onChange={(event) => set("beneficialOwnerName", event.target.value)} /></label></div>
      <label className="control-checkbox"><input type="checkbox" checked={value.signatoryAuthorityConfirmed} onChange={(event) => set("signatoryAuthorityConfirmed", event.target.checked)} /><i>{value.signatoryAuthorityConfirmed ? "✓" : ""}</i><span><b>Signatory authority confirmed</b><small>The representative is authorized to open and operate the account.</small></span></label>
    </section>}
    <section className="form-section">
      <h3>Linked bank accounts</h3>
      <p className="form-section-copy">Add accounts in the client&apos;s legal name. The broker must approve each account before it can receive a withdrawal.</p>
      <div className="broker-linked-banks">{value.linkedBanks.map((bank, index) => <div className="broker-linked-bank" key={bank.id}><header><b>Bank account {index + 1}</b>{value.linkedBanks.length > 1 && <button type="button" onClick={() => removeBank(bank.id)}>Remove</button>}</header><label>Bank name<input value={bank.bankName} onChange={(event) => updateBank(bank.id, "bankName", event.target.value)} /></label><label>Account number<input value={bank.accountNumber} onChange={(event) => updateBank(bank.id, "accountNumber", event.target.value.replace(/\s/g, ""))} /></label><label>Account holder name<input value={bank.accountHolderName} onChange={(event) => updateBank(bank.id, "accountHolderName", event.target.value)} /><small>{bank.accountHolderName && bank.accountHolderName.trim().toLocaleLowerCase() !== value.fullName.trim().toLocaleLowerCase() ? "Account holder name must match verified records." : "Must match the client’s verified legal name."}</small></label></div>)}</div>
      {value.linkedBanks.length < 3 && <button type="button" className="btn secondary small" onClick={addBank}>＋ Add another bank</button>}
      <div className="client-approval-callout"><span>REVIEW</span><div><b>What happens next</b><small>Each bank account is reviewed separately. Client approval can continue while a bank is waiting for review.</small></div></div>
    </section>
    <section className="form-section">
      <h3>Risk and consent</h3>
      <label>Initial risk rating<BrandSelect value={value.riskRating} onChange={(next) => set("riskRating", next as NewClientValue["riskRating"])} ariaLabel="Initial risk rating" options={[{ value: "standard", label: "Standard" }, { value: "enhanced", label: "Enhanced due diligence" }, { value: "review", label: "Compliance review" }]} /></label>
      <label className="control-checkbox"><input type="checkbox" checked={value.termsAccepted} onChange={(event) => set("termsAccepted", event.target.checked)} /><i>{value.termsAccepted ? "✓" : ""}</i><span><b>Current brokerage agreement accepted</b><small>Record acceptance only after the client has reviewed the tenant’s published terms.</small></span></label>
      <label className="control-checkbox"><input type="checkbox" checked={value.electronicDeliveryConsent} onChange={(event) => set("electronicDeliveryConsent", event.target.checked)} /><i>{value.electronicDeliveryConsent ? "✓" : ""}</i><span><b>Electronic delivery consent</b><small>Contract notes, statements, and account notices may be sent electronically.</small></span></label>
    </section>
    <div className="client-approval-callout"><span>FOUR-EYES</span><div><b>Approval is a separate step</b><small>This record will be created as Pending Approval. It will not appear in New Order until KYC, consent, and account activation controls pass.</small></div></div>
    <div className="drawer-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !ready}>{busy ? "Submitting…" : "Submit for approval"} <span>→</span></button></div>
  </form>;
}


