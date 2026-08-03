export type AppTarget =
  | { view: "orders"; entityId: string; entityType: "order" | "trade" }
  | { view: "clients"; entityId: string; entityType: "client" | "account"; tab?: "overview" | "documents" }
  | { view: "crm"; entityId: string; entityType: "communication_thread" | "service_request" }
  | { view: "crm_tasks"; entityId: string; entityType: "crm_task" }
  | { view: "crm_cases"; entityId: string; entityType: "service_case" }
  | { view: "cash"; entityId: string; entityType: "cash_movement" }
  | { view: "settlement"; entityId: string; entityType: "settlement"; orderId?: string }
  | { view: "reconciliation"; entityId: string; entityType: "reconciliation_exception" | "reconciliation_batch" }
  | { view: "advisory"; entityId: string; entityType: "advisory_deal" | "deal_task" | "deal_checklist_item" | "regulatory_query" };

export type WorkItemKind =
  | "order"
  | "onboarding"
  | "cash"
  | "settlement"
  | "reconciliation"
  | "conversation"
  | "task"
  | "case"
  | "service_request"
  | "advisory";

export type WorkItem = {
  id: string;
  kind: WorkItemKind;
  urgency: "critical" | "high" | "normal";
  title: string;
  detail: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  createdAt: string;
  readOnly: boolean;
  target: AppTarget;
};

export type SearchResult = {
  id: string;
  entityType: AppTarget["entityType"];
  title: string;
  context: string;
  status: string;
  target: AppTarget;
};

const urgencyRank: Record<WorkItem["urgency"], number> = { critical: 0, high: 1, normal: 2 };

export function sortWorkItems(left: WorkItem, right: WorkItem): number {
  const urgency = urgencyRank[left.urgency] - urgencyRank[right.urgency];
  if (urgency) return urgency;
  if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
  if (left.dueAt) return -1;
  if (right.dueAt) return 1;
  return right.createdAt.localeCompare(left.createdAt);
}
