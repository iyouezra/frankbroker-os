import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError } from "../../../lib/api";
import { createClientForApproval, type CreateClientInput } from "../../../lib/client-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requirePermission(request, "report");
    const [rows, currentLegal] = await Promise.all([
      prisma.client.findMany({
        where: { brokerId: actor.brokerId },
        include: {
          creator: true,
          approver: true,
          consents: { orderBy: { acceptedAt: "desc" } },
          serviceRequests: { orderBy: { submittedAt: "desc" }, take: 20 },
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
          risk: client.riskRating,
          totalCash: toNum(account?.totalCash),
          availableCash: toNum(account?.availableCash),
          blockedCash: toNum(account?.blockedCash),
          unsettledCash: toNum(account?.unsettledCash),
          accountId: account?.id ?? "",
          accountNumber: account?.accountNumber ?? "No trading account",
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
    const actor = requirePermission(request, "create");
    const payload = await request.json() as Partial<CreateClientInput>;
    const clientType = payload.clientType === "institution" ? "institution" : "individual";
    const result = await createClientForApproval(actor, {
      clientType,
      fullName: String(payload.fullName ?? ""),
      phone: String(payload.phone ?? ""),
      email: payload.email ? String(payload.email) : undefined,
      faydaId: String(payload.faydaId ?? ""),
      tin: String(payload.tin ?? ""),
      address: String(payload.address ?? ""),
      proofOfAddressType: String(payload.proofOfAddressType ?? ""),
      proofOfAddressReference: String(payload.proofOfAddressReference ?? ""),
      businessRegistrationNumber: payload.businessRegistrationNumber ? String(payload.businessRegistrationNumber) : undefined,
      authorizedRepresentativeName: payload.authorizedRepresentativeName ? String(payload.authorizedRepresentativeName) : undefined,
      beneficialOwnerName: payload.beneficialOwnerName ? String(payload.beneficialOwnerName) : undefined,
      signatoryAuthorityConfirmed: payload.signatoryAuthorityConfirmed === true,
      csdReference: payload.csdReference ? String(payload.csdReference) : undefined,
      riskRating: ["standard", "enhanced", "review"].includes(String(payload.riskRating)) ? payload.riskRating as "standard" | "enhanced" | "review" : "standard",
      termsAccepted: payload.termsAccepted === true,
      electronicDeliveryConsent: payload.electronicDeliveryConsent === true,
    });
    return Response.json({ client: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
