import { Prisma } from "../app/generated/prisma/client";
import { addisYear } from "./addis-date";
import { prisma } from "./prisma";
import { clientIdentityReference } from "./client-identity";
import { taxIdentityReference } from "./monitoring";
import type { Actor } from "./server-auth";
import { writeNotification, COMPLIANCE } from "./oms/notification-service";
import {
  expectedDocumentTypes,
  saveOnboardingEvidence,
  type LinkedBankInput,
  type OnboardingSource,
  type PreparedDocument,
} from "./onboarding-evidence";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export type CreateClientInput = {
  clientType: "individual" | "corporate" | "institution";
  fullName: string;
  phone: string;
  email: string;
  faydaId: string;
  tin: string;
  address?: string;
  proofOfAddressType?: string;
  proofOfAddressReference?: string;
  businessRegistrationNumber?: string;
  authorizedRepresentativeName?: string;
  beneficialOwnerName?: string;
  signatoryAuthorityConfirmed?: boolean;
  csdReference?: string;
  riskRating?: "standard" | "enhanced" | "review";
  termsAccepted: boolean;
  electronicDeliveryConsent: boolean;
  onboardingChannel?: "digital" | "in_person" | "neway" | "phone" | "investor_portal";
  externalClientReference?: string;
  dateOfBirth?: string;
  nationality?: string;
  countryOfResidence?: string;
  occupation?: string;
  employerName?: string;
  sourceOfFunds?: string;
  investmentObjective?: string;
  taxResidency?: string;
  pepStatus?: "not_pep" | "pep" | "related_to_pep";
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  phoneVerifiedAt?: Date;
  documents: PreparedDocument[];
  linkedBanks: LinkedBankInput[];
};

function normalizedDigits(value: string) {
  return value.replace(/\D/g, "");
}

function validateCreateInput(input: CreateClientInput) {
  const fayda = normalizedDigits(input.faydaId);
  const tin = normalizedDigits(input.tin);
  if (input.fullName.trim().length < 3 || input.fullName.trim().length > 160) return "A valid legal name is required.";
  if (input.phone.trim().length < 7 || input.phone.trim().length > 40) return "A valid phone number is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 160) return "Enter a valid email address.";
  if (fayda.length !== 16) return "Fayda FAN must contain 16 digits.";
  if (tin.length < 10 || tin.length > 12) return "TIN must contain 10 to 12 digits.";
  if (!input.sourceOfFunds?.trim()) return "Source of funds is required.";
  if (!input.investmentObjective?.trim()) return "Investment objective is required.";
  if (!input.taxResidency?.trim()) return "Tax residency is required.";
  if (!input.pepStatus) return "A politically exposed person declaration is required.";
  const organization = input.clientType === "institution" || input.clientType === "corporate";
  if (organization) {
    if ((input.address?.trim().length ?? 0) < 4) return "A registered address is required for an organization.";
    if ((input.businessRegistrationNumber?.trim().length ?? 0) < 4) return "Business registration is required for an organization.";
    if ((input.authorizedRepresentativeName?.trim().length ?? 0) < 3) return "An authorized representative is required.";
    if ((input.beneficialOwnerName?.trim().length ?? 0) < 3) return "A beneficial owner or controller must be declared.";
    if (!input.signatoryAuthorityConfirmed) return "Signatory authority must be confirmed.";
  } else if (input.proofOfAddressType && !["Drivers License", "Kebele ID"].includes(input.proofOfAddressType)) {
    return "Proof of address must be a Drivers License or Kebele ID.";
  }
  if (input.linkedBanks.length < 1 || input.linkedBanks.length > 3) return "Add between one and three linked bank accounts.";
  if (input.linkedBanks.some((bank) => bank.accountHolderName.trim().toLocaleLowerCase() !== input.fullName.trim().toLocaleLowerCase())) {
    return "Account holder name must match the verified legal name.";
  }
  return null;
}

