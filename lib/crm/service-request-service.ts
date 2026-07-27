import { Prisma } from "../../app/generated/prisma/client";
import { ZERO } from "../money";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { writeNotification } from "../oms/notification-service";
import { lockThread } from "../oms/persistence";
import { appendMessage } from "./thread-service";
import { SHARED } from "./visibility";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
export type ServiceRequestDecision = "resolve" | "reject" | "approve_closure";

function parseOutcome(value: unknown) {
  const outcome = String(value ?? "").trim();
  if (outcome.length < 10 || outcome.length > 2_000) {
    throw new Response("Provide an investor-safe outcome between 10 and 2,000 characters.", { status: 400 });
  }
  return outcome;
}

export async function completeServiceRequest(
  actor: Actor,
  input: { requestId?: string; threadId?: string; clientId?: string; decision: ServiceRequestDecision; outcomeSummary: unknown },
) {
  const outcomeSummary = parseOutcome(input.outcomeSummary);
  return prisma.$transaction(async (tx) => {
    if (input.threadId) await lockThread(tx, input.threadId);
    const request = await tx.clientServiceRequest.findFirst({
      where: {
        brokerId: actor.brokerId,
        ...(input.requestId ? { id: input.requestId } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
      },
      include: { client: true, thread: true, account: { include: { holdings: true, orders: true } } },
    });
    if (!request) throw new Response("Service request not found.", { status: 404 });
    if (!["open", "under_review"].includes(request.status)) throw new Response("This request has already been completed.", { status: 409 });

    if (input.decision === "approve_closure") {
      if (request.requestType !== "account_closure" || !request.account) throw new Response("This is not an account closure request.", { status: 400 });
      const activeOrders = request.account.orders.filter((order) => !["rejected", "cancelled", "settled", "failed", "validation_failed"].includes(order.status));
      const hasCash = !request.account.totalCash.eq(ZERO) || !request.account.blockedCash.eq(ZERO) || !request.account.unsettledCash.eq(ZERO);
      const hasSecurities = request.account.holdings.some((holding) => !holding.totalQuantity.eq(ZERO) || !holding.blockedQuantity.eq(ZERO) || !holding.unsettledQuantity.eq(ZERO));
      if (activeOrders.length || hasCash || hasSecurities) {
        throw new Response("The account cannot close until open orders are completed and all cash, blocked amounts, unsettled balances, and holdings are cleared.", { status: 409 });
      }
    }

    const status = input.decision === "reject" ? "rejected" : input.decision === "approve_closure" ? "approved" : "resolved";
    const now = new Date();
    await tx.clientServiceRequest.update({
      where: { id: request.id },
      data: { status, resolutionNotes: outcomeSummary, resolvedBy: actor.id, resolvedAt: now },
    });
    if (input.decision === "approve_closure" && request.accountId) {
      await tx.account.update({ where: { id: request.accountId }, data: { status: "closed", closedAt: now, restrictionReason: "Closed following approved client request" } });
      await tx.client.update({ where: { id: request.clientId }, data: { status: "closed" } });
    }

    if (request.thread) {
      const appended = await appendMessage(tx, request.thread, {
        threadId: request.thread.id,
        visibility: SHARED,
        authorType: "broker",
        authorUserId: actor.id,
        body: outcomeSummary,
        brokerId: actor.brokerId,
        clientId: request.clientId,
      });
      await tx.communicationThread.update({
        where: { id: request.thread.id },
        data: { status: "resolved", resolvedAt: now, closedAt: null, version: { increment: 1 } },
      });
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "CRM_SERVICE_REQUEST_OUTCOME_SHARED",
        entityType: "communication_thread",
        entityId: request.thread.id,
        summary: `Outcome shared and conversation resolved for ${request.client.fullName}`,
        newValue: { messageId: appended.messageId, requestId: request.id, status: "resolved" },
      });
    }
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: input.decision === "approve_closure" ? "CLIENT_ACCOUNT_CLOSED" : input.decision === "reject" ? "CLIENT_REQUEST_REJECTED" : "CLIENT_REQUEST_RESOLVED",
      entityType: "client_service_request",
      entityId: request.id,
      summary: `${request.subject} ${status} for ${request.client.fullName}`,
      previousValue: { status: request.status },
      newValue: { status, outcomeSummary, threadId: request.threadId },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: request.clientId,
      category: "support",
      severity: status === "rejected" ? "warning" : "success",
      title: status === "rejected" ? "Your request was reviewed" : "Your request was completed",
      body: request.subject,
      entityType: request.threadId ? "communication_thread" : "client_service_request",
      entityId: request.threadId ?? request.id,
    });
    return { requestId: request.id, threadId: request.threadId, status, conversationStatus: request.thread ? "resolved" : null };
  }, transactionOptions);
}
