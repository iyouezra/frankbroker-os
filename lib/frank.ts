export type Role =
  | "broker_admin"
  | "trader"
  | "operations"
  | "compliance"
  | "settlement"
  | "relationship_officer"
  | "service_officer"
  | "management"
  | "super_admin";

export type OrderStatus =
  | "draft"
  | "submitted"
  | "validation_failed"
  | "pending_broker_review"
  | "approved"
  | "rejected"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "settlement_pending"
  | "settled"
  | "failed";

export type ValidationResult = {
  code: string;
  label: string;
  passed: boolean;
  message: string;
};

export const roleLabels: Record<Role, string> = {
  broker_admin: "Broker admin",
  trader: "Trader / dealer",
  operations: "Operations officer",
  compliance: "Compliance officer",
  settlement: "Settlement officer",
  relationship_officer: "Relationship officer",
  service_officer: "Client service officer",
  management: "Read-only management",
  super_admin: "Frank super admin",
};

/**
 * Investor-servicing permissions. The financial vocabulary above is a flat verb
 * set that cannot express who may reply to a client, add an internal note, or
 * reassign a conversation, so CRM rights are namespaced `crm.*` strings held in
 * the same map and read through the same {@link hasPermission}.
 */
export const CRM_PERMISSIONS = {
  view: "crm.thread.view",
  create: "crm.thread.create",
  reply: "crm.thread.reply",
  note: "crm.thread.note",
  assign: "crm.thread.assign",
  status: "crm.thread.status",
  priority: "crm.thread.priority",
  taskView: "crm.task.view",
  taskCreate: "crm.task.create",
  taskAssign: "crm.task.assign",
  taskComplete: "crm.task.complete",
  caseView: "crm.case.view",
  caseManage: "crm.case.manage",
  relationshipAssign: "crm.relationship.assign",
} as const;

export const MARKET_PERMISSIONS = {
  view: "market.view",
  orderBookView: "market.orderbook.view",
  recentTradesView: "market.recent_trades.view",
  orderLink: "market.order.link",
  feedStatusView: "market.feed_status.view",
} as const;

const CRM_ALL = Object.values(CRM_PERMISSIONS);
const MARKET_VIEW = [MARKET_PERMISSIONS.view, MARKET_PERMISSIONS.feedStatusView];
const MARKET_FULL = [...MARKET_VIEW, MARKET_PERMISSIONS.orderBookView, MARKET_PERMISSIONS.recentTradesView, MARKET_PERMISSIONS.orderLink];
// Every broker role may read conversations; only some may act on them.
const CRM_READ_AND_NOTE = [CRM_PERMISSIONS.view, CRM_PERMISSIONS.note, CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.caseView];
// Servicing staff own follow-ups end to end.
const CRM_TASK_FULL = [CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.taskCreate, CRM_PERMISSIONS.taskAssign, CRM_PERMISSIONS.taskComplete];

export const workflowPermissions: Record<Role, string[]> = {
  broker_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report", ...CRM_ALL, ...MARKET_FULL],
  trader: ["create", "trade", "report", ...CRM_READ_AND_NOTE, ...MARKET_FULL],
  operations: ["create", "adjust", "report", ...CRM_READ_AND_NOTE, ...CRM_TASK_FULL, ...MARKET_VIEW],
  compliance: ["approve", "reject", "report", ...CRM_READ_AND_NOTE, CRM_PERMISSIONS.status, CRM_PERMISSIONS.taskCreate, CRM_PERMISSIONS.caseManage, ...MARKET_VIEW],
  settlement: ["settle", "adjust", "report", ...CRM_READ_AND_NOTE, ...MARKET_VIEW],
  relationship_officer: [
    "report",
    CRM_PERMISSIONS.view,
    CRM_PERMISSIONS.create,
    CRM_PERMISSIONS.reply,
    CRM_PERMISSIONS.note,
    CRM_PERMISSIONS.status,
    CRM_PERMISSIONS.priority,
    ...CRM_TASK_FULL,
    CRM_PERMISSIONS.caseView,
    ...MARKET_VIEW,
  ],
  service_officer: ["create", "report", ...CRM_ALL, ...MARKET_VIEW],
  management: ["report", CRM_PERMISSIONS.view, CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.caseView, ...MARKET_VIEW],
  super_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report", ...CRM_ALL, ...MARKET_FULL],
};

/**
 * Broker commission rate applied to gross consideration. Shared by the
 * display-only {@link calculateOrderAmounts} here and the authoritative
 * Decimal `computeAmounts` in `lib/money.ts` so estimates never drift from
 * what is stored. TODO(Tier 2): move to a configurable per-broker FeeSchedule.
 */
export const FEE_RATE = 0.005;

/**
 * Display-only estimate used by the client UI. Uses JS numbers and is safe to
 * import in the browser. The server recomputes the authoritative figures with
 * Decimal math (see `lib/money.ts`) before anything is stored.
 */
export function calculateOrderAmounts(side: "buy" | "sell", quantity: number, price: number) {
  const gross = quantity * price;
  const fees = Math.round(gross * FEE_RATE * 100) / 100;
  const net = side === "buy" ? gross + fees : gross - fees;
  return { gross, fees, net };
}

export function settlementDateFrom(tradeDate: string, cycle: string) {
  const days = Number(cycle.replace(/\D/g, "")) || 2;
  const date = new Date(`${tradeDate}T12:00:00Z`);
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

export function hasPermission(role: Role, permission: string) {
  return workflowPermissions[role].includes(permission);
}