export async function createClientForApproval(actor: Actor, input: CreateClientInput) {
  const validationError = validateCreateInput(input);
  if (validationError) throw new Response(validationError, { status: 400 });
  const fayda = normalizedDigits(input.faydaId);
  const tin = normalizedDigits(input.tin);
  const identityRef = clientIdentityReference({ clientType: input.clientType, faydaId: fayda, businessRegistrationNumber: input.businessRegistrationNumber });
  const now = new Date();
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  const clientId = `cli_${crypto.randomUUID().slice(0, 12)}`;
  const accountId = `acc_${crypto.randomUUID().slice(0, 12)}`;
  const clientCode = `CL-${addisYear()}-${suffix}`;
  const accountNumber = `TRD-${addisYear()}-${suffix}-01`;

  return prisma.$transaction(async (tx) => {
    const [settings, legalDocument] = await Promise.all([
      tx.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
      tx.legalDocument.findFirst({
        where: { brokerId: actor.brokerId, documentType: "brokerage_terms", status: "published" },
        orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
      }),
    ]);
    if ((settings?.requireTermsAcceptance ?? true) && legalDocument && !input.termsAccepted) {
      throw new Response("Record acceptance of the current brokerage terms before submitting the client.", { status: 400 });
    }
    // Reject a client whose legal identity is already on file for this broker.
    // The unique index is the backstop for a race; this gives a clear message.
    const duplicate = await tx.client.findFirst({ where: { brokerId: actor.brokerId, identityReference: identityRef }, select: { clientCode: true } });
    if (duplicate) {
      const subject = input.clientType === "individual" ? "individual" : "organization";
      throw new Response(`This ${subject} is already registered with your firm as ${duplicate.clientCode}.`, { status: 409 });
    }
    const client = await tx.client.create({
      data: {
        id: clientId,
        brokerId: actor.brokerId,
        clientCode,
        fullName: input.fullName.trim(),
        clientType: input.clientType,
        phone: input.phone.trim(),
        email: input.email.trim(),
        identityReference: identityRef,
        faydaLast7: fayda.slice(-7),
        taxIdLast4: tin.slice(-4),
        taxIdentityReference: taxIdentityReference(tin),
        taxId: null,
        kycConsentAt: now,
        address: input.address?.trim() || null,
        proofOfAddressType: input.proofOfAddressType?.trim() || null,
        proofOfAddressReference: input.proofOfAddressReference?.trim() || null,
        proofOfAddressStatus: input.documents.some((document) => document.documentType === "proof_of_address") ? "received" : "pending",
        businessRegistrationNumber: input.businessRegistrationNumber?.trim() || null,
        authorizedRepresentativeName: input.authorizedRepresentativeName?.trim() || null,
        signatoryAuthorityConfirmed: input.clientType === "individual" || Boolean(input.signatoryAuthorityConfirmed),
        beneficialOwners: input.clientType !== "individual" && input.beneficialOwnerName
          ? [{ name: input.beneficialOwnerName.trim(), status: "declared" }]
          : undefined,
        electronicDeliveryConsentAt: input.electronicDeliveryConsent ? now : null,
        kycStatus: "pending_review",
        riskRating: input.pepStatus === "not_pep" ? (input.riskRating ?? "standard") : "enhanced",
        status: "pending_approval",
        createdBy: actor.id,
        submittedAt: now,
        onboardingChannel: input.onboardingChannel ?? "in_person",
        externalClientReference: input.externalClientReference?.trim() || null,
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
        nationality: input.nationality?.trim() || null,
        countryOfResidence: input.countryOfResidence?.trim() || null,
        occupation: input.occupation?.trim() || null,
        employerName: input.employerName?.trim() || null,
        sourceOfFunds: input.sourceOfFunds?.trim() || null,
        investmentObjective: input.investmentObjective?.trim() || null,
        taxResidency: input.taxResidency?.trim() || null,
        pepStatus: input.pepStatus ?? "not_declared",
        bankName: input.bankName?.trim() || null,
        bankAccountName: input.bankAccountName?.trim() || null,
        bankAccountLast4: normalizedDigits(input.bankAccountNumber ?? "").slice(-4) || null,
        phoneVerifiedAt: input.phoneVerifiedAt ?? null,
        tradingMandate: {
          create: { id: `mandate_${clientId}`, brokerId: actor.brokerId, commissionSource: "tenant_default" },
        },
        accounts: {
          create: {
            id: accountId,
            accountNumber,
            accountType: "cash",
            csdReference: input.csdReference?.trim() || null,
            status: "pending_approval",
            restrictionReason: "Awaiting client onboarding approval",
          },
        },
        beneficialOwnerRecords: input.clientType !== "individual" && input.beneficialOwnerName ? {
          create: {
            id: crypto.randomUUID(),
            brokerId: actor.brokerId,
            displayName: input.beneficialOwnerName.trim(),
          },
        } : undefined,
      },
    });
    if (legalDocument && input.termsAccepted) {
      await tx.clientConsent.create({
        data: {
          id: crypto.randomUUID(),
          clientId,
          legalDocumentId: legalDocument.id,
          consentType: "brokerage_terms",
          version: legalDocument.version,
          channel: "broker_desk",
          metadata: {
            recordedBy: actor.id,
            electronicDeliveryConsent: input.electronicDeliveryConsent,
          },
        },
      });
    }
    await saveOnboardingEvidence(tx, {
      brokerId: actor.brokerId,
      clientId,
      source: (input.onboardingChannel ?? "in_person") as OnboardingSource,
      legalName: input.fullName,
      clientType: input.clientType,
      documents: input.documents,
      banks: input.linkedBanks,
    });
    await tx.auditLog.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "CLIENT_CREATED",
          entityType: "client",
          entityId: clientId,
          summary: `${client.fullName} created through broker onboarding`,
          newValue: JSON.stringify({ clientCode, clientType: client.clientType, status: "pending_approval", accountNumber, pepStatus: client.pepStatus, riskRating: client.riskRating }),
        },
        {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "CLIENT_SUBMITTED_FOR_APPROVAL",
          entityType: "client",
          entityId: clientId,
          summary: `${client.fullName} submitted for KYC and account approval`,
          newValue: JSON.stringify({ kycStatus: "pending_review", accountStatus: "pending_approval" }),
        },
      ],
    });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: actor.brokerId,
      roles: COMPLIANCE,
      category: "kyc",
      severity: "warning",
      title: "New client awaiting KYC review",
      body: `${client.fullName} (${clientCode}) was submitted for onboarding and KYC approval.`,
      entityType: "client",
      entityId: clientId,
    });
    return { id: clientId, clientCode, accountId, accountNumber, status: client.status, kycStatus: client.kycStatus };
  }, transactionOptions);
}

