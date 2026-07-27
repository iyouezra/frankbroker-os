import type { Prisma } from "../../app/generated/prisma/client";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../frank";
import { writeAudit } from "../oms/audit-service";

export type RoutedOwner = { id: string; fullName: string; reason: string };

async function eligibleUsers(tx: Prisma.TransactionClient, brokerId: string, permission: string) {
  const users = await tx.user.findMany({
    where: { brokerId, status: "active" },
    select: { id: true, fullName: true, role: true },
    orderBy: { id: "asc" },
  });
  return users.filter((user) => hasPermission(user.role as Role, permission));
}

async function leastLoaded(tx: Prisma.TransactionClient, brokerId: string, permission: string, role?: Role): Promise<RoutedOwner | null> {
  const candidates = (await eligibleUsers(tx, brokerId, permission)).filter((user) => !role || user.role === role);
  if (!candidates.length) return null;
  const ids = candidates.map((user) => user.id);
  const [threads, tasks, cases] = await Promise.all([
    tx.communicationThread.groupBy({ by: ["assignedToUserId"], where: { brokerId, assignedToUserId: { in: ids }, status: { in: ["open", "pending_broker", "pending_client"] } }, _count: { _all: true } }),
    tx.crmTask.groupBy({ by: ["assignedToUserId"], where: { brokerId, assignedToUserId: { in: ids }, status: { in: ["open", "in_progress", "awaiting_investor"] } }, _count: { _all: true } }),
    tx.serviceCase.groupBy({ by: ["assignedToUserId"], where: { brokerId, assignedToUserId: { in: ids }, status: { in: ["new", "assigned", "under_review", "awaiting_investor"] } }, _count: { _all: true } }),
  ]);
  const count = (rows: Array<{ assignedToUserId: string | null; _count: { _all: number } }>, id: string) =>
    rows.find((row) => row.assignedToUserId === id)?._count._all ?? 0;
  const chosen = candidates
    .map((user) => ({ ...user, load: count(threads, user.id) + count(tasks, user.id) + count(cases, user.id) }))
    .sort((left, right) => left.load - right.load || left.id.localeCompare(right.id))[0];
  return chosen ? { id: chosen.id, fullName: chosen.fullName, reason: role ? `specialist:${role}` : "least_loaded_eligible" } : null;
}

export async function routeInvestorConversation(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; clientId: string; category: string },
): Promise<RoutedOwner | null> {
  if (["cash", "kyc", "complaint"].includes(input.category)) {
    const specialist = await leastLoaded(tx, input.brokerId, CRM_PERMISSIONS.reply, "service_officer");
    if (specialist) return specialist;
  } else {
    const assignment = await tx.investorAssignment.findFirst({
      where: { brokerId: input.brokerId, clientId: input.clientId, endedAt: null },
      include: { primaryOfficer: { select: { id: true, fullName: true, role: true, status: true } } },
      orderBy: { assignedAt: "desc" },
    });
    const officer = assignment?.primaryOfficer;
    if (officer?.status === "active" && hasPermission(officer.role as Role, CRM_PERMISSIONS.reply)) {
      return { id: officer.id, fullName: officer.fullName, reason: "relationship_officer" };
    }
  }
  return leastLoaded(tx, input.brokerId, CRM_PERMISSIONS.reply);
}

export async function routeUnownedTask(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; threadId?: string | null; caseId?: string | null },
): Promise<RoutedOwner | null> {
  if (input.caseId) {
    const row = await tx.serviceCase.findFirst({
      where: { id: input.caseId, brokerId: input.brokerId },
      include: { assignedTo: { select: { id: true, fullName: true, role: true, status: true } } },
    });
    const owner = row?.assignedTo;
    if (owner?.status === "active" && hasPermission(owner.role as Role, CRM_PERMISSIONS.taskComplete)) {
      return { id: owner.id, fullName: owner.fullName, reason: "case_owner" };
    }
  }
  if (input.threadId) {
    const row = await tx.communicationThread.findFirst({
      where: { id: input.threadId, brokerId: input.brokerId },
      include: { assignedTo: { select: { id: true, fullName: true, role: true, status: true } } },
    });
    const owner = row?.assignedTo;
    if (owner?.status === "active" && hasPermission(owner.role as Role, CRM_PERMISSIONS.taskComplete)) {
      return { id: owner.id, fullName: owner.fullName, reason: "conversation_owner" };
    }
  }
  return leastLoaded(tx, input.brokerId, CRM_PERMISSIONS.taskComplete);
}

export async function auditAutomaticRouting(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; entityType: string; entityId: string; owner: RoutedOwner | null },
) {
  return writeAudit(tx, {
    brokerId: input.brokerId,
    actorId: null,
    action: "CRM_WORK_AUTOMATICALLY_ROUTED",
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.owner ? `${input.entityType} assigned to ${input.owner.fullName}` : `${input.entityType} left unassigned`,
    newValue: { assignedToUserId: input.owner?.id ?? null, routingReason: input.owner?.reason ?? "no_eligible_owner" },
  });
}
