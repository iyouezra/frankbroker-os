import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError } from "../../../lib/api";
import { createClientForApproval, type CreateClientInput } from "../../../lib/client-service";
import { parseLinkedBanks, prepareDocuments } from "../../../lib/onboarding-evidence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, "report");
    const [rows, currentLegal] = await Promise.all([
      prisma.client.findMany({
        where: { brokerId: actor.brokerId },
        include: {
          creator: true,
          approver: true,
          consents: { orderBy: { acceptedAt: "desc" } },
          screenings: { orderBy: { screenedAt: "desc" }, take: 1 },
          serviceRequests: { orderBy: { submittedAt: "desc" }, take: 20 },
          tradingMandate: true,
          accounts: {
            include: {
              holdings: { include: { instrument: true }, orderBy: { instrument: { symbol: "asc" } } },
              cashLedgerEntries: { orderBy: { createdAt: "desc" }, take: 8 },
              _count: { select: { orders: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.legalDocument.findFirst({
        where: { brokerId: actor.brokerId, documentType: "brokerage_terms", status: "published" },
        orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
      }),
    ]);

    return Response.json({
      clients: rows.map((client) => {
        const account = client.accounts[0];
        const acceptedTerms = client.consents.find((consent) => consent.consentType === "brokerage_terms" && consent.accepted && !consent.withdrawnAt);
        const tradeEligible = client.status === "active"
          && client.kycStatus === "approved"
          && client.screenings[0]?.result === "clear"
          && account?.status === "active"
          && !account.restrictionReason
          && (!currentLegal || acceptedTerms?.legalDocumentId === currentLegal.id);
        return {
          id: client.id,
          code: client.clientCode,
          name: client.fullName,
          type: client.clientType,
          kyc: client.kycStatus,
          status: client.status,
          accountStatus: account?.status ?? "missing",
          tradeEligible,
          screeningStatus: client.screenings[0]?.result ?? null,
          risk: client.riskRating,
          totalCash: toNum(account?.totalCash),
          availableCash: toNum(account?.availableCash),
          blockedCash: toNum(account?.blockedCash),
          unsettledCash: toNum(account?.unsettledCash),
          accountId: account?.id ?? "",
          accountNumber: account?.accountNumber ?? "No trading account",
          onboardingChannel: client.onboardingChannel,
          externalClientReference: client.externalClientReference,
          phoneVerified: Boolean(client.phoneVerifiedAt),
          identityVerified: Boolean(client.identityVerifiedAt),
          address: client.address,
          proofOfAddressStatus: client.proofOfAddressStatus,
          proofOfAddressType: client.proofOfAddressType,
          businessRegistrationNumber: client.businessRegistrationNumber,
          authorizedRepresentativeName: client.authorizedRepresentativeName,
          signatoryAuthorityConfirmed: client.signatoryAuthorityConfirmed,
          kycReviewDueAt: client.kycReviewDueAt?.toISOString() ?? null,
          termsAcceptedVersion: acceptedTerms?.version ?? null,
          currentTermsVersion: currentLegal?.version ?? null,
          createdBy: client.creator?.fullName ?? null,
          approvedBy: client.approver?.fullName ?? null,
          submittedAt: client.submittedAt?.toISOString() ?? null,
          approvedAt: client.approvedAt?.toISOString() ?? null,
          rejectionReason: client.rejectionReason,
          commissionSource: client.tradingMandate?.commissionSource ?? "tenant_default",
          commissionRatePct: client.tradingMandate?.commissionRatePct === null || client.tradingMandate?.commissionRatePct === undefined ? null : toNum(client.tradingMandate.commissionRatePct),
          commissionMinimumFee: client.tradingMandate?.commissionMinimumFee === null || client.tradingMandate?.commissionMinimumFee === undefined ? null : toNum(client.tradingMandate.commissionMinimumFee),
          commissionMaximumFee: client.tradingMandate?.commissionMaximumFee === null || client.tradingMandate?.commissionMaximumFee === undefined ? null : toNum(client.tradingMandate.commissionMaximumFee),
          commissionEffectiveFrom: client.tradingMandate?.commissionEffectiveFrom?.toISOString().slice(0, 10) ?? null,
          commissionMandateVersion: client.tradingMandate?.version ?? null,
          restrictionReason: account?.restrictionReason ?? null,
          serviceRequests: client.serviceRequests.map((item) => ({
            id: item.id,
            requestType: item.requestType,
            status: item.status,
            subject: item.subject,
            description: item.description,
            orderId: item.orderId,
            submittedAt: item.submittedAt.toISOString(),
            resolutionNotes: item.resolutionNotes,
          })),
          orderCount: account?._count.orders ?? 0,
          holdings: (account?.holdings ?? []).map((holding) => ({
            symbol: holding.instrument.symbol,
            name: holding.instrument.name,
            total: toNum(holding.totalQuantity),
            available: toNum(holding.availableQuantity),
            blocked: toNum(holding.blockedQuantity),
            averageCost: toNum(holding.averageCost),
          })),
          ledger: (account?.cashLedgerEntries ?? []).map((entry) => ({
            id: entry.id,
            valueDate: entry.valueDate.toISOString().slice(0, 10),
            reference: entry.tradeId ?? entry.orderId ?? entry.id,
            type: entry.entryType,
            amount: toNum(entry.amount),
            runningBalance: toNum(entry.runningBalance),
          })),
        };
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, "create");
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const payload = multipart
      ? JSON.parse(String(formData?.get("payload") ?? "{}")) as Partial<CreateClientInput>
      : await request.json() as Partial<CreateClientInput>;
    const documents = formData ? await prepareDocuments(formData) : [];
    const linkedBanks = parseLinkedBanks(payload.linkedBanks ?? (
      payload.bankName && payload.bankAccountNumber
        ? [{ bankName: payload.bankName, accountNumber: payload.bankAccountNumber, accountHolderName: payload.bankAccountName ?? payload.fullName }]
        : []
    ));
    const clientType = payload.clientType === "institution"
      ? "institution"
      : payload.clientType === "corporate"
        ? "corporate"
        : "individual";
    const result = await createClientForApproval(actor, {
      clientType,
      fullName: String(payload.fullName ?? ""),
      phone: String(payload.phone ?? ""),
      email: String(payload.email ?? ""),
      faydaId: String(payload.faydaId ?? ""),
      tin: String(payload.tin ?? ""),
      address: payload.address ? String(payload.address) : undefined,
      proofOfAddressType: payload.proofOfAddressType ? String(payload.proofOfAddressType) : undefined,
      proofOfAddressReference: payload.proofOfAddressReference ? String(payload.proofOfAddressReference) : undefined,
      businessRegistrationNumber: payload.businessRegistrationNumber ? String(payload.businessRegistrationNumber) : undefined,
      authorizedRepresentativeName: payload.authorizedRepresentativeName ? String(payload.authorizedRepresentativeName) : undefined,
      beneficialOwnerName: payload.beneficialOwnerName ? String(payload.beneficialOwnerName) : undefined,
      signatoryAuthorityConfirmed: payload.signatoryAuthorityConfirmed === true,
      csdReference: payload.csdReference ? String(payload.csdReference) : undefined,
      riskRating: ["standard", "enhanced", "review"].includes(String(payload.riskRating)) ? payload.riskRating as "standard" | "enhanced" | "review" : "standard",
      termsAccepted: payload.termsAccepted === true,
      electronicDeliveryConsent: payload.electronicDeliveryConsent === true,
      onboardingChannel: ["digital", "in_person", "neway", "phone"].includes(String(payload.onboardingChannel)) ? payload.onboardingChannel as CreateClientInput["onboardingChannel"] : "in_person",
      externalClientReference: payload.externalClientReference ? String(payload.externalClientReference) : undefined,
      dateOfBirth: payload.dateOfBirth ? String(payload.dateOfBirth) : undefined,
      nationality: payload.nationality ? String(payload.nationality) : undefined,
      countryOfResidence: payload.countryOfResidence ? String(payload.countryOfResidence) : undefined,
      occupation: payload.occupation ? String(payload.occupation) : undefined,
      employerName: payload.employerName ? String(payload.employerName) : undefined,
      sourceOfFunds: payload.sourceOfFunds ? String(payload.sourceOfFunds) : undefined,
      investmentObjective: payload.investmentObjective ? String(payload.investmentObjective) : undefined,
      taxResidency: payload.taxResidency ? String(payload.taxResidency) : undefined,
      pepStatus: ["not_pep", "pep", "related_to_pep"].includes(String(payload.pepStatus)) ? payload.pepStatus as CreateClientInput["pepStatus"] : undefined,
      bankName: payload.bankName ? String(payload.bankName) : undefined,
      bankAccountName: payload.bankAccountName ? String(payload.bankAccountName) : undefined,
      bankAccountNumber: payload.bankAccountNumber ? String(payload.bankAccountNumber) : undefined,
      documents,
      linkedBanks,
    });
    return Response.json({ client: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
