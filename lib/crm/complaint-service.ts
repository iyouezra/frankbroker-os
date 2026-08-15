import { Prisma } from "../../app/generated/prisma/client";
import { writeAudit } from "../oms/audit-service";
import { SERVICE, writeNotification } from "../oms/notification-service";
import { targetResolutionDate } from "./cases";

/** Atomically promotes a conversation to the single formal complaint case linked to it. */
export async function openComplaintCaseFromThread(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; clientId: string; clientName: string; threadId: string; subject: string; assignedToUserId?: string | null; severity?: "low" | "medium" | "high" | "critical"; actorId?: string | null },
) {
  const existing = await tx.serviceCase.findUnique({ where: { threadId: input.threadId }, select: { id: true } });
  if (existing) return { id: existing.id, status: "existing" as const };
  const openedAt = new Date();
  const severity = input.severity ?? "medium";
  const id = `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await tx.serviceCase.create({ data: {
    id, brokerId: input.brokerId, clientId: input.clientId, threadId: input.threadId,
    subject: input.subject, category: "complaint", severity, status: "new",
    assignedToUserId: input.assignedToUserId ?? null, openedAt,
    targetResolutionAt: targetResolutionDate(severity, openedAt),
  } });
  await tx.communicationThread.update({ where: { id: input.threadId }, data: {
    category: "complaint", priority: severity === "critical" ? "urgent" : "high", version: { increment: 1 },
  } });
  await writeAudit(tx, {
    brokerId: input.brokerId, actorId: input.actorId ?? null, action: "CRM_CASE_OPENED",
    entityType: "service_case", entityId: id,
    summary: `Case ${id} opened from conversation ${input.threadId} for ${input.clientName}`,
    newValue: { severity, category: "complaint", threadId: input.threadId, source: input.actorId ? "broker_portal" : "investor_portal" },
  });
  await writeNotification(tx, {
    scope: "broker", brokerId: input.brokerId, roles: SERVICE, category: "support",
    severity: severity === "critical" || severity === "high" ? "critical" : "warning",
    title: "Complaint case opened", body: `${input.clientName}: ${input.subject}`,
    entityType: "service_case", entityId: id,
  });
  return { id, status: "new" as const };
}
