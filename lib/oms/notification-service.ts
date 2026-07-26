import type { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";

/**
 * In-app notifications. Written inside the same transaction as the audit/order
 * event that triggers them, so a lifecycle change and the people it needs to
 * reach are recorded atomically. Broker notifications are targeted at the roles
 * that must act (approve, execute, settle); investor notifications are scoped to
 * one client; platform notifications reach the super-admin console.
 */

// Role groups by the action a notification asks for. A reader sees a broker
// notification when their active role is in the target list (or the list is empty
// = all broker staff). Management is oversight-only and sees everything.
export const APPROVERS = ["broker_admin", "compliance"];
export const TRADERS = ["broker_admin", "trader", "operations"];
export const SETTLEMENT = ["broker_admin", "settlement", "operations"];
export const COMPLIANCE = ["broker_admin", "compliance"];
export const OPS = ["broker_admin", "operations"];
// Investor-servicing staff - the people who answer client conversations.
export const SERVICE = ["broker_admin", "service_officer", "relationship_officer", "operations"];

export type NotifyInput = {
  scope: "broker" | "investor" | "platform";
  brokerId?: string | null;
  roles?: string[] | null;
  clientId?: string | null;
  category: "order" | "kyc" | "settlement" | "trade" | "reconciliation" | "account" | "system" | "support";
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  dedupeKey?: string | null;
};

function notificationData(input: NotifyInput) {
  return {
    id: crypto.randomUUID(),
    dedupeKey: input.dedupeKey ?? null,
    scope: input.scope,
    brokerId: input.brokerId ?? null,
    roles: input.roles && input.roles.length ? input.roles.join(",") : null,
    clientId: input.clientId ?? null,
    category: input.category,
    severity: input.severity ?? "info",
    title: input.title,
    body: input.body,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
  };
}

export async function writeNotification(tx: Prisma.TransactionClient, input: NotifyInput) {
  return tx.notification.create({ data: notificationData(input) });
}

export async function writeNotificationOnce(tx: Prisma.TransactionClient, input: NotifyInput & { dedupeKey: string }) {
  return tx.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: notificationData(input),
    update: {},
  });
}

/**
 * Create a notification only if one with the same `dedupeKey` does not already
 * exist. Used by the scheduled sweep so re-running the daily job (or running it
 * more than once a day) never produces duplicate reminders. Returns true when a
 * new notification was created.
 */
export async function createNotificationOnce(input: NotifyInput & { dedupeKey: string }): Promise<boolean> {
  try {
    await prisma.notification.create({ data: notificationData(input) });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002") {
      return false; // reminder already sent for this key
    }
    throw error;
  }
}

/** True when a broker user with `role` should see a broker-scoped notification. */
export function roleMatches(role: string, roles: string | null): boolean {
  if (!roles) return true; // untargeted broker notice = all staff
  return roles.split(",").map((item) => item.trim()).includes(role);
}
