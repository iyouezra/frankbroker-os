import { apiError } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { ZERO } from "../../../../../lib/money";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

type ClientAction = "restrict" | "restore" | "resolve_request" | "approve_closure" | "reject_request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, "adjust");
    const { id } = await context.params;
    const payload = await request.json() as {
      action?: ClientAction;
      requestId?: string;
      reason?: string;
      resolutionNotes?: string;
    };
    if (!payload.action) return Response.json({ error: "A client action is required." }, { status: 400 });
    const reason = String(payload.reason ?? payload.resolutionNotes ?? "").trim();
    if (reason.length > 1_000) return Response.json({ error: "The reason is too long." }, { status: 400 });

    if (payload.action === "restrict" || payload.action === "restore") {
      const client = await prisma.client.findFirst({ where: { id, brokerId: actor.brokerId }, include: { accounts: true } });
      if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });
      if (payload.action === "restrict" && reason.length < 5) {
        return Response.json({ error: "A restriction reason is required." }, { status: 400 });
      }
      const nextStatus = payload.action === "restrict" ? "restricted" : "active";
      await prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { status: nextStatus } });
        await tx.account.updateMany({
          where: { clientId: id, status: { not: "closed" } },
          data: payload.action === "restrict"
            ? { status: "restricted", restrictionReason: reason, restrictedAt: new Date() }
            : { status: "active", restrictionReason: null, restrictedAt: null },
        });
        await tx.auditLog.create({ data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: payload.action === "restrict" ? "CLIENT_ACCOUNT_RESTRICTED" : "CLIENT_ACCOUNT_RESTORED",
          entityType: "client",
          entityId: id,
          summary: `${client.fullName} ${payload.action === "restrict" ? "restricted" : "restored"}`,
          reason: reason || null,
          previousValue: JSON.stringify({ clientStatus: client.status, accountStatuses: client.accounts.map((account) => account.status) }),
          newValue: JSON.stringify({ status: nextStatus }),
        } });
      });
      return Response.json({ ok: true, status: nextStatus });
    }

    const requestId = String(payload.requestId ?? "").trim();
    if (!requestId) return Response.json({ error: "A service request ID is required." }, { status: 400 });
    const serviceRequest = await prisma.clientServiceRequest.findFirst({
      where: { id: requestId, clientId: id, brokerId: actor.brokerId },
      include: {
        client: true,
        account: { include: { holdings: true, orders: true } },
      },
    });
    if (!serviceRequest) return Response.json({ error: "Service request not found." }, { status: 404 });
    if (!["open", "under_review"].includes(serviceRequest.status)) {
      return Response.json({ error: "This request has already been completed." }, { status: 409 });
    }

    if (payload.action === "approve_closure") {
      if (serviceRequest.requestType !== "account_closure" || !serviceRequest.account) {
        return Response.json({ error: "This is not an account closure request." }, { status: 400 });
      }
      const account = serviceRequest.account;
      const activeOrders = account.orders.filter((order) => !["rejected", "cancelled", "settled", "failed", "validation_failed"].includes(order.status));
      const hasCash = !account.totalCash.eq(ZERO) || !account.blockedCash.eq(ZERO) || !account.unsettledCash.eq(ZERO);
      const hasSecurities = account.holdings.some((holding) => !holding.totalQuantity.eq(ZERO) || !holding.blockedQuantity.eq(ZERO) || !holding.unsettledQuantity.eq(ZERO));
      if (activeOrders.length || hasCash || hasSecurities) {
        return Response.json({
          error: "The account cannot close until open orders are completed and all cash, blocked amounts, unsettled balances, and holdings are cleared.",
        }, { status: 409 });
      }
    }

    const status = payload.action === "reject_request" ? "rejected" : payload.action === "approve_closure" ? "approved" : "resolved";
    await prisma.$transaction(async (tx) => {
      await tx.clientServiceRequest.update({
        where: { id: serviceRequest.id },
        data: {
          status,
          resolutionNotes: reason || (status === "approved" ? "Closure controls passed." : "Reviewed by broker."),
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (payload.action === "approve_closure" && serviceRequest.accountId) {
        await tx.account.update({
          where: { id: serviceRequest.accountId },
          data: { status: "closed", closedAt: new Date(), restrictionReason: "Closed following approved client request" },
        });
        await tx.client.update({ where: { id }, data: { status: "closed" } });
      }
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(),
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: payload.action === "approve_closure" ? "CLIENT_ACCOUNT_CLOSED" : payload.action === "reject_request" ? "CLIENT_REQUEST_REJECTED" : "CLIENT_REQUEST_RESOLVED",
        entityType: "client_service_request",
        entityId: serviceRequest.id,
        summary: `${serviceRequest.subject} ${status} for ${serviceRequest.client.fullName}`,
        reason: reason || null,
        previousValue: JSON.stringify({ status: serviceRequest.status }),
        newValue: JSON.stringify({ status }),
      } });
    });
    return Response.json({ ok: true, requestId: serviceRequest.id, status });
  } catch (error) {
    return apiError(error);
  }
}
