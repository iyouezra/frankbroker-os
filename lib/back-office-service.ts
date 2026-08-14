import { prisma } from "./prisma";
import { ADVISORY_PERMISSIONS, CRM_PERMISSIONS, hasPermission } from "./frank";
import type { Actor } from "./server-auth";
import { sortWorkItems, type SearchResult, type WorkItem } from "./back-office";
import { addisBusinessDate } from "./addis-date";

const OPEN_THREAD_STATUSES = ["open", "pending_broker", "pending_client"];
const OPEN_TASK_STATUSES = ["open", "in_progress", "awaiting_investor"];
const OPEN_CASE_STATUSES = ["new", "assigned", "under_review", "awaiting_investor"];
const CLIENT_ROLES = ["broker_admin", "operations", "compliance", "relationship_officer", "service_officer", "super_admin"];

const iso = (value: Date) => value.toISOString();
const name = (value: { fullName: string } | null | undefined) => value?.fullName ?? null;

export async function listWorkItems(actor: Actor): Promise<{ items: WorkItem[]; counts: Record<string, number> }> {
  const management = actor.role === "management";
  const canClient = CLIENT_ROLES.includes(actor.role);
  const canAdjust = hasPermission(actor.role, "adjust");
  const canSettle = hasPermission(actor.role, "settle") || canAdjust;
  const canApprove = hasPermission(actor.role, "approve");
  const canCrm = hasPermission(actor.role, CRM_PERMISSIONS.view);
  const ownerWhere = management ? {} : { OR: [{ assignedToUserId: actor.id }, { assignedToUserId: null }] };

  const canAdvisory = hasPermission(actor.role, ADVISORY_PERMISSIONS.view);
  const [orders, clients, dealTasks, checklistApprovals, regulatoryQueries, cash, settlements, exceptions, threads, tasks, cases, requests] = await Promise.all([
    canApprove || management
      ? prisma.order.findMany({
          where: { brokerId: actor.brokerId, status: { in: ["pending_broker_review", "validation_failed"] } },
          include: { account: { include: { client: true } }, instrument: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    canClient || management
      ? prisma.client.findMany({ where: { brokerId: actor.brokerId, status: "pending_approval" }, orderBy: { createdAt: "desc" }, take: 100 })
      : [],
    canAdvisory ? prisma.dealTask.findMany({ where: { tenantId: actor.brokerId, status: { not: "completed" }, ...(management ? {} : { OR: [{ assignedToUserId: actor.id }, { assignedToUserId: null }] }) }, include: { deal: { include: { issuer: true } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 100 }) : [],
    canAdvisory ? prisma.dealChecklistItem.findMany({ where: { tenantId: actor.brokerId, status: "pending_approval" }, include: { deal: { include: { issuer: true } } }, orderBy: { updatedAt: "asc" }, take: 100 }) : [],
    canAdvisory ? prisma.regulatoryQuery.findMany({ where: { tenantId: actor.brokerId, status: { in: ["open", "draft_response"] }, ...(management ? {} : { OR: [{ ownerUserId: actor.id }, { ownerUserId: null }] }) }, include: { submission: { include: { deal: { include: { issuer: true } } } } }, orderBy: [{ dueDate: "asc" }, { receivedAt: "desc" }], take: 100 }) : [],
    canAdjust || management
      ? prisma.cashMovement.findMany({
          where: { brokerId: actor.brokerId, status: { in: ["pending_verification", "pending_approval", "approved"] } },
          include: { client: true },
          orderBy: { submittedAt: "desc" },
          take: 100,
        })
      : [],
    canSettle || management
      ? prisma.settlement.findMany({
          where: { status: { not: "settled" }, trade: { order: { brokerId: actor.brokerId } } },
          include: { trade: { include: { order: { include: { account: { include: { client: true } }, instrument: true } } } } },
          orderBy: { settlementDate: "asc" },
          take: 100,
        })
      : [],
    canAdjust || management
      ? prisma.reconciliationException.findMany({
          where: { status: { not: "resolved" }, batch: { brokerId: actor.brokerId } },
          include: { batch: true },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : [],
    canCrm
      ? prisma.communicationThread.findMany({
          where: {
            brokerId: actor.brokerId,
            status: { in: OPEN_THREAD_STATUSES },
            OR: [
              { brokerUnreadCount: { gt: 0 }, ...ownerWhere },
              {
                serviceRequest: { is: { status: { in: ["open", "under_review"] } } },
                ...(management || canAdjust ? {} : ownerWhere),
              },
            ],
          },
          include: { client: true, assignedTo: true, serviceRequest: true },
          orderBy: { lastMessageAt: "desc" },
          take: 100,
        })
      : [],
    hasPermission(actor.role, CRM_PERMISSIONS.taskView)
      ? prisma.crmTask.findMany({
          where: { brokerId: actor.brokerId, status: { in: OPEN_TASK_STATUSES }, ...ownerWhere },
          include: { client: true, assignedTo: true },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 100,
        })
      : [],
    hasPermission(actor.role, CRM_PERMISSIONS.caseView)
      ? prisma.serviceCase.findMany({
          where: { brokerId: actor.brokerId, status: { in: OPEN_CASE_STATUSES }, ...ownerWhere },
          include: { client: true, assignedTo: true },
          orderBy: [{ targetResolutionAt: "asc" }, { openedAt: "desc" }],
          take: 100,
        })
      : [],
    canClient || management
      ? prisma.clientServiceRequest.findMany({
          where: { brokerId: actor.brokerId, status: { in: ["open", "under_review"] }, threadId: null },
          include: { client: true },
          orderBy: { submittedAt: "desc" },
          take: 100,
        })
      : [],
  ]);

  const today = addisBusinessDate();
  const items: WorkItem[] = [
    ...orders.map((order): WorkItem => ({
      id: `order:${order.id}`,
      kind: "order",
      urgency: order.status === "validation_failed" || order.riskFlag !== "none" ? "critical" : "high",
      title: order.status === "validation_failed" ? "Order validation failed" : "Order awaiting approval",
      detail: `${order.id} · ${order.account.client.fullName} · ${order.side.toUpperCase()} ${order.quantity.toString()} ${order.instrument.symbol}`,
      status: order.status,
      ownerId: order.assignedTraderId,
      ownerName: null,
      dueAt: null,
      createdAt: iso(order.createdAt),
      readOnly: management,
      target: { view: "orders", entityType: "order", entityId: order.id },
    })),
    ...clients.map((client): WorkItem => ({
      id: `client:${client.id}`,
      kind: "onboarding",
      urgency: client.riskRating === "enhanced" || client.riskRating === "review" ? "high" : "normal",
      title: "Client awaiting onboarding approval",
      detail: `${client.clientCode} · ${client.fullName} · KYC ${client.kycStatus.replaceAll("_", " ")}`,
      status: client.status,
      ownerId: null,
      ownerName: null,
      dueAt: null,
      createdAt: iso(client.createdAt),
      readOnly: management,
      target: { view: "clients", entityType: "client", entityId: client.id, tab: "overview" },
    })),
    ...cash.map((movement): WorkItem => ({
      id: `cash:${movement.id}`,
      kind: "cash",
      urgency: "high",
      title: movement.status === "approved" ? "Withdrawal awaiting payment" : movement.movementType === "deposit" ? "Deposit awaiting verification" : "Withdrawal awaiting approval",
      detail: `${movement.id} · ${movement.client.fullName} · ${movement.amount.toString()} ${movement.currency}`,
      status: movement.status,
      ownerId: null,
      ownerName: null,
      dueAt: null,
      createdAt: iso(movement.submittedAt),
      readOnly: management,
      target: { view: "cash", entityType: "cash_movement", entityId: movement.id },
    })),
    ...settlements.map((settlement): WorkItem => {
      const order = settlement.trade.order;
      const due = settlement.settlementDate.toISOString().slice(0, 10);
      return {
        id: `settlement:${settlement.id}`,
        kind: "settlement",
        urgency: due < today || settlement.cashStatus === "exception" || settlement.securitiesStatus === "exception" ? "critical" : "high",
        title: due < today ? "Settlement overdue" : "Settlement awaiting confirmation",
        detail: `${settlement.tradeId} · ${order.account.client.fullName} · ${order.instrument.symbol}`,
        status: settlement.status,
        ownerId: settlement.confirmedBy,
        ownerName: null,
        dueAt: due,
        createdAt: iso(settlement.createdAt),
        readOnly: management,
        target: { view: "settlement", entityType: "settlement", entityId: settlement.id, orderId: order.id },
      };
    }),
    ...exceptions.map((exception): WorkItem => ({
      id: `reconciliation:${exception.id}`,
      kind: "reconciliation",
      urgency: "critical",
      title: "Reconciliation exception",
      detail: `${exception.exceptionType.replaceAll("_", " ")} · ${exception.reference}`,
      status: exception.status,
      ownerId: null,
      ownerName: null,
      dueAt: exception.batch.batchDate.toISOString().slice(0, 10),
      createdAt: iso(exception.createdAt),
      readOnly: management,
      target: { view: "reconciliation", entityType: "reconciliation_exception", entityId: exception.id },
    })),
    ...threads.map((thread): WorkItem => ({
      id: `conversation:${thread.id}`,
      kind: "conversation",
      urgency: thread.priority === "urgent" ? "critical" : thread.priority === "high" || thread.serviceRequest?.requestType === "account_closure" ? "high" : "normal",
      title: thread.serviceRequest ? thread.serviceRequest.subject : "Investor response waiting",
      detail: `${thread.client.fullName} · ${thread.subject} · ${thread.brokerUnreadCount} unread`,
      status: thread.status,
      ownerId: thread.assignedToUserId,
      ownerName: name(thread.assignedTo),
      dueAt: null,
      createdAt: iso(thread.lastMessageAt),
      readOnly: management,
      target: { view: "crm", entityType: thread.serviceRequest ? "service_request" : "communication_thread", entityId: thread.id },
    })),
    ...tasks.map((task): WorkItem => {
      const due = task.dueDate?.toISOString().slice(0, 10) ?? null;
      return {
        id: `task:${task.id}`,
        kind: "task",
        urgency: due && due < today || task.escalated || task.priority === "urgent" ? "critical" : task.priority === "high" ? "high" : "normal",
        title: task.title,
        detail: `${task.client.fullName} · ${task.assignedTo?.fullName ?? "Unassigned"}`,
        status: task.status,
        ownerId: task.assignedToUserId,
        ownerName: name(task.assignedTo),
        dueAt: due,
        createdAt: iso(task.createdAt),
        readOnly: management,
        target: { view: "crm_tasks", entityType: "crm_task", entityId: task.id },
      };
    }),
    ...cases.map((serviceCase): WorkItem => {
      const due = serviceCase.targetResolutionAt?.toISOString() ?? null;
      return {
        id: `case:${serviceCase.id}`,
        kind: "case",
        urgency: due && due.slice(0, 10) < today || serviceCase.severity === "critical" ? "critical" : serviceCase.severity === "high" ? "high" : "normal",
        title: serviceCase.subject,
        detail: `${serviceCase.client.fullName} · ${serviceCase.assignedTo?.fullName ?? "Unassigned"}`,
        status: serviceCase.status,
        ownerId: serviceCase.assignedToUserId,
        ownerName: name(serviceCase.assignedTo),
        dueAt: due,
        createdAt: iso(serviceCase.openedAt),
        readOnly: management,
        target: { view: "crm_cases", entityType: "service_case", entityId: serviceCase.id },
      };
    }),
    ...requests.map((request): WorkItem => ({
      id: `service-request:${request.id}`,
      kind: "service_request",
      urgency: request.requestType === "account_closure" ? "high" : "normal",
      title: request.subject,
      detail: `${request.client.fullName} · legacy request without conversation`,
      status: request.status,
      ownerId: null,
      ownerName: null,
      dueAt: null,
      createdAt: iso(request.submittedAt),
      readOnly: management,
      target: { view: "clients", entityType: "client", entityId: request.clientId, tab: "overview" },
    })),
    ...dealTasks.map((task): WorkItem => ({ id: `deal-task:${task.id}`, kind: "advisory", urgency: task.dueDate && task.dueDate.toISOString().slice(0, 10) < today || task.priority === "urgent" ? "critical" : task.priority === "high" ? "high" : "normal", title: task.title, detail: `${task.deal.issuer.tradingName ?? task.deal.issuer.legalName} · ${task.deal.name}`, status: task.status, ownerId: task.assignedToUserId, ownerName: null, dueAt: task.dueDate?.toISOString().slice(0, 10) ?? null, createdAt: iso(task.createdAt), readOnly: management, target: { view: "advisory", entityType: "deal_task", entityId: task.id } })),
    ...checklistApprovals.map((item): WorkItem => ({ id: `deal-checklist:${item.id}`, kind: "advisory", urgency: "high", title: "Checklist sign-off required", detail: `${item.deal.issuer.tradingName ?? item.deal.issuer.legalName} · ${item.title}`, status: item.status, ownerId: null, ownerName: null, dueAt: item.dueDate?.toISOString().slice(0, 10) ?? null, createdAt: iso(item.updatedAt), readOnly: management, target: { view: "advisory", entityType: "deal_checklist_item", entityId: item.id } })),
    ...regulatoryQueries.map((query): WorkItem => ({ id: `regulatory-query:${query.id}`, kind: "advisory", urgency: query.dueDate && query.dueDate.toISOString().slice(0, 10) < today ? "critical" : "high", title: `${query.submission.authority} query awaiting response`, detail: `${query.submission.deal.issuer.tradingName ?? query.submission.deal.issuer.legalName} · ${query.reference ?? "Query"}`, status: query.status, ownerId: query.ownerUserId, ownerName: null, dueAt: query.dueDate?.toISOString().slice(0, 10) ?? null, createdAt: iso(query.receivedAt), readOnly: management, target: { view: "advisory", entityType: "regulatory_query", entityId: query.id } })),
  ].sort(sortWorkItems);

  const visible = management ? items.filter((item) => item.urgency === "critical" || item.urgency === "high") : items;
  return {
    items: visible,
    counts: visible.reduce<Record<string, number>>((counts, item) => {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

export async function searchBackOffice(actor: Actor, rawQuery: string, rawLimit: number): Promise<{ results: SearchResult[] }> {
  const query = rawQuery.trim().slice(0, 120);
  if (query.length < 2) return { results: [] };
  const limit = Math.min(20, Math.max(1, rawLimit || 20));
  const each = Math.min(8, limit);
  const canClient = CLIENT_ROLES.includes(actor.role);
  const canCash = hasPermission(actor.role, "adjust");
  const canCrm = hasPermission(actor.role, CRM_PERMISSIONS.view);

  const [clients, accounts, orders, trades, cash, threads, tasks, cases, requests, exceptions] = await Promise.all([
    canClient ? prisma.client.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { clientCode: { contains: query, mode: "insensitive" } }, { fullName: { contains: query, mode: "insensitive" } }, { accounts: { some: { accountNumber: { contains: query, mode: "insensitive" } } } }] },
      include: { accounts: { take: 1 } }, take: each,
    }) : [],
    canClient ? prisma.account.findMany({
      where: { client: { brokerId: actor.brokerId }, OR: [{ id: { contains: query, mode: "insensitive" } }, { accountNumber: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    prisma.order.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { account: { client: { fullName: { contains: query, mode: "insensitive" } } } }, { instrument: { symbol: { contains: query, mode: "insensitive" } } }] },
      include: { account: { include: { client: true } }, instrument: true }, take: each,
    }),
    prisma.trade.findMany({
      where: { order: { brokerId: actor.brokerId }, OR: [{ id: { contains: query, mode: "insensitive" } }, { orderId: { contains: query, mode: "insensitive" } }] },
      include: { settlement: true, order: { include: { instrument: true, account: { include: { client: true } } } } }, take: each,
    }),
    canCash ? prisma.cashMovement.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { bankReference: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    canCrm ? prisma.communicationThread.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { subject: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    hasPermission(actor.role, CRM_PERMISSIONS.taskView) ? prisma.crmTask.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { title: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    hasPermission(actor.role, CRM_PERMISSIONS.caseView) ? prisma.serviceCase.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { subject: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    canClient ? prisma.clientServiceRequest.findMany({
      where: { brokerId: actor.brokerId, OR: [{ id: { contains: query, mode: "insensitive" } }, { subject: { contains: query, mode: "insensitive" } }, { client: { fullName: { contains: query, mode: "insensitive" } } }] },
      include: { client: true }, take: each,
    }) : [],
    canCash ? prisma.reconciliationException.findMany({
      where: { batch: { brokerId: actor.brokerId }, OR: [{ id: { contains: query, mode: "insensitive" } }, { reference: { contains: query, mode: "insensitive" } }] },
      include: { batch: true }, take: each,
    }) : [],
  ]);

  const results: SearchResult[] = [
    ...clients.map((row): SearchResult => ({ id: row.id, entityType: "client", title: row.fullName, context: `${row.clientCode} · ${row.accounts[0]?.accountNumber ?? "No account"}`, status: row.status, target: { view: "clients", entityType: "client", entityId: row.id } })),
    ...accounts.map((row): SearchResult => ({ id: row.id, entityType: "account", title: row.accountNumber, context: `${row.client.fullName} · ${row.client.clientCode}`, status: row.status, target: { view: "clients", entityType: "account", entityId: row.clientId } })),
    ...orders.map((row): SearchResult => ({ id: row.id, entityType: "order", title: `${row.side.toUpperCase()} ${row.instrument.symbol}`, context: row.account.client.fullName, status: row.status, target: { view: "orders", entityType: "order", entityId: row.id } })),
    ...trades.map((row): SearchResult => ({ id: row.id, entityType: "trade", title: `Trade ${row.id}`, context: `${row.order.account.client.fullName} · ${row.order.instrument.symbol}`, status: row.settlement ? "settled" : "captured", target: { view: "orders", entityType: "trade", entityId: row.orderId } })),
    ...cash.map((row): SearchResult => ({ id: row.id, entityType: "cash_movement", title: `${row.movementType} · ${row.amount.toString()} ${row.currency}`, context: row.client.fullName, status: row.status, target: { view: "cash", entityType: "cash_movement", entityId: row.id } })),
    ...threads.map((row): SearchResult => ({ id: row.id, entityType: "communication_thread", title: row.subject, context: row.client.fullName, status: row.status, target: { view: "crm", entityType: "communication_thread", entityId: row.id } })),
    ...tasks.map((row): SearchResult => ({ id: row.id, entityType: "crm_task", title: row.title, context: row.client.fullName, status: row.status, target: { view: "crm_tasks", entityType: "crm_task", entityId: row.id } })),
    ...cases.map((row): SearchResult => ({ id: row.id, entityType: "service_case", title: row.subject, context: row.client.fullName, status: row.status, target: { view: "crm_cases", entityType: "service_case", entityId: row.id } })),
    ...requests.map((row): SearchResult => ({ id: row.id, entityType: "service_request", title: row.subject, context: row.client.fullName, status: row.status, target: row.threadId ? { view: "crm", entityType: "service_request", entityId: row.threadId } : { view: "clients", entityType: "client", entityId: row.clientId, tab: "overview" } })),
    ...exceptions.map((row): SearchResult => ({ id: row.id, entityType: "reconciliation_exception", title: row.reference, context: row.exceptionType.replaceAll("_", " "), status: row.status, target: { view: "reconciliation", entityType: "reconciliation_exception", entityId: row.id } })),
  ];
  return { results: results.slice(0, limit) };
}
