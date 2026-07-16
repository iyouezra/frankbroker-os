import type { Prisma } from "../../app/generated/prisma/client";
import { assertTransition } from "./status";

export type AuditInput = {
  brokerId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
};

function serialized(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.auditLog.create({
    data: {
      id: crypto.randomUUID(),
      brokerId: input.brokerId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      previousValue: serialized(input.previousValue),
      newValue: serialized(input.newValue),
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export async function writeOrderEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string | null;
    reason?: string | null;
    detail?: unknown;
  },
) {
  if (input.fromStatus !== null) assertTransition(input.fromStatus, input.toStatus);
  return tx.orderEvent.create({
    data: {
      id: crypto.randomUUID(),
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      reason: input.reason ?? null,
      detail: serialized(input.detail),
    },
  });
}