export async function approveClient(actor: Actor, clientId: string) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId, brokerId: actor.brokerId },
      include: {
        accounts: true,
        consents: { orderBy: { acceptedAt: "desc" } },
        documents: true,
        screenings: { orderBy: { screenedAt: "desc" }, take: 1 },
      },
    });
    if (!client) throw new Response("Client not found for this tenant.", { status: 404 });
    if (client.status !== "pending_approval" || client.kycStatus !== "pending_review") {
      throw new Response("Only clients pending onboarding approval can be approved.", { status: 409 });
    }
    const [settings, legalDocument] = await Promise.all([
      tx.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
      tx.legalDocument.findFirst({
        where: { brokerId: actor.brokerId, documentType: "brokerage_terms", status: "published" },
        orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
      }),
    ]);
    if ((settings?.makerChecker ?? true) && client.createdBy === actor.id) {
      throw new Response("Four-eyes control: the client creator cannot approve this onboarding record.", { status: 409 });
    }
    const institutional = client.clientType === "institution" || client.clientType === "corporate";
    const identityReady = Boolean(client.identityReference && client.faydaLast7 && client.taxIdLast4)
      && (!institutional || Boolean(client.address && client.businessRegistrationNumber && client.authorizedRepresentativeName && client.signatoryAuthorityConfirmed && client.beneficialOwners));
    if (!identityReady) throw new Response("Required identity, ownership, or authority details are incomplete.", { status: 409 });
    const expectedDocuments = expectedDocumentTypes(client.clientType);
    const incompleteDocuments = expectedDocuments.filter((type) => !client.documents.some((document) => document.documentType === type && document.status === "approved"));
    if (incompleteDocuments.length) throw new Response(`Approve all required KYC documents first: ${incompleteDocuments.join(", ")}.`, { status: 409 });
    if (client.screenings[0]?.result !== "clear") throw new Response("Record a clear sanctions and PEP screening result before activating the client.", { status: 409 });
    const acceptedCurrentTerms = !legalDocument || client.consents.some((consent) => consent.legalDocumentId === legalDocument.id && consent.accepted && !consent.withdrawnAt);
    if ((settings?.requireTermsAcceptance ?? true) && !acceptedCurrentTerms) {
      throw new Response("The current brokerage agreement has not been accepted.", { status: 409 });
    }
    const approvedAt = new Date();
    const accountNumber = client.accounts[0]?.accountNumber ?? `${client.clientCode.replace(/^CL-/, "TRD-")}-01`;
    const accountId = client.accounts[0]?.id ?? `acc_${crypto.randomUUID().slice(0, 12)}`;
    await tx.client.update({
      where: { id: client.id },
      data: {
        kycStatus: "approved",
        status: "active",
        approvedBy: actor.id,
        approvedAt,
        rejectionReason: null,
        kycReviewDueAt: new Date(approvedAt.getTime() + (settings?.kycReviewMonths ?? 12) * 30 * 24 * 60 * 60 * 1000),
      },
    });
    await tx.account.updateMany({
      where: { clientId: client.id, status: "pending_approval" },
      data: { status: "active", restrictionReason: null, restrictedAt: null },
    });
    if (client.accounts.length === 0) {
      await tx.account.create({
        data: {
          id: accountId,
          clientId: client.id,
          accountNumber,
          status: "active",
        },
      });
    }
    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "CLIENT_APPROVED",
        entityType: "client",
        entityId: client.id,
        summary: `${client.fullName} approved for account activation`,
        previousValue: JSON.stringify({ status: client.status, kycStatus: client.kycStatus }),
        newValue: JSON.stringify({ status: "active", kycStatus: "approved", accountStatus: "active", accountNumber }),
      },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: client.id,
      category: "kyc",
      severity: "success",
      title: "You're approved to invest",
      body: "Your account is active. You can now buy and sell shares and bonds on the ESX.",
      entityType: "client",
      entityId: client.id,
    });
    return { status: "active", kycStatus: "approved", accountId, accountNumber };
  }, transactionOptions);
}

