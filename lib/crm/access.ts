/**
 * Tenant and investor isolation for conversations. Pure — no Prisma import — so
 * every rule is unit-testable, and every route funnels through these helpers
 * rather than hand-rolling `where` clauses.
 *
 * When real authentication replaces the demo headers, only the identity that
 * feeds these functions changes; the rules themselves stay put.
 */

import { hasPermission, CRM_PERMISSIONS, type Role } from "../frank";
import { isThreadClosed } from "./status";

export type BrokerActorLike = { id: string | null; role: Role; brokerId: string };
export type InvestorContextLike = { brokerId: string; clientId: string };
export type ThreadTenantRef = { brokerId: string; clientId: string };

/**
 * One message for every miss. A cross-tenant probe and a genuinely missing row
 * must be indistinguishable, otherwise the 404 becomes an enumeration oracle.
 */
export const NOT_FOUND_MESSAGE = "Conversation not found.";

function notFound(): never {
  throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
}

export function canViewThread(actor: BrokerActorLike, thread: ThreadTenantRef): boolean {
  return hasPermission(actor.role, CRM_PERMISSIONS.view) && actor.brokerId === thread.brokerId;
}

/** Broker-side tenant check. Throws an identical 404 for missing and foreign rows. */
export function assertBrokerTenant(
  actor: { brokerId: string },
  thread: ThreadTenantRef | null | undefined,
): asserts thread is ThreadTenantRef {
  if (!thread || thread.brokerId !== actor.brokerId) notFound();
}

/** Investor-side ownership check — both tenant AND client must match. */
export function assertInvestorOwns(
  context: InvestorContextLike,
  thread: ThreadTenantRef | null | undefined,
): asserts thread is ThreadTenantRef {
  if (!thread || thread.brokerId !== context.brokerId || thread.clientId !== context.clientId) notFound();
}

export function canReplyAsInvestor(threadStatus: string): boolean {
  return !isThreadClosed(threadStatus);
}

export function assertInvestorCanPost(thread: { status: string }): void {
  if (!canReplyAsInvestor(thread.status)) {
    throw new Response("This conversation is closed. Start a new request to continue.", { status: 409 });
  }
}

/** Plain objects the routes spread into a Prisma `where` — never a raw client id. */
export function investorThreadWhere(context: InvestorContextLike) {
  return { brokerId: context.brokerId, clientId: context.clientId };
}

export function investorThreadByIdWhere(context: InvestorContextLike, threadId: string) {
  return { id: threadId, brokerId: context.brokerId, clientId: context.clientId };
}

/**
 * An investor may download an attachment only when it belongs to their own
 * client, in their own tenant, AND is shared rather than internal.
 */
export function investorAttachmentWhere(context: InvestorContextLike, attachmentId: string) {
  return {
    id: attachmentId,
    brokerId: context.brokerId,
    clientId: context.clientId,
    visibility: "shared" as const,
    thread: { brokerId: context.brokerId, clientId: context.clientId },
  };
}

export function brokerAttachmentWhere(actor: { brokerId: string }, attachmentId: string) {
  return { id: attachmentId, brokerId: actor.brokerId };
}
