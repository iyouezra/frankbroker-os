import type { Prisma } from "../../app/generated/prisma/client";

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

export type NotifyInput = {
  scope: "broker" | "investor" | "platform";
  brokerId?: string | null;
  roles?: string[] | null;
  clientId?: string | null;
  category: "order" | "kyc" | "settlement" | "trade" | "reconciliation" | "account" | "system";
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  link?: string;
};

export async function writeNotification(tx: Prisma.TransactionClient, input: NotifyInput) {
  return tx.notification.create({
    data: {
      id: crypto.randomUUID(),
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
    },
  });
}

/** True when a broker user with `role` should see a broker-scoped notification. */
export function roleMatches(role: string, roles: string | null): boolean {
  if (role === "management" || role === "super_admin") return true; // oversight sees all
  if (!roles) return true; // untargeted broker notice = all staff
  return roles.split(",").map((item) => item.trim()).includes(role);
}
