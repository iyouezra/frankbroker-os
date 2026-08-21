export const ACTIVE_ORDER_STATUSES = new Set([
  "draft",
  "submitted",
  "validation_failed",
  "pending_broker_review",
  "approved",
  "partially_filled",
  "filled",
  "settlement_pending",
]);

export const ORDER_STATUS_GROUPS: Record<string, readonly string[]> = {
  open: ["draft", "submitted", "validation_failed", "pending_broker_review", "approved", "partially_filled"],
  history: ["filled", "cancelled", "expired", "settlement_pending", "settled", "rejected", "failed"],
  review: ["pending_broker_review"],
  approved: ["approved"],
  executed: ["partially_filled", "filled", "settlement_pending", "settled"],
  exceptions: ["validation_failed", "rejected", "cancelled", "expired", "failed"],
};

export const MARKET_LINK_ELIGIBLE_STATUSES = ["pending_broker_review", "approved", "partially_filled"] as const;

export function isMarketLinkEligible(order: { status: string; remainingQuantity?: number | null }) {
  return MARKET_LINK_ELIGIBLE_STATUSES.includes(order.status as (typeof MARKET_LINK_ELIGIBLE_STATUSES)[number])
    && (order.remainingQuantity ?? 0) > 0;
}

export function orderResponsibility(status: string, assignedTrader?: string | null) {
  switch (status) {
    case "draft":
    case "submitted":
      return { nextAction: "Complete pre-trade checks", actionOwner: "Operations review" };
    case "validation_failed":
      return { nextAction: "Review failed checks and recreate or cancel", actionOwner: "Operations review" };
    case "pending_broker_review":
      return { nextAction: "Approve or reject the instruction", actionOwner: "Authorized approver" };
    case "approved":
      return { nextAction: "Capture the execution", actionOwner: assignedTrader || "Trading desk" };
    case "partially_filled":
      return { nextAction: "Fill the remainder or cancel it", actionOwner: assignedTrader || "Trading desk" };
    case "filled":
    case "settlement_pending":
      return { nextAction: "Confirm settlement", actionOwner: "Settlement team" };
    default:
      return { nextAction: "No further action", actionOwner: "Complete" };
  }
}

export function waitingTime(from: string | Date, now = new Date()) {
  const start = from instanceof Date ? from : new Date(from);
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Waiting less than 1 min";
  if (minutes < 60) return `Waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days}d ${hours % 24}h`;
}

export function movementDescription(ledger: "cash" | "securities", entryType: string) {
  const key = entryType.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const labels: Record<string, string> = {
    block: ledger === "cash" ? "Cash reserved for this order" : "Holdings reserved for this order",
    release: ledger === "cash" ? "Unused cash released" : "Unused holdings released",
    trade_debit: "Cash used for a purchase",
    trade_credit: "Sale proceeds recorded",
    fee: "Trading fee charged",
    buy_credit: "Purchased holdings added",
    sell_debit: "Sold holdings removed",
    deposit: "Cash added",
    withdrawal: "Cash withdrawn",
    adjustment: ledger === "cash" ? "Cash balance adjusted" : "Holdings balance adjusted",
  };
  return labels[key] ?? `${ledger === "cash" ? "Cash" : "Holdings"} movement`;
}

export function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
