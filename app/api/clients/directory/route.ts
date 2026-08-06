import { Prisma } from "../../../generated/prisma/client";
import { apiError } from "../../../../lib/api";
import { toNum } from "../../../../lib/money";
import { prisma } from "../../../../lib/prisma";
import { requirePermission } from "../../../../lib/server-auth";

export const runtime = "nodejs";

const clientTypes = new Set(["individual", "corporate", "institution"]);
const clientStatuses = new Set(["active", "pending_approval", "restricted", "rejected"]);
const kycStatuses = new Set(["approved", "pending_review", "review_due", "pending", "rejected"]);

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, "report");
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100_000);
    const pageSize = boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100);
    const query = url.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const requestedType = url.searchParams.get("type") ?? "";
    const requestedStatus = url.searchParams.get("status") ?? "";
    const requestedKyc = url.searchParams.get("kyc") ?? "";
    const sort = url.searchParams.get("sort") === "newest" ? "newest" : "name";
    const where: Prisma.ClientWhereInput = {
      brokerId: actor.brokerId,
      ...(clientTypes.has(requestedType) ? { clientType: requestedType } : {}),
      ...(clientStatuses.has(requestedStatus) ? { status: requestedStatus } : {}),
      ...(kycStatuses.has(requestedKyc) ? { kycStatus: requestedKyc } : {}),
      ...(query ? {
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { clientCode: { contains: query, mode: "insensitive" } },
          { accounts: { some: { accountNumber: { contains: query, mode: "insensitive" } } } },
        ],
      } : {}),
    };

    const currentLegal = await prisma.legalDocument.findFirst({
      where: { brokerId: actor.brokerId, documentType: "brokerage_terms", status: "published" },
      orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
      select: { id: true, version: true },
    });
    const [rows, total, typeGroups, statusGroups] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          clientCode: true,
          fullName: true,
          clientType: true,
          kycStatus: true,
          status: true,
          riskRating: true,
          proofOfAddressStatus: true,
          createdBy: true,
          approvedBy: true,
          submittedAt: true,
          approvedAt: true,
          rejectionReason: true,
          creator: { select: { fullName: true } },
          approver: { select: { fullName: true } },
          consents: {
            where: { consentType: "brokerage_terms", accepted: true, withdrawnAt: null },
            orderBy: { acceptedAt: "desc" },
            select: { legalDocumentId: true, version: true },
          },
          screenings: {
            orderBy: { screenedAt: "desc" },
            take: 1,
            select: { result: true },
          },
          accounts: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              accountNumber: true,
              status: true,
              totalCash: true,
              availableCash: true,
              blockedCash: true,
              unsettledCash: true,
              restrictionReason: true,
              _count: { select: { holdings: true, orders: true } },
            },
          },
        },
        orderBy: sort === "newest"
          ? [{ submittedAt: "desc" }, { createdAt: "desc" }]
          : [{ fullName: "asc" }, { clientCode: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.client.count({ where }),
      prisma.client.groupBy({
        by: ["clientType"],
        where: { brokerId: actor.brokerId },
        _count: { _all: true },
      }),
      prisma.client.groupBy({
        by: ["status"],
        where: { brokerId: actor.brokerId },
        _count: { _all: true },
      }),
    ]);

    const types = { all: 0, individual: 0, corporate: 0, institution: 0 };
    for (const group of typeGroups) {
      types.all += group._count._all;
      if (group.clientType in types && group.clientType !== "all") {
        types[group.clientType as keyof Omit<typeof types, "all">] += group._count._all;
      }
    }
    const statuses = Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all]));
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return Response.json({
      clients: rows.map((client) => {
        const account = client.accounts[0];
        const acceptedTerms = currentLegal
          ? client.consents.find((consent) => consent.legalDocumentId === currentLegal.id)
          : client.consents[0];
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
          proofOfAddressStatus: client.proofOfAddressStatus,
          termsAcceptedVersion: acceptedTerms?.version ?? null,
          currentTermsVersion: currentLegal?.version ?? null,
          restrictionReason: account?.restrictionReason ?? null,
          createdBy: client.creator?.fullName ?? null,
          approvedBy: client.approver?.fullName ?? null,
          submittedAt: client.submittedAt?.toISOString() ?? null,
          approvedAt: client.approvedAt?.toISOString() ?? null,
          rejectionReason: client.rejectionReason,
          holdings: [],
          holdingCount: account?._count.holdings ?? 0,
          ledger: [],
          orderCount: account?._count.orders ?? 0,
        };
      }),
      pagination: {
        page: Math.min(page, pageCount),
        pageSize,
        total,
        pageCount,
      },
      facets: { types, statuses },
    });
  } catch (error) {
    return apiError(error);
  }
}
