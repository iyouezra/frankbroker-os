export type Role =
  | "broker_admin"
  | "trader"
  | "operations"
  | "compliance"
  | "settlement"
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
  management: "Read-only management",
  super_admin: "Frank super admin",
};

export const workflowPermissions: Record<Role, string[]> = {
  broker_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report"],
  trader: ["create", "trade", "report"],
  operations: ["create", "adjust", "report"],
  compliance: ["approve", "reject", "report"],
  settlement: ["settle", "adjust", "report"],
  management: ["report"],
  super_admin: ["create", "approve", "reject", "trade", "settle", "adjust", "report"],
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
