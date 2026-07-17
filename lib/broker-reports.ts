import type { BrokerClient, DemoOrder } from "./demo-data";

/**
 * Broker report generation. Each report is produced from the live order/client/
 * audit data the portal already holds, so exports reflect the current book both
 * online (DB-backed) and offline (demonstration data). Reports render as a row
 * preview and download as CSV.
 */

export type AuditRow = { time: string; actor: string; action: string; detail: string; entity: string };

export type Report = {
  id: string;
  name: string;
  description: string;
  columns: string[];
  rows: (string | number)[][];
};

const EXECUTED = new Set(["settlement_pending", "settled", "partially_filled"]);
const REJECTED = new Set(["rejected", "validation_failed", "cancelled", "failed"]);
const humanize = (value: string) => value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const money = (value: number) => Number(value ?? 0).toFixed(2);

export function buildReports(orders: DemoOrder[], clients: BrokerClient[], audit: AuditRow[]): Report[] {
  const executed = orders.filter((order) => EXECUTED.has(order.status));

  return [
    {
      id: "daily-orders",
      name: "Daily order report",
      description: "Every instruction captured for the business date.",
      columns: ["Order ID", "Time", "Client", "Instrument", "Side", "Quantity", "Limit price", "Est. net (ETB)", "Status"],
      rows: orders.map((order) => [order.id, order.time, order.client, order.symbol, order.side.toUpperCase(), order.quantity, money(order.price), money(order.estimatedNet), humanize(order.status)]),
    },
    {
      id: "daily-trades",
      name: "Daily trade report",
      description: "Executed fills with settlement dates.",
      columns: ["Order ID", "Trade ID", "Client", "Instrument", "Side", "Quantity", "Price", "Net (ETB)", "Settlement date", "Status"],
      rows: executed.map((order) => [order.id, order.tradeId ?? "—", order.client, order.symbol, order.side.toUpperCase(), order.quantity, money(order.price), money(order.estimatedNet), order.settlementDate ?? "—", humanize(order.status)]),
    },
    {
      id: "pending-approvals",
      name: "Pending approvals",
      description: "Orders awaiting a broker review decision.",
      columns: ["Order ID", "Client", "Instrument", "Side", "Quantity", "Est. net (ETB)", "Risk flag"],
      rows: orders.filter((order) => order.status === "pending_broker_review").map((order) => [order.id, order.client, order.symbol, order.side.toUpperCase(), order.quantity, money(order.estimatedNet), order.riskFlag]),
    },
    {
      id: "pending-settlement",
      name: "Settlement obligations",
      description: "Captured trades awaiting settlement confirmation.",
      columns: ["Trade ID", "Order ID", "Client", "Instrument", "Net (ETB)", "Settlement date"],
      rows: orders.filter((order) => ["settlement_pending", "partially_filled"].includes(order.status) && order.tradeId).map((order) => [order.tradeId ?? "—", order.id, order.client, order.symbol, money(order.estimatedNet), order.settlementDate ?? "—"]),
    },
    {
      id: "rejected-orders",
      name: "Rejected orders",
      description: "Rejected, cancelled, and validation-failed instructions.",
      columns: ["Order ID", "Client", "Instrument", "Side", "Quantity", "Est. net (ETB)", "Status"],
      rows: orders.filter((order) => REJECTED.has(order.status)).map((order) => [order.id, order.client, order.symbol, order.side.toUpperCase(), order.quantity, money(order.estimatedNet), humanize(order.status)]),
    },
    {
      id: "client-cash",
      name: "Client cash balances",
      description: "Total, available, and blocked cash per account.",
      columns: ["Client code", "Client", "Total cash (ETB)", "Available (ETB)", "Blocked (ETB)"],
      rows: clients.map((client) => [client.code, client.name, money(client.totalCash), money(client.availableCash), money(client.blockedCash)]),
    },
    {
      id: "client-holdings",
      name: "Securities holdings",
      description: "Instrument positions across client accounts.",
      columns: ["Client code", "Client", "Instrument", "Total qty", "Available", "Blocked", "Avg cost (ETB)"],
      rows: clients.flatMap((client) => (client.holdings ?? []).map((holding) => [client.code, client.name, holding.symbol, holding.total, holding.available, holding.blocked, money(holding.averageCost)])),
    },
    {
      id: "kyc-status",
      name: "KYC status report",
      description: "Onboarding and suitability status per client.",
      columns: ["Client code", "Client", "Type", "KYC status", "Account status", "Risk rating"],
      rows: clients.map((client) => [client.code, client.name, client.type, humanize(client.kyc), humanize(client.status), humanize(client.risk)]),
    },
    {
      id: "fees",
      name: "Fees & commissions",
      description: "Brokerage and market fees on executed orders.",
      columns: ["Order ID", "Client", "Instrument", "Gross (ETB)", "Fees (ETB)"],
      rows: executed.map((order) => [order.id, order.client, order.symbol, money(order.estimatedGross), money(order.estimatedFees)]),
    },
    {
      id: "audit-log",
      name: "Audit log report",
      description: "Chronological control evidence for oversight.",
      columns: ["Time", "Actor", "Action", "Entity", "Detail"],
      rows: audit.map((entry) => [entry.time, entry.actor, entry.action, entry.entity, entry.detail]),
    },
  ];
}

export function feesEarned(orders: DemoOrder[]): number {
  return orders.filter((order) => EXECUTED.has(order.status)).reduce((total, order) => total + (order.estimatedFees ?? 0), 0);
}

const escapeCsv = (value: string | number) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function toCsv(report: Report): string {
  return [report.columns, ...report.rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function downloadCsv(report: Report) {
  const blob = new Blob([toCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `frankbroker-${report.id}-2026-07-14.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
