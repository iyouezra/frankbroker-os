export type Role =
  | "access_admin"
  | "broker_admin"
  | "trader"
  | "operations"
  | "compliance"
  | "settlement"
  | "relationship_officer"
  | "service_officer"
  | "management"
  | "advisory_lead"
  | "advisory_analyst"
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
  access_admin: "Broker access admin",
  broker_admin: "Broker admin",
  trader: "Trader / dealer",
  operations: "Operations officer",
  compliance: "Compliance officer",
  settlement: "Settlement officer",
  relationship_officer: "Relationship officer",
  service_officer: "Client service officer",
  management: "Read-only management",
  advisory_lead: "Advisory lead",
  advisory_analyst: "Advisory analyst",
  super_admin: "Frank super admin",
};

export const ADVISORY_PERMISSIONS = {
  view: "advisory.view",
  issuerManage: "advisory.issuer.manage",
  dealManage: "advisory.deal.manage",
  stageAdvance: "advisory.deal.stage.advance",
  checklistPrepare: "advisory.checklist.prepare",
  checklistApprove: "advisory.checklist.approve",
  documentManage: "advisory.document.manage",
  taskManage: "advisory.task.manage",
  submissionManage: "advisory.submission.manage",
} as const;

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

export const COMPLIANCE_PERMISSIONS = {
  view: "compliance.view",
  reportPrepare: "compliance.report.prepare",
  reportReview: "compliance.report.review",
  reportSubmit: "compliance.report.submit",
  escalationCreate: "compliance.escalation.create",
  escalationManage: "compliance.escalation.manage",
  screeningRecord: "compliance.screening.record",
  reconciliationSignoff: "compliance.reconciliation.signoff",
  statementExport: "compliance.statement.export",
} as const;

export const MONITORING_PERMISSIONS = {
  summary: "monitoring.summary.view",
  sensitive: "monitoring.sensitive.view",
  alertManage: "monitoring.alert.manage",
  caseManage: "monitoring.case.manage",
  ruleManage: "monitoring.rule.manage",
  employeeConductManage: "monitoring.employee_conduct.manage",
  clearanceRequest: "monitoring.clearance.request",
  clearanceApprove: "monitoring.clearance.approve",
  restrictionManage: "monitoring.restriction.manage",
  withdrawalExceptionApprove: "monitoring.withdrawal_exception.approve",
  selfService: "monitoring.self_service",
} as const;

const CRM_ALL = Object.values(CRM_PERMISSIONS);
const MARKET_VIEW = [MARKET_PERMISSIONS.view, MARKET_PERMISSIONS.feedStatusView];
const MARKET_FULL = [...MARKET_VIEW, MARKET_PERMISSIONS.orderBookView, MARKET_PERMISSIONS.recentTradesView, MARKET_PERMISSIONS.orderLink];
// Every broker role may read conversations; only some may act on them.
const CRM_READ_AND_NOTE = [CRM_PERMISSIONS.view, CRM_PERMISSIONS.note, CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.caseView];
// Servicing staff own follow-ups end to end.
const CRM_TASK_FULL = [CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.taskCreate, CRM_PERMISSIONS.taskAssign, CRM_PERMISSIONS.taskComplete];
const COMPLIANCE_ALL = Object.values(COMPLIANCE_PERMISSIONS);
const MONITORING_ALL = Object.values(MONITORING_PERMISSIONS);

export const workflowPermissions: Record<Role, string[]> = {
  access_admin: ["access.manage"],
  broker_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report", ...CRM_ALL, ...MARKET_FULL, ...COMPLIANCE_ALL, MONITORING_PERMISSIONS.summary, MONITORING_PERMISSIONS.clearanceRequest, MONITORING_PERMISSIONS.selfService, ...Object.values(ADVISORY_PERMISSIONS)],
  trader: ["create", "trade", "report", ...CRM_READ_AND_NOTE, ...MARKET_FULL, COMPLIANCE_PERMISSIONS.escalationCreate, MONITORING_PERMISSIONS.clearanceRequest, MONITORING_PERMISSIONS.selfService],
  operations: ["create", "adjust", "report", ...CRM_READ_AND_NOTE, ...CRM_TASK_FULL, ...MARKET_VIEW, COMPLIANCE_PERMISSIONS.view, COMPLIANCE_PERMISSIONS.reportPrepare, COMPLIANCE_PERMISSIONS.escalationCreate, COMPLIANCE_PERMISSIONS.statementExport, MONITORING_PERMISSIONS.clearanceRequest, MONITORING_PERMISSIONS.selfService],
  compliance: ["approve", "reject", "report", ...CRM_READ_AND_NOTE, CRM_PERMISSIONS.status, CRM_PERMISSIONS.taskCreate, CRM_PERMISSIONS.caseManage, ...MARKET_VIEW, ...COMPLIANCE_ALL, ...MONITORING_ALL, ADVISORY_PERMISSIONS.view, ADVISORY_PERMISSIONS.checklistApprove],
  settlement: ["settle", "adjust", "report", ...CRM_READ_AND_NOTE, ...MARKET_VIEW, COMPLIANCE_PERMISSIONS.escalationCreate, MONITORING_PERMISSIONS.selfService],
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
    COMPLIANCE_PERMISSIONS.statementExport,
    MONITORING_PERMISSIONS.selfService,
  ],
  service_officer: ["create", "report", ...CRM_ALL, ...MARKET_VIEW, COMPLIANCE_PERMISSIONS.statementExport, COMPLIANCE_PERMISSIONS.escalationCreate, MONITORING_PERMISSIONS.selfService],
  management: ["report", CRM_PERMISSIONS.view, CRM_PERMISSIONS.taskView, CRM_PERMISSIONS.caseView, ...MARKET_VIEW, COMPLIANCE_PERMISSIONS.view, MONITORING_PERMISSIONS.summary, MONITORING_PERMISSIONS.selfService, ADVISORY_PERMISSIONS.view],
  advisory_lead: ["report", ...Object.values(ADVISORY_PERMISSIONS), MONITORING_PERMISSIONS.selfService],
  advisory_analyst: ["report", ADVISORY_PERMISSIONS.view, ADVISORY_PERMISSIONS.issuerManage, ADVISORY_PERMISSIONS.dealManage, ADVISORY_PERMISSIONS.checklistPrepare, ADVISORY_PERMISSIONS.documentManage, ADVISORY_PERMISSIONS.taskManage, MONITORING_PERMISSIONS.selfService],
  super_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report", ...CRM_ALL, ...MARKET_FULL, ...Object.values(ADVISORY_PERMISSIONS)],
};

/**
 * Default commission used only when no versioned broker fee rule is supplied.
 * Shared by the display estimate and Decimal money helpers so their fallback
 * calculations stay aligned.
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
