export const restrictionCategories = [
  "compliance_review",
  "kyc_overdue",
  "missing_documents",
  "suspicious_activity",
  "legal_regulatory",
  "client_request",
  "other",
] as const;

export type RestrictionCategory = typeof restrictionCategories[number];

export const restrictionCategoryLabels: Record<RestrictionCategory, string> = {
  compliance_review: "Compliance review",
  kyc_overdue: "KYC overdue",
  missing_documents: "Missing documents",
  suspicious_activity: "Suspicious activity review",
  legal_regulatory: "Legal or regulatory",
  client_request: "Client request",
  other: "Other",
};

const guidanceByCategory: Record<RestrictionCategory, string[]> = {
  compliance_review: [
    "Complete the outstanding compliance review and record its outcome.",
    "Confirm that KYC, screening, required documents and current terms are all valid.",
    "Reference the review case or approval evidence before restoration.",
  ],
  kyc_overdue: [
    "Collect and approve any updated KYC evidence.",
    "Record a clear sanctions and PEP screening result.",
    "Complete the KYC review before restoration.",
  ],
  missing_documents: [
    "Collect every required identity or authority document.",
    "Review and approve each document in the client record.",
    "Reference the approved evidence before restoration.",
  ],
  suspicious_activity: [
    "Complete the enhanced review outside this workflow under the broker's escalation procedure.",
    "Record a clear screening result only when the alert is genuinely resolved.",
    "Reference the compliance case and decision before restoration.",
  ],
  legal_regulatory: [
    "Confirm that the legal or regulatory hold has been formally released.",
    "Record the authority, case or instruction supporting release.",
    "Confirm all ordinary account controls remain valid before restoration.",
  ],
  client_request: [
    "Verify the client's authenticated instruction to resume the account.",
    "Confirm that no separate compliance or legal hold remains active.",
    "Reference the instruction or service request before restoration.",
  ],
  other: [
    "Review the recorded restriction reason and resolve the underlying issue.",
    "Confirm all ordinary account controls are valid.",
    "Record enough evidence for an independent reviewer to understand the decision.",
  ],
};

export function inferRestrictionCategory(reason: string | null | undefined): RestrictionCategory {
  const normalized = String(reason ?? "").trim().toLowerCase();
  const explicit = restrictionCategories.find((category) => normalized.startsWith(restrictionCategoryLabels[category].toLowerCase()));
  if (explicit) return explicit;
  if (/\b(kyc|identity refresh|periodic review)\b/.test(normalized)) return "kyc_overdue";
  if (/\b(document|evidence|beneficial owner|authority|certificate|license)\b/.test(normalized)) return "missing_documents";
  if (/\b(suspicious|sanction|pep|aml|match|fraud)\b/.test(normalized)) return "suspicious_activity";
  if (/\b(legal|regulatory|court|authority|freeze|injunction)\b/.test(normalized)) return "legal_regulatory";
  if (/\b(client request|customer request|requested by client)\b/.test(normalized)) return "client_request";
  if (/\b(compliance|review|investigation)\b/.test(normalized)) return "compliance_review";
  return "other";
}

export function restrictionResolutionGuidance(category: RestrictionCategory) {
  return guidanceByCategory[category];
}

export type RestorationControl = {
  key: "kyc" | "screening" | "documents" | "consent";
  label: string;
  passed: boolean;
  detail: string;
  blocker: string | null;
};

export function evaluateRestorationControls(input: {
  kycStatus: string;
  screeningStatus: string | null | undefined;
  expectedDocuments: string[];
  approvedDocuments: string[];
  consentReady: boolean;
}) {
  const approved = new Set(input.approvedDocuments);
  const missingDocuments = input.expectedDocuments.filter((type) => !approved.has(type));
  const controls: RestorationControl[] = [
    {
      key: "kyc",
      label: "KYC review approved",
      passed: input.kycStatus === "approved",
      detail: input.kycStatus === "approved" ? "KYC is approved and current" : `Current status: ${input.kycStatus.replaceAll("_", " ")}`,
      blocker: input.kycStatus === "approved" ? null : "Complete and approve the KYC review",
    },
    {
      key: "screening",
      label: "Sanctions and PEP screening clear",
      passed: input.screeningStatus === "clear",
      detail: input.screeningStatus === "clear" ? "A clear screening result is recorded" : input.screeningStatus ? `Latest result: ${input.screeningStatus.replaceAll("_", " ")}` : "No screening result is recorded",
      blocker: input.screeningStatus === "clear" ? null : "Record a clear sanctions and PEP screening result",
    },
    {
      key: "documents",
      label: "Required documents approved",
      passed: missingDocuments.length === 0,
      detail: missingDocuments.length === 0 ? "All required documents are approved" : `Outstanding: ${missingDocuments.map((type) => type.replaceAll("_", " ")).join(", ")}`,
      blocker: missingDocuments.length === 0 ? null : `Approve required documents: ${missingDocuments.join(", ")}`,
    },
    {
      key: "consent",
      label: "Current brokerage terms accepted",
      passed: input.consentReady,
      detail: input.consentReady ? "The current agreement is accepted" : "Current terms have not been accepted",
      blocker: input.consentReady ? null : "Record acceptance of the current brokerage terms",
    },
  ];

  return {
    controls,
    blockers: controls.flatMap((control) => control.blocker ? [control.blocker] : []),
    ready: controls.every((control) => control.passed),
  };
}
