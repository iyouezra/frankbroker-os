import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { writeNotification, SERVICE } from "../oms/notification-service";
import { NOT_FOUND_MESSAGE, assertBrokerTenant } from "./access";
import { parseRelated } from "./categories";
import {
  OPEN_TASK_STATUSES,
  TASK_STATUS_LABELS,
  assertTaskTransition,
  isTaskClosed,
  isTaskStatus,
  isTaskType,
  parseCompletionNote,
  parseDueDate,
  parseTaskDescription,
  parseTaskTitle,
  taskBucket,
  type TaskStatus,
} from "./tasks";
import { auditAutomaticRouting, routeUnownedTask, type RoutedOwner } from "./routing-service";

/**
 * Follow-up tasks. Same shape as the other services: Serializable transaction,
 * tenant-scoped reads, audit on every mutation, `Response` throws.
 */

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const newTaskId = () => `TSK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const taskInclude = {
  client: { select: { id: true, clientCode: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.CrmTaskInclude;

type TaskRow = Prisma.CrmTaskGetPayload<{ include: typeof taskInclude }>;

export function serializeTask(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    taskType: task.taskType,
    status: task.status,
    statusLabel: TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status,
    priority: task.priority,
    escalated: task.escalated,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    bucket: taskBucket({ status: task.status, dueDate: task.dueDate }),
    threadId: task.threadId,
    caseId: task.caseId,
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    client: task.client ? { id: task.client.id, code: task.client.clientCode, name: task.client.fullName } : null,
    assignedToUserId: task.assignedToUserId,
    assignedToName: task.assignedTo?.fullName ?? null,
    createdByName: task.createdBy?.fullName ?? null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    completedByName: task.completedBy?.fullName ?? null,
    completionNote: task.completionNote,
    createdAt: task.createdAt.toISOString(),
  };
}

export type ListTasksQuery = {
  page: number;
  pageSize: number;
  scope?: string;
  status?: string;
  clientId?: string;
  assigned?: string;
  query?: string;
};

export async function listTasks(actor: Actor, query: ListTasksQuery) {
  const where: Prisma.CrmTaskWhereInput = { brokerId: actor.brokerId };
  if (query.scope === "mine") where.assignedToUserId = actor.id;
  else if (query.scope === "unassigned") where.assignedToUserId = null;
  if (query.assigned) where.assignedToUserId = query.assigned;
  if (query.clientId) where.clientId = query.clientId;
  if (query.status === "open_all") where.status = { in: OPEN_TASK_STATUSES };
  else if (query.status && isTaskStatus(query.status)) where.status = query.status;
  const search = (query.query ?? "").trim().slice(0, 120);
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
      { client: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total, mineOpen] = await Promise.all([
    prisma.crmTask.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.crmTask.count({ where }),
    prisma.crmTask.findMany({
      where: { brokerId: actor.brokerId, assignedToUserId: actor.id, status: { in: OPEN_TASK_STATUSES } },
      select: { status: true, dueDate: true },
    }),
  ]);

  const today = new Date();
  const buckets = { overdue: 0, today: 0, upcoming: 0, no_due_date: 0, completed: 0 };
  for (const task of mineOpen) buckets[taskBucket(task, today)] += 1;

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  return {
    tasks: rows.map(serializeTask),
    pagination: { page: Math.min(query.page, pageCount), pageSize: query.pageSize, total, pageCount },
    facets: buckets,
  };
}

export type CreateTaskInput = {
  clientId: string;
  title: unknown;
  description?: unknown;
  taskType?: unknown;
  dueDate?: unknown;
  priority?: unknown;
  assignedToUserId?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  relatedType?: unknown;
  relatedId?: unknown;
};

export async function createTask(actor: Actor, input: CreateTaskInput) {
  const title = parseTaskTitle(input.title);
  const description = parseTaskDescription(input.description);
  const dueDate = parseDueDate(input.dueDate);
  const taskType = isTaskType(input.taskType) ? input.taskType : "follow_up";
  const priority = ["low", "normal", "high", "urgent"].includes(String(input.priority)) ? String(input.priority) : "normal";
  const { relatedType, relatedId } = parseRelated(input.relatedType, input.relatedId);

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: input.clientId, brokerId: actor.brokerId }, select: { id: true, fullName: true } });
    if (!client) throw new Response("Client not found for this tenant.", { status: 404 });

    // A linked thread or case must belong to the same tenant and client.
    if (input.threadId) {
      const thread = await tx.communicationThread.findFirst({ where: { id: input.threadId, brokerId: actor.brokerId, clientId: client.id }, select: { id: true } });
      if (!thread) throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
    }
    if (input.caseId) {
      const serviceCase = await tx.serviceCase.findFirst({ where: { id: input.caseId, brokerId: actor.brokerId, clientId: client.id }, select: { id: true } });
      if (!serviceCase) throw new Response("Service case not found.", { status: 404 });
    }
    let assignee: ({ id: string; fullName: string } & Partial<Pick<RoutedOwner, "reason">>) | null = null;
    if (input.assignedToUserId) {
      assignee = await tx.user.findFirst({ where: { id: input.assignedToUserId, brokerId: actor.brokerId, status: "active" }, select: { id: true, fullName: true } });
      if (!assignee) throw new Response("That team member is not available in this tenant.", { status: 404 });
    }
    if (!assignee) {
      assignee = await routeUnownedTask(tx, { brokerId: actor.brokerId, threadId: input.threadId, caseId: input.caseId });
    }

    const id = newTaskId();
    await tx.crmTask.create({
      data: {
        id,
        brokerId: actor.brokerId,
        clientId: client.id,
        threadId: input.threadId ?? null,
        caseId: input.caseId ?? null,
        relatedType,
        relatedId,
        title,
        description,
        taskType,
        priority,
        dueDate,
        assignedToUserId: assignee?.id ?? null,
        createdByUserId: actor.id,
        status: "open",
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_TASK_CREATED",
      entityType: "crm_task",
      entityId: id,
      summary: `Task "${title}" created for ${client.fullName}`,
      newValue: { taskType, priority, dueDate: dueDate?.toISOString().slice(0, 10) ?? null, assignedToUserId: assignee?.id ?? null },
    });
    await auditAutomaticRouting(tx, {
      brokerId: actor.brokerId,
      entityType: "crm_task",
      entityId: id,
      owner: assignee ? { id: assignee.id, fullName: assignee.fullName, reason: assignee.reason ?? "explicit_owner" } : null,
    });
    // Notify the desk when a task lands unowned; an owned task is already known
    // to its owner because they were chosen deliberately.
    if (!assignee) {
      await writeNotification(tx, {
        scope: "broker",
        brokerId: actor.brokerId,
        roles: SERVICE,
        category: "support",
        severity: "info",
        title: "Unassigned follow-up",
        body: `${title} · ${client.fullName}`,
        entityType: "crm_task",
        entityId: id,
      });
    }
    return { id, status: "open" as const };
  }, transactionOptions);
}

async function loadTask(tx: Prisma.TransactionClient, actor: Actor, taskId: string) {
  const task = await tx.crmTask.findFirst({
    where: { id: taskId, brokerId: actor.brokerId },
    include: { client: { select: { id: true, fullName: true } } },
  });
  assertBrokerTenant(actor, task ? { brokerId: task.brokerId, clientId: task.clientId } : null);
  return task!;
}

export async function changeTaskStatus(actor: Actor, taskId: string, next: string, completionNote?: unknown) {
  if (!isTaskStatus(next)) throw new Response("That task status is not supported.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const task = await loadTask(tx, actor, taskId);
    assertTaskTransition(task.status, next);
    const note = next === "completed" ? parseCompletionNote(completionNote) : null;
    const completing = isTaskClosed(next);

    await tx.crmTask.update({
      where: { id: taskId },
      data: {
        status: next,
        completedAt: completing ? new Date() : null,
        completedByUserId: completing ? actor.id : null,
        completionNote: next === "completed" ? note : null,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: next === "completed" ? "CRM_TASK_COMPLETED" : "CRM_TASK_STATUS_CHANGED",
      entityType: "crm_task",
      entityId: taskId,
      summary: `Task "${task.title}" moved to ${TASK_STATUS_LABELS[next]}`,
      previousValue: { status: task.status },
      newValue: { status: next, completedBy: completing ? actor.id : null, completionNote: note },
    });
    return { status: next };
  }, transactionOptions);
}

export async function assignTask(actor: Actor, taskId: string, assigneeUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const task = await loadTask(tx, actor, taskId);
    if (isTaskClosed(task.status)) throw new Response("A completed or cancelled task cannot be reassigned.", { status: 409 });

    let assignee: { id: string; fullName: string } | null = null;
    if (assigneeUserId) {
      assignee = await tx.user.findFirst({ where: { id: assigneeUserId, brokerId: actor.brokerId, status: "active" }, select: { id: true, fullName: true } });
      if (!assignee) throw new Response("That team member is not available in this tenant.", { status: 404 });
    }
    await tx.crmTask.update({ where: { id: taskId }, data: { assignedToUserId: assignee?.id ?? null, version: { increment: 1 } } });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_TASK_ASSIGNED",
      entityType: "crm_task",
      entityId: taskId,
      summary: assignee ? `Task "${task.title}" assigned to ${assignee.fullName}` : `Task "${task.title}" unassigned`,
      previousValue: { assignedToUserId: task.assignedToUserId },
      newValue: { assignedToUserId: assignee?.id ?? null },
    });
    return { assignedToUserId: assignee?.id ?? null };
  }, transactionOptions);
}

export async function escalateTask(actor: Actor, taskId: string, escalated: boolean) {
  return prisma.$transaction(async (tx) => {
    const task = await loadTask(tx, actor, taskId);
    await tx.crmTask.update({ where: { id: taskId }, data: { escalated, version: { increment: 1 } } });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: escalated ? "CRM_TASK_ESCALATED" : "CRM_TASK_DE_ESCALATED",
      entityType: "crm_task",
      entityId: taskId,
      summary: `Task "${task.title}" ${escalated ? "escalated" : "de-escalated"}`,
      previousValue: { escalated: task.escalated },
      newValue: { escalated },
    });
    if (escalated) {
      await writeNotification(tx, {
        scope: "broker",
        brokerId: actor.brokerId,
        roles: SERVICE,
        category: "support",
        severity: "warning",
        title: "Task escalated",
        body: `${task.title} · ${task.client.fullName}`,
        entityType: "crm_task",
        entityId: taskId,
      });
    }
    return { escalated };
  }, transactionOptions);
}

/** Tasks for one client, used by the Client 360 timeline and task panel. */
export async function listClientTasks(actor: Actor, clientId: string) {
  const rows = await prisma.crmTask.findMany({
    where: { brokerId: actor.brokerId, clientId },
    include: taskInclude,
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });
  return rows.map(serializeTask);
}
