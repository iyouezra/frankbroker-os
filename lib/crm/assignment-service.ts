import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { writeNotification } from "../oms/notification-service";

/**
 * Relationship officer assignment.
 *
 * History is preserved by ending the current row rather than overwriting it, so
 * "who owned this investor in March" stays answerable. The current assignment is
 * the single row with `endedAt: null`.
 */

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const newAssignmentId = () => `ASG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const assignmentInclude = {
  primaryOfficer: { select: { id: true, fullName: true, role: true, email: true } },
  backupOfficer: { select: { id: true, fullName: true, role: true } },
  assignedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.InvestorAssignmentInclude;

type AssignmentRow = Prisma.InvestorAssignmentGetPayload<{ include: typeof assignmentInclude }>;

export function serializeAssignment(row: AssignmentRow) {
  return {
    id: row.id,
    clientId: row.clientId,
    primaryOfficerId: row.primaryOfficerId,
    primaryOfficerName: row.primaryOfficer?.fullName ?? null,
    primaryOfficerRole: row.primaryOfficer?.role ?? null,
    backupOfficerId: row.backupOfficerId,
    backupOfficerName: row.backupOfficer?.fullName ?? null,
    team: row.team,
    branch: row.branch,
    note: row.note,
    assignedByName: row.assignedBy?.fullName ?? null,
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    current: row.endedAt === null,
  };
}

export async function getCurrentAssignment(actor: Actor, clientId: string) {
  const row = await prisma.investorAssignment.findFirst({
    where: { brokerId: actor.brokerId, clientId, endedAt: null },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });
  return row ? serializeAssignment(row) : null;
}

export async function getAssignmentHistory(actor: Actor, clientId: string) {
  const rows = await prisma.investorAssignment.findMany({
    where: { brokerId: actor.brokerId, clientId },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
    take: 25,
  });
  return rows.map(serializeAssignment);
}

/** Officer workload — open conversations and tasks each officer is carrying. */
export async function officerWorkload(actor: Actor) {
  const [officers, assignments, threads, tasks] = await Promise.all([
    prisma.user.findMany({ where: { brokerId: actor.brokerId, status: "active" }, select: { id: true, fullName: true, role: true } }),
    prisma.investorAssignment.groupBy({ by: ["primaryOfficerId"], where: { brokerId: actor.brokerId, endedAt: null }, _count: { _all: true } }),
    prisma.communicationThread.groupBy({ by: ["assignedToUserId"], where: { brokerId: actor.brokerId, status: { in: ["open", "pending_broker", "pending_client"] } }, _count: { _all: true } }),
    prisma.crmTask.groupBy({ by: ["assignedToUserId"], where: { brokerId: actor.brokerId, status: { in: ["open", "in_progress", "awaiting_investor"] } }, _count: { _all: true } }),
  ]);

  const count = (rows: { _count: { _all: number } }[], key: string | null, field: string) =>
    rows.find((row) => (row as unknown as Record<string, string | null>)[field] === key)?._count._all ?? 0;

  return officers.map((officer) => ({
    id: officer.id,
    name: officer.fullName,
    role: officer.role,
    investors: count(assignments, officer.id, "primaryOfficerId"),
    conversations: count(threads, officer.id, "assignedToUserId"),
    openTasks: count(tasks, officer.id, "assignedToUserId"),
  }));
}

export type AssignInput = {
  clientId: string;
  primaryOfficerId: string | null;
  backupOfficerId?: string | null;
  team?: string | null;
  branch?: string | null;
  note?: string | null;
};

async function requireTenantUser(tx: Prisma.TransactionClient, brokerId: string, userId: string | null | undefined) {
  if (!userId) return null;
  const user = await tx.user.findFirst({ where: { id: userId, brokerId, status: "active" }, select: { id: true, fullName: true } });
  if (!user) throw new Response("That team member is not available in this tenant.", { status: 404 });
  return user;
}

/** Reassigns one investor, ending the previous assignment rather than editing it. */
export async function assignRelationshipOfficer(actor: Actor, input: AssignInput) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, brokerId: actor.brokerId }, select: { id: true, fullName: true } });
    if (!client) throw new Response("Client not found for this tenant.", { status: 404 });

    const primary = await requireTenantUser(tx, actor.brokerId, input.primaryOfficerId);
    const backup = await requireTenantUser(tx, actor.brokerId, input.backupOfficerId);

    const previous = await tx.investorAssignment.findFirst({
      where: { brokerId: actor.brokerId, clientId: client.id, endedAt: null },
      orderBy: { assignedAt: "desc" },
    });
    const now = new Date();
    if (previous) {
      await tx.investorAssignment.update({ where: { id: previous.id }, data: { endedAt: now } });
    }

    const id = newAssignmentId();
    await tx.investorAssignment.create({
      data: {
        id,
        brokerId: actor.brokerId,
        clientId: client.id,
        primaryOfficerId: primary?.id ?? null,
        backupOfficerId: backup?.id ?? null,
        team: input.team?.trim() || null,
        branch: input.branch?.trim() || null,
        note: input.note?.trim().slice(0, 500) || null,
        assignedByUserId: actor.id,
        assignedAt: now,
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_RELATIONSHIP_ASSIGNED",
      entityType: "client",
      entityId: client.id,
      summary: primary
        ? `${client.fullName} assigned to ${primary.fullName}`
        : `${client.fullName} left without a relationship officer`,
      previousValue: { primaryOfficerId: previous?.primaryOfficerId ?? null, assignmentId: previous?.id ?? null },
      newValue: { primaryOfficerId: primary?.id ?? null, backupOfficerId: backup?.id ?? null, assignmentId: id },
    });
    if (primary) {
      await writeNotification(tx, {
        scope: "investor",
        brokerId: actor.brokerId,
        clientId: client.id,
        category: "support",
        severity: "info",
        title: "Your relationship officer",
        body: `${primary.fullName} is now looking after your account.`,
        entityType: "client",
        entityId: client.id,
      });
    }
    return { id, primaryOfficerId: primary?.id ?? null };
  }, transactionOptions);
}

/** Bulk reassignment, applied one investor at a time so each keeps its own history row. */
export async function bulkAssignRelationshipOfficer(actor: Actor, clientIds: string[], primaryOfficerId: string | null) {
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    throw new Response("Select at least one investor to reassign.", { status: 400 });
  }
  if (clientIds.length > 100) throw new Response("Reassign at most 100 investors at a time.", { status: 400 });

  let moved = 0;
  for (const clientId of clientIds) {
    await assignRelationshipOfficer(actor, { clientId, primaryOfficerId });
    moved += 1;
  }
  return { moved };
}

/** The customer-facing view: name and role only, never private staff contact details. */
export async function investorRelationshipOfficer(context: { brokerId: string; clientId: string }) {
  const row = await prisma.investorAssignment.findFirst({
    where: { brokerId: context.brokerId, clientId: context.clientId, endedAt: null },
    include: { primaryOfficer: { select: { fullName: true, role: true } } },
    orderBy: { assignedAt: "desc" },
  });
  if (!row?.primaryOfficer) return null;
  return { name: row.primaryOfficer.fullName, role: row.primaryOfficer.role };
}