export async function rejectClient(actor: Actor, clientId: string, reason: string) {
  const rejectionReason = reason.trim();
  if (rejectionReason.length < 5 || rejectionReason.length > 1_000) {
    throw new Response("A clear rejection reason is required.", { status: 400 });
  }
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: clientId, brokerId: actor.brokerId } });
    if (!client) throw new Response("Client not found for this tenant.", { status: 404 });
    if (client.status !== "pending_approval") throw new Response("Only pending onboarding records can be rejected.", { status: 409 });
    await tx.client.update({
      where: { id: client.id },
      data: { status: "rejected", kycStatus: "rejected", rejectionReason },
    });
    await tx.account.updateMany({
      where: { clientId: client.id },
      data: { status: "restricted", restrictionReason: rejectionReason, restrictedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "CLIENT_REJECTED",
        entityType: "client",
        entityId: client.id,
        summary: `${client.fullName} onboarding rejected`,
        previousValue: JSON.stringify({ status: client.status, kycStatus: client.kycStatus }),
        newValue: JSON.stringify({ status: "rejected", kycStatus: "rejected" }),
        reason: rejectionReason,
      },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: client.id,
      category: "kyc",
      severity: "warning",
      title: "Onboarding needs attention",
      body: `Your onboarding could not be approved: ${rejectionReason}`,
      entityType: "client",
      entityId: client.id,
    });
    return { status: "rejected", kycStatus: "rejected" };
  }, transactionOptions);
}
