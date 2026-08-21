export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "validation_failed",
  "pending_broker_review",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "partially_filled",
  "filled",
  "settlement_pending",
  "settled",
  "failed",
] as const;

export type OmsOrderStatus = (typeof ORDER_STATUSES)[number];

export class InvalidOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid order status transition: ${from} → ${to}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

const transitions: Record<OmsOrderStatus, readonly OmsOrderStatus[]> = {
  draft: ["submitted", "cancelled", "failed"],
  submitted: ["validation_failed", "pending_broker_review", "cancelled", "failed"],
  validation_failed: ["submitted", "cancelled", "failed"],
  pending_broker_review: ["approved", "rejected", "cancelled", "expired", "validation_failed", "failed"],
  approved: ["partially_filled", "filled", "cancelled", "expired", "failed"],
  rejected: [],
  cancelled: [],
  expired: [],
  partially_filled: ["partially_filled", "filled", "cancelled", "expired", "failed"],
  filled: ["settlement_pending", "failed"],
  settlement_pending: ["settlement_pending", "settled", "failed"],
  settled: [],
  failed: [],
};

export function isOrderStatus(value: string): value is OmsOrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  return isOrderStatus(from) && isOrderStatus(to) && transitions[from].includes(to);
}

export function assertTransition(from: string, to: string) {
  if (!isOrderStatus(from)) {
    throw new InvalidOrderTransitionError(from, to);
  }
  if (!isOrderStatus(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function isTerminalStatus(status: string) {
  return status === "rejected" || status === "cancelled" || status === "expired" || status === "settled" || status === "failed";
}

export function isExecutableStatus(status: string) {
  return status === "approved" || status === "partially_filled";
}

export function isEditableStatus(status: string) {
  return status === "draft" || status === "submitted" || status === "validation_failed" || status === "pending_broker_review";
}

export function availableActions(status: string) {
  switch (status) {
    case "pending_broker_review":
      return ["approve", "reject", "cancel", "fail"] as const;
    case "approved":
      return ["execute", "cancel", "fail"] as const;
    case "partially_filled":
      return ["execute", "settle", "cancel", "fail"] as const;
    case "filled":
    case "settlement_pending":
      return ["settle", "contract_note", "fail"] as const;
    case "settled":
      return ["contract_note"] as const;
    case "draft":
    case "submitted":
    case "validation_failed":
      return ["cancel", "fail"] as const;
    default:
      return [] as const;
  }
}
