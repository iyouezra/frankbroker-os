export type ClientReadinessInput = {
  kycStatus: string;
  clientStatus: string;
  accountStatus: string | null;
  proofOfAddressStatus: string;
  institutional: boolean;
  businessRegistrationNumber: string | null;
  authorizedRepresentativeName: string | null;
  signatoryAuthorityConfirmed: boolean;
  currentLegalVersion: string | null;
  acceptedLegalVersion: string | null;
  csdReference: string | null;
  availableCash: number;
  availableHoldings: number;
  restrictionReason: string | null;
  screeningStatus?: string | null;
};

export function evaluateClientReadiness(input: ClientReadinessInput) {
  const kycReady = input.kycStatus === "approved";
  const screeningReady = input.screeningStatus === undefined || input.screeningStatus === "clear";
  const documentsReady = input.proofOfAddressStatus === "received"
    && (!input.institutional || Boolean(
      input.businessRegistrationNumber
      && input.authorizedRepresentativeName
      && input.signatoryAuthorityConfirmed,
    ));
  const consentReady = !input.currentLegalVersion || input.acceptedLegalVersion === input.currentLegalVersion;
  const accountActive = input.accountStatus === "active" && input.clientStatus === "active";
  const unrestricted = !input.restrictionReason && input.clientStatus !== "restricted";
  const baseReady = kycReady && screeningReady && consentReady && accountActive && unrestricted;
  const canBuy = baseReady && input.availableCash > 0;
  const canSell = baseReady && input.availableHoldings > 0;
  const blockingReasons = [
    !kycReady ? "KYC is not approved" : null,
    !screeningReady ? "Current sanctions and PEP screening evidence is required" : null,
    !consentReady ? "Current brokerage terms are not accepted" : null,
    !accountActive ? "Client or account is not active" : null,
    !unrestricted ? input.restrictionReason ?? "Account restriction is active" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    canTrade: canBuy || canSell,
    canBuy,
    canSell,
    kycReady,
    documentsReady,
    consentReady,
    accountActive,
    unrestricted,
    baseReady,
    blockingReasons,
    items: [
      { key: "kyc", label: "KYC approved", state: kycReady ? "pass" : "fail", detail: kycReady ? "Approved and current" : `Status: ${input.kycStatus}` },
      { key: "screening", label: "Sanctions and PEP screening", state: screeningReady ? "pass" : "fail", detail: screeningReady ? "Clear result recorded" : input.screeningStatus ? `Result: ${input.screeningStatus}` : "No screening evidence recorded" },
      { key: "documents", label: "Onboarding documents", state: documentsReady ? "pass" : "warning", detail: documentsReady ? "Evidence recorded" : "Some evidence has not been received" },
      { key: "consent", label: "Required legal documents accepted", state: consentReady ? "pass" : "fail", detail: consentReady ? `Accepted ${input.acceptedLegalVersion ?? "available version"}` : `Accept ${input.currentLegalVersion ?? "current version"}` },
      { key: "account", label: "Account active", state: accountActive ? "pass" : "fail", detail: input.accountStatus ?? "No account" },
      { key: "csd", label: "CSD account/reference", state: input.csdReference ? "pass" : "warning", detail: input.csdReference ?? "Not yet recorded" },
      { key: "cash", label: "Cash available", state: input.availableCash > 0 ? "pass" : "warning", detail: `${input.availableCash.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETB available` },
      { key: "restriction", label: "No account restriction", state: unrestricted ? "pass" : "fail", detail: unrestricted ? "No active restriction" : input.restrictionReason ?? "Restricted" },
      { key: "buy", label: "Can place buy order", state: canBuy ? "pass" : "fail", detail: canBuy ? "Ready for pre-trade validation" : blockingReasons[0] ?? "No available cash" },
      { key: "sell", label: "Can place sell order", state: canSell ? "pass" : "warning", detail: canSell ? "Available holdings exist" : blockingReasons[0] ?? "No available holdings" },
    ] as Array<{ key: string; label: string; state: "pass" | "fail" | "warning"; detail: string }>,
  };
}

export function isOrderEligibleClient(client: {
  tradeEligible?: boolean;
  status: string;
  kyc: string;
  accountStatus?: string;
  accountId: string;
  termsAcceptedVersion?: string | null;
  restrictionReason?: string | null;
}) {
  if (typeof client.tradeEligible === "boolean") return client.tradeEligible;
  return client.status === "active"
    && client.kyc === "approved"
    && (client.accountStatus ?? "active") === "active"
    && Boolean(client.accountId)
    && Boolean(client.termsAcceptedVersion)
    && !client.restrictionReason;
}
