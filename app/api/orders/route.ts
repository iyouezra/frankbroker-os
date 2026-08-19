import { prisma } from "../../../lib/prisma";
import { addisBusinessDate, addisDayStart } from "../../../lib/addis-date";
import { toNum } from "../../../lib/money";
import { apiError as routeError } from "../../../lib/api";
import { normalizeOrderType, parseOrderSide, parsePositiveFiniteNumber } from "../../../lib/order-input";
import { createSubmittedOrder } from "../../../lib/oms/order-service";
import { Prisma } from "../../generated/prisma/client";
import { csvCell, MARKET_LINK_ELIGIBLE_STATUSES, ORDER_STATUS_GROUPS, orderResponsibility } from "../../../lib/order-log";
import { requireTenantModule } from "../../../lib/tenant-capabilities";
import { assertBusinessDayOpen } from "../../../lib/reconciliation-service";

export const runtime = "nodejs";

const normalizeFeeBreakdown = (value: unknown) => {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { brokerage: Number(data.brokerage ?? 0), regulator: Number(data.regulator ?? 0), exchange: Number(data.exchange ?? 0), csd: Number(data.csd ?? 0), total: Number(data.total ?? 0), policy: data.policy };
};

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100_000);
    const pageSize = boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100);
    const query = url.searchParams.get("query")?.trim().slice(0, 120) ?? "";
    const status = url.searchParams.get("status") ?? "all";
    const side = url.searchParams.get("side") ?? "all";
    const instrumentId = url.searchParams.get("instrumentId")?.trim().slice(0, 120) ?? "";
    const eligibleForMarket = url.searchParams.get("eligibleForMarket") === "true";
    const risk = url.searchParams.get("risk") ?? "all";
    const orderType = url.searchParams.get("orderType")?.trim().slice(0, 40) ?? "all";
    const source = url.searchParams.get("source")?.trim().slice(0, 40) ?? "all";
    const period = url.searchParams.get("period") ?? "all";
    const sort = url.searchParams.get("sort") ?? "newest";
    const requestedStatuses = ORDER_STATUS_GROUPS[status] ?? (status !== "all" ? [status] : []);
    const since = periodStart(period);
    const where: Prisma.OrderWhereInput = {
      brokerId: actor.brokerId,
      ...(requestedStatuses.length ? { status: { in: [...requestedStatuses] } } : {}),
      ...(["buy", "sell"].includes(side) ? { side } : {}),
      ...(instrumentId ? { instrumentId } : {}),
      ...(eligibleForMarket ? { status: { in: [...MARKET_LINK_ELIGIBLE_STATUSES] }, remainingQuantity: { gt: 0 } } : {}),
      ...(risk === "flagged" ? { riskFlag: { not: "none" } } : {}),
      ...(orderType !== "all" ? { orderType } : {}),
      ...(source !== "all" ? { source } : {}),
      ...(since ? { submittedAt: { gte: since } } : {}),
      ...(query ? {
        OR: [
          { id: { contains: query, mode: "insensitive" } },
          { status: { contains: query, mode: "insensitive" } },
          { submissionReference: { contains: query, mode: "insensitive" } },
          { account: { accountNumber: { contains: query, mode: "insensitive" } } },
          { account: { client: { fullName: { contains: query, mode: "insensitive" } } } },
          { account: { client: { clientCode: { contains: query, mode: "insensitive" } } } },
          { instrument: { symbol: { contains: query, mode: "insensitive" } } },
          { trades: { some: { captureReference: { contains: query, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = sort === "oldest"
      ? [{ submittedAt: "asc" }, { createdAt: "asc" }]
      : sort === "value"
        ? [{ estimatedNet: "desc" }, { submittedAt: "desc" }]
        : sort === "updated"
          ? [{ updatedAt: "desc" }]
          : [{ submittedAt: "desc" }, { createdAt: "desc" }];
    const select = {
      id: true,
      submissionReference: true,
      accountId: true,
      instrumentId: true,
      side: true,
      quantity: true,
      price: true,
      triggerPrice: true,
      orderType: true,
      validity: true,
      estimatedGross: true,
      estimatedFees: true,
      estimatedFeeBreakdown: true,
      estimatedNet: true,
      filledQuantity: true,
      remainingQuantity: true,
      averageFillPrice: true,
      executedGross: true,
      executedFees: true,
      executedNet: true,
      blockedCash: true,
      blockedQuantity: true,
      status: true,
      source: true,
      riskFlag: true,
      rejectionReason: true,
      submittedAt: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
      account: { select: { accountNumber: true, client: { select: { fullName: true, clientCode: true } } } },
      instrument: { select: { symbol: true } },
      assignedTrader: { select: { fullName: true } },
      approver: { select: { fullName: true } },
      trades: { select: { id: true, captureReference: true }, orderBy: { capturedAt: "asc" as const } },
    } satisfies Prisma.OrderSelect;
    const exporting = url.searchParams.get("format") === "csv";
    const total = await prisma.order.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const [rows, statusGroups, typeGroups, sourceGroups] = await Promise.all([
      prisma.order.findMany({
        where,
        select,
        orderBy,
        ...(exporting ? {} : { skip: (safePage - 1) * pageSize, take: pageSize }),
      }),
      prisma.order.groupBy({ by: ["status"], where: { brokerId: actor.brokerId }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["orderType"], where: { brokerId: actor.brokerId }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["source"], where: { brokerId: actor.brokerId }, _count: { _all: true } }),
    ]);
    const orders = rows.map((order) => {
      const trader = order.assignedTrader?.fullName ?? "Unassigned";
      return {
        id: order.id,
        createdAt: (order.submittedAt ?? order.createdAt).toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        client: order.account.client.fullName,
        clientCode: order.account.client.clientCode,
        accountId: order.accountId,
        accountNumber: order.account.accountNumber,
        instrumentId: order.instrumentId,
        symbol: order.instrument.symbol,
        side: order.side,
        quantity: toNum(order.quantity),
        price: toNum(order.price),
        triggerPrice: order.triggerPrice ? toNum(order.triggerPrice) : null,
        orderType: order.orderType,
        validity: order.validity,
        submissionReference: order.submissionReference,
        estimatedGross: toNum(order.estimatedGross),
        estimatedFees: toNum(order.estimatedFees),
        estimatedFeeBreakdown: normalizeFeeBreakdown(order.estimatedFeeBreakdown),
        estimatedNet: toNum(order.estimatedNet),
        status: order.status,
        source: order.source,
        riskFlag: order.riskFlag,
        trader,
        approvedBy: order.approver?.fullName ?? null,
        approvedAt: order.approvedAt?.toISOString() ?? null,
        rejectionReason: order.rejectionReason,
        ...orderResponsibility(order.status, trader === "Unassigned" ? null : trader),
        filledQuantity: toNum(order.filledQuantity),
        remainingQuantity: toNum(order.remainingQuantity),
        averageFillPrice: order.averageFillPrice ? toNum(order.averageFillPrice) : null,
        executedGross: toNum(order.executedGross),
        executedFees: toNum(order.executedFees),
        executedNet: toNum(order.executedNet),
        blockedCash: toNum(order.blockedCash),
        blockedQuantity: toNum(order.blockedQuantity),
        executionReferences: order.trades.map((trade) => trade.captureReference).filter(Boolean),
      };
    });
    if (exporting) {
      const headers = ["Order ID", "Submitted", "Last updated", "Client", "Client code", "Trading account", "Instrument", "Side", "Order type", "Validity", "Limit price", "Trigger price", "Ordered", "Filled", "Remaining", "Estimated gross", "Brokerage", "ECMA fee", "ESX fee", "CSD fee", "Total estimated fees", "Estimated total/net", "Executed value", "Status", "Source", "Submission reference", "Execution references", "Assigned trader", "Next action", "Action owner", "Exception reason"];
      const csv = [
        headers,
        ...orders.map((order) => [
          order.id, order.createdAt, order.updatedAt, order.client, order.clientCode, order.accountNumber,
          order.symbol, order.side, order.orderType, order.validity, order.price, order.triggerPrice ?? "",
          order.quantity, order.filledQuantity, order.remainingQuantity, order.estimatedGross,
          order.estimatedFeeBreakdown?.brokerage ?? order.estimatedFees, order.estimatedFeeBreakdown?.regulator ?? 0,
          order.estimatedFeeBreakdown?.exchange ?? 0, order.estimatedFeeBreakdown?.csd ?? 0, order.estimatedFees, order.estimatedNet, order.executedNet,
          order.status, order.source, order.submissionReference ?? "", order.executionReferences.join("; "),
          order.trader, order.nextAction, order.actionOwner, order.rejectionReason ?? "",
        ]),
      ].map((row) => row.map(csvCell).join(",")).join("\n");
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="frankbroker-orders-${addisBusinessDate()}.csv"`,
          "cache-control": "private, no-store",
        },
      });
    }
    return Response.json({
      orders,
      pagination: { page: safePage, pageSize, total, pageCount },
      facets: {
        statuses: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
        orderTypes: typeGroups.map((group) => group.orderType).sort(),
        sources: sourceGroups.map((group) => group.source).sort(),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function periodStart(period: string) {
  const now = new Date();
  if (period === "today") {
    return addisDayStart(now);
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 0;
  return days ? new Date(now.getTime() - days * 86_400_000) : null;
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "create");
    await assertBusinessDayOpen(prisma, actor.brokerId);
    const payload = (await request.json()) as {
      accountId?: string;
      instrumentId?: string;
      side?: "buy" | "sell";
      quantity?: number;
      price?: number;
      triggerPrice?: number;
      orderType?: string;
      validity?: string;
      notes?: string;
      submissionReference?: string;
      source?: string;
      verificationId?: string;
    };

    const side = parseOrderSide(payload.side);
    const quantityInput = parsePositiveFiniteNumber(payload.quantity);
    const priceInput = parsePositiveFiniteNumber(payload.price);
    const triggerPriceInput = payload.triggerPrice === undefined ? null : parsePositiveFiniteNumber(payload.triggerPrice);
    if (!payload.accountId || !payload.instrumentId || !side || quantityInput === null || priceInput === null || !payload.submissionReference?.trim()) {
      return Response.json(
        { error: "A valid account, instrument, buy/sell side, positive quantity, positive price, and submission reference are required." },
        { status: 400 },
      );
    }
    if ((payload.notes?.length ?? 0) > 2_000 || (payload.validity?.length ?? 0) > 40 || (payload.orderType?.length ?? 0) > 40 || payload.submissionReference.length > 120) {
      return Response.json({ error: "Order text fields exceed the permitted length." }, { status: 400 });
    }

    const result = await createSubmittedOrder(actor, {
      accountId: payload.accountId,
      instrumentId: payload.instrumentId,
      side,
      quantity: quantityInput,
      price: priceInput,
      triggerPrice: triggerPriceInput,
      orderType: normalizeOrderType(payload.orderType ?? "limit"),
      validity: payload.validity,
      notes: payload.notes,
      source: payload.source,
      verificationId: payload.verificationId,
      submissionReference: payload.submissionReference?.trim() || undefined,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
