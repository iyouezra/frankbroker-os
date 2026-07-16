import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export type CreateClientInput = {
  clientType: "individual" | "corporate" | "institution";
  fullName: string;
  phone: string;
  email?: string;
  faydaId: string;
  tin: string;
  address: string;
  proofOfAddressType: string;
  proofOfAddressReference: string;
  businessRegistrationNumber?: string;
  authorizedRepresentativeName?: string;
  beneficialOwnerName?: string;
  signatoryAuthorityConfirmed?: boolean;
  csdReference?: string;
  riskRating?: "standard" | "enhanced" | "review";
  termsAccepted: boolean;
  electronicDeliveryConsent: boolean;
};

function normalizedDigits(value: string) {
  return value.replace(/\D/g, "");
}

function validateCreateInput(input: CreateClientInput) {
  const fayda = normalizedDigits(input.faydaId);
  const tin = normalizedDigits(input.tin);
  if (input.fullName.trim().length < 3 || input.fullName.trim().length > 160) return "A valid legal name is required.";
  if (input.phone.trim().length < 7 || input.phone.trim().length > 40) return "A valid phone number is required.";
  if (input.email && (!input.email.includes("@") || input.email.length > 160)) return "Enter a valid email address.";
  if (fayda.length !== 12) return "Fayda FIN must contain 12 digits.";
  if (tin.length < 10 || tin.length > 12) return "TIN must contain 10 to 12 digits.";
  if (input.address.trim().length < 4) return "A current or registered address is required.";
  if (input.proofOfAddressType.trim().length < 3 || input.proofOfAddressReference.trim().length < 4) return "Proof-of-address type and reference are required.";
  const organization = input.clientType === "institution" || input.clientType === "corporate";
  if (organization) {
    if ((input.businessRegistrationNumber?.trim().length ?? 0) < 4) return "Business registration is required for an organization.";
    if ((input.authorizedRepresentativeName?.trim().length ?? 0) < 3) return "An authorized representative is required.";
    if ((input.beneficialOwnerName?.trim().length ?? 0) < 3) return "A beneficial owner or controller must be declared.";
    if (!input.signatoryAuthorityConfirmed) return "Signatory authority must be confirmed.";
  }
  return null;
}

export async function createClientForApproval(actor: Actor, input: CreateClientInput) {
  const validationError = validateCreateInput(input);
  if (validationError) throw new Response(validationError, { status: 400 });
  const fayda = normalizedDigits(input.faydaId);
  const tin = normalizedDigits(input.tin);
  const now = new Date();
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  const clientId = `cli_${crypto.randomUUID().slice(0, 12)}`;
  const accountId = `acc_${crypto.randomUUID().slice(0, 12)}`;
  const clientCode = `CL-${new Date().getUTCFullYear()}-${suffix}`;
  const accountNumber = `TRD-${new Date().getUTCFullYear()}-${suffix}-01`;

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
    const client = await tx.client.create({
      data: {
        id: clientId,
        brokerId: actor.brokerId,
        clientCode,
        fullName: input.fullName.trim(),
        clientType: input.clientType,
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        identityReference: `broker_fayda_${crypto.randomUUID()}`,
        faydaLast4: fayda.slice(-4),
        taxIdLast4: tin.slice(-4),
        taxId: null,
        kycConsentAt: now,
        address: input.address.trim(),
        proofOfAddressType: input.proofOfAddressType.trim(),
        proofOfAddressReference: input.proofOfAddressReference.trim(),
        proofOfAddressStatus: "received",
        businessRegistrationNumber: input.businessRegistrationNumber?.trim() || null,
        authorizedRepresentativeName: input.authorizedRepresentativeName?.trim() || null,
        signatoryAuthorityConfirmed: input.clientType === "individual" || Boolean(input.signatoryAuthorityConfirmed),
        beneficialOwners: input.clientType !== "individual" && input.beneficialOwnerName
          ? [{ name: input.beneficialOwnerName.trim(), status: "declared" }]
          : undefined,
        electronicDeliveryConsentAt: input.electronicDeliveryConsent ? now : null,
        kycStatus: "pending_review",
        riskRating: input.riskRating ?? "standard",
        status: "pending_approval",
        createdBy: actor.id,
        submittedAt: now,
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
          newValue: JSON.stringify({ clientCode, clientType: client.clientType, status: "pending_approval", accountNumber }),
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
    const documentReady = client.proofOfAddressStatus === "received"
      && Boolean(client.identityReference && client.faydaLast4 && client.taxIdLast4)
      && (!institutional || Boolean(client.businessRegistrationNumber && client.authorizedRepresentativeName && client.signatoryAuthorityConfirmed && client.beneficialOwners));
    if (!documentReady) throw new Response("Required identity, address, ownership, or authority evidence is incomplete.", { status: 409 });
    const acceptedCurrentTerms = !legalDocument || client.consents.some((consent) => consent.legalDocumentId === legalDocument.id && consent.accepted && !consent.withdrawnAt);
    if ((settings?.requireTermsAcceptance ?? true) && !acceptedCurrentTerms) {
      throw new Response("The current brokerage agreement has not been accepted.", { status: 409 });
    }
    const approvedAt = new Date();
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
        newValue: JSON.stringify({ status: "active", kycStatus: "approved", accountStatus: "active" }),
      },
    });
    return { status: "active", kycStatus: "approved" };
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
    return { status: "rejected", kycStatus: "rejected" };
  }, transactionOptions);
}
