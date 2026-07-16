import { prisma } from "../../../lib/prisma";
import { resolveActor } from "../../../lib/server-auth";
import { toNum } from "../../../lib/money";
import { apiError } from "../../../lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = resolveActor(request);
    const rows = await prisma.client.findMany({
      where: { brokerId: actor.brokerId },
      include: {
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
    });

    return Response.json({
      clients: rows.map((client) => {
        const account = client.accounts[0];
        return {
          id: client.id,
          code: client.clientCode,
          name: client.fullName,
          type: client.clientType,
          kyc: client.kycStatus,
          status: client.status,
          risk: client.riskRating,
          totalCash: toNum(account?.totalCash),
          availableCash: toNum(account?.availableCash),
          blockedCash: toNum(account?.blockedCash),
          accountId: account?.id ?? "",
          accountNumber: account?.accountNumber ?? "No trading account",
          address: client.address,
          proofOfAddressStatus: client.proofOfAddressStatus,
          proofOfAddressType: client.proofOfAddressType,
          businessRegistrationNumber: client.businessRegistrationNumber,
          authorizedRepresentativeName: client.authorizedRepresentativeName,
          signatoryAuthorityConfirmed: client.signatoryAuthorityConfirmed,
          kycReviewDueAt: client.kycReviewDueAt?.toISOString() ?? null,
          termsAcceptedVersion: client.consents.find((consent) => consent.consentType === "brokerage_terms" && consent.accepted && !consent.withdrawnAt)?.version ?? null,
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
