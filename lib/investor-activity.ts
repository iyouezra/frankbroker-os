export type InvestorActivityFilter = "all" | "orders" | "trades" | "money";
export type InvestorActivityTone = "positive" | "pending" | "negative" | "neutral";

type InvestorActivityBase = {
  id: string;
  occurredAt: string;
  status: string;
};

export type InvestorOrderActivity = InvestorActivityBase & {
  kind: "order";
  ticker: string;
  instrumentName: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  triggerPrice: number | null;
  orderType: string;
  validity?: string;
  goodTillDate?: string | null;
  filledQuantity: number;
  estimatedFees: number;
  estimatedNet: number;
  reference: string;
  submittedAt: string;
  rejectionReason: string | null;
};

export type InvestorTradeActivity = InvestorActivityBase & {
  kind: "trade";
  ticker: string;
  instrumentName: string;
  side: "buy" | "sell";
  quantity: number;
  executionPrice: number;
  grossAmount: number;
  fees: number;
  netAmount: number;
  tradeDate: string;
  settlementDate: string;
  settlementStatus: string;
  reference: string;
};

export type InvestorMoneyActivity = InvestorActivityBase & {
  kind: "money";
  movementType: "deposit" | "withdrawal";
  amount: number;
  currency: string;
  bankReference: string | null;
  bankName: string | null;
  accountName: string | null;
  accountMasked: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  failureReason: string | null;
  reference: string;
};

export type InvestorActivity =
  | InvestorOrderActivity
  | InvestorTradeActivity
  | InvestorMoneyActivity;

const statusLabels: Record<string, string> = {
  approved: "Open",
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Failed",
  filled: "Completed",
  partially_filled: "Partly filled",
  pending: "Pending",
  pending_broker_review: "Waiting for broker",
  pending_review: "Under review",
  pending_verification: "Pending verification",
  rejected: "Not approved",
  settlement_pending: "Settlement pending",
  settled: "Completed",
  under_review: "Under review",
  validation_failed: "Not approved",
};

export function getInvestorActivityStatus(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getInvestorActivityTone(status: string): InvestorActivityTone {
  if (["completed", "filled", "settled"].includes(status)) return "positive";
  if (["failed", "rejected", "validation_failed", "cancelled"].includes(status)) return "negative";
  if (["approved", "partially_filled", "pending", "pending_broker_review", "pending_review", "pending_verification", "settlement_pending", "under_review"].includes(status)) return "pending";
  return "neutral";
}

export function sortInvestorActivity(items: InvestorActivity[]) {
  return [...items].sort((left, right) => {
    const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return timeDifference || right.id.localeCompare(left.id);
  });
}

export function getRecentInvestorActivity(items: InvestorActivity[], limit = 5) {
  return sortInvestorActivity(items).slice(0, Math.max(0, limit));
}

export function filterInvestorActivity(items: InvestorActivity[], filter: InvestorActivityFilter) {
  if (filter === "all") return items;
  if (filter === "orders") return items.filter((item) => item.kind === "order");
  if (filter === "trades") return items.filter((item) => item.kind === "trade");
  return items.filter((item) => item.kind === "money");
}

export function mergeInvestorActivity(primary: InvestorActivity[], fallback: InvestorActivity[], limit = 25) {
  const seen = new Set(primary.map((item) => `${item.kind}:${item.id}`));
  return sortInvestorActivity([
    ...primary,
    ...fallback.filter((item) => !seen.has(`${item.kind}:${item.id}`)),
  ]).slice(0, Math.max(0, limit));
}
