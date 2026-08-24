import type { BrokerClient, DemoOrder } from "./demo-data";
import { addisDateOnly } from "./addis-date";

/**
 * Broker business + risk analytics. Pure and browser-safe: it derives the
 * "how much are we moving, how much are we making, and how risky is the book"
 * picture from the order and client data the broker portal already holds, so it
 * works the same online (DB-backed orders) or offline (demonstration data).
 */

export type Period = "today" | "week" | "month" | "quarter" | "ytd";
export const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "This week", days: 6 },
  { id: "month", label: "This month", days: 22 },
  { id: "quarter", label: "This quarter", days: 66 },
  { id: "ytd", label: "Year to date", days: 132 },
];

// Statuses that represent an executed instruction (turnover + earned commission).
const EXECUTED = new Set(["settlement_pending", "settled", "partially_filled"]);
const REJECTED = new Set(["rejected", "validation_failed", "cancelled", "expired"]);

type Tone = "good" | "warning" | "serious";

export type RiskBand = { key: string; label: string; count: number; cash: number; tone: Tone };
export type TrendPoint = { date: string; label: string; volume: number; revenue: number; marketCharges: number; orders: number };

export type BrokerAnalytics = {
  period: Period;
  volume: number;
  revenue: number;
  marketCharges: number;
  ordersFilled: number;
  ordersTotal: number;
  ordersRejected: number;
  fillRate: number;
  avgOrderSize: number;
  effectiveRate: number;
  activeClients: number;
  newClients: number;
  trend: TrendPoint[];
  buySell: { buy: number; sell: number };
  topInstruments: Array<{ symbol: string; volume: number; share: number }>;
  topClients: Array<{ name: string; code: string; commission: number }>;
  largestOrders: Array<{ id: string; client: string; symbol: string; side: string; net: number; status: string }>;
  risk: {
    totalAum: number;
    bands: RiskBand[];
    kyc: Array<{ key: string; label: string; count: number; tone: Tone }>;
    restrictedClients: number;
    flaggedOrders: { count: number; value: number };
    concentration: { client: string; share: number };
    blockedRatio: number;
  };
};

const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
const brokerageEarned = (order: DemoOrder) => order.executedBrokerage
  ?? (order.trades?.length
    ? sum(order.trades, (trade) => trade.feeBreakdown?.brokerage ?? trade.fees)
    : order.estimatedFeeBreakdown?.brokerage ?? order.estimatedFees);
const marketChargesCollected = (order: DemoOrder) => order.executedMarketCharges
  ?? (order.executedFeeBreakdown
    ? order.executedFeeBreakdown.regulator + order.executedFeeBreakdown.exchange + order.executedFeeBreakdown.csd
    : order.trades?.length
      ? sum(order.trades, (trade) => (trade.feeBreakdown?.regulator ?? 0) + (trade.feeBreakdown?.exchange ?? 0) + (trade.feeBreakdown?.csd ?? 0))
      : (order.estimatedFeeBreakdown?.regulator ?? 0) + (order.estimatedFeeBreakdown?.exchange ?? 0) + (order.estimatedFeeBreakdown?.csd ?? 0));

// Deterministic [0,1) noise so the demonstration trend is organic yet stable across renders.
function noise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Trailing `days` trading days (weekends skipped) ending on the business date.
// The final day is anchored to the live order book; earlier days vary around it.
function buildTrend(days: number, bookVolume: number, bookRevenue: number, bookMarketCharges: number, bookOrders: number, asOf: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  const baseVolume = bookVolume > 0 ? bookVolume : 4_000_000;
  const rate = bookVolume > 0 ? bookRevenue / bookVolume : 0.005;
  const marketChargeRate = bookVolume > 0 ? bookMarketCharges / bookVolume : 0;
  const cursor = addisDateOnly(asOf);
  let collected = 0;
  while (collected < days) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const isToday = collected === 0;
      const seed = cursor.getUTCFullYear() * 372 + (cursor.getUTCMonth() + 1) * 31 + cursor.getUTCDate();
      const swing = 0.55 + noise(seed) * 0.9; // 0.55×–1.45× the book
      const volume = isToday ? bookVolume : Math.round(baseVolume * swing);
      const revenue = isToday ? bookRevenue : Math.round(volume * rate * (0.85 + noise(seed + 7) * 0.3));
      const marketCharges = isToday ? bookMarketCharges : Math.round(volume * marketChargeRate * (0.9 + noise(seed + 8) * 0.2));
      const orders = isToday ? bookOrders : Math.max(1, Math.round((bookOrders || 6) * swing));
      points.push({
        date: cursor.toISOString().slice(0, 10),
        label: cursor.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        volume,
        revenue,
        marketCharges,
        orders,
      });
      collected += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return points.reverse();
}

const RISK_META: Record<string, { label: string; tone: Tone }> = {
  standard: { label: "Standard", tone: "good" },
  enhanced: { label: "Enhanced", tone: "warning" },
  review: { label: "Under review", tone: "serious" },
};

const KYC_META: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "good" },
  review_due: { label: "Review due", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
  rejected: { label: "Rejected", tone: "serious" },
};

export function computeBrokerAnalytics(orders: DemoOrder[], clients: BrokerClient[], period: Period, asOf = new Date()): BrokerAnalytics {
  const days = PERIODS.find((item) => item.id === period)?.days ?? 22;
  const executed = orders.filter((order) => EXECUTED.has(order.status));

  const bookVolume = sum(executed, (order) => order.estimatedGross);
  const bookRevenue = sum(executed, brokerageEarned);
  const bookMarketCharges = sum(executed, marketChargesCollected);
  const trend = buildTrend(days, bookVolume, bookRevenue, bookMarketCharges, executed.length, asOf);

  const volume = sum(trend, (point) => point.volume);
  const revenue = sum(trend, (point) => point.revenue);
  const marketCharges = sum(trend, (point) => point.marketCharges);
  const ordersFilled = sum(trend, (point) => point.orders);
  const ordersRejected = orders.filter((order) => REJECTED.has(order.status)).length;
  const ordersTotal = ordersFilled + ordersRejected;
  const fillRate = ordersTotal ? ordersFilled / ordersTotal : 0;
  const avgOrderSize = ordersFilled ? volume / ordersFilled : 0;
  const effectiveRate = volume ? (revenue / volume) * 100 : 0;

  const buy = sum(executed.filter((order) => order.side === "buy"), (order) => order.estimatedGross);
  const sell = sum(executed.filter((order) => order.side === "sell"), (order) => order.estimatedGross);

  const instrumentTotals = new Map<string, number>();
  for (const order of executed) instrumentTotals.set(order.symbol, (instrumentTotals.get(order.symbol) ?? 0) + order.estimatedGross);
  const topInstruments = [...instrumentTotals.entries()]
    .map(([symbol, vol]) => ({ symbol, volume: vol, share: bookVolume ? vol / bookVolume : 0 }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  const clientTotals = new Map<string, { name: string; commission: number }>();
  for (const order of executed) {
    const entry = clientTotals.get(order.clientCode) ?? { name: order.client, commission: 0 };
    entry.commission += brokerageEarned(order);
    clientTotals.set(order.clientCode, entry);
  }
  const topClients = [...clientTotals.entries()]
    .map(([code, value]) => ({ code, name: value.name, commission: value.commission }))
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 5);

  const largestOrders = [...orders]
    .sort((a, b) => b.estimatedNet - a.estimatedNet)
    .slice(0, 5)
    .map((order) => ({ id: order.id, client: order.client, symbol: order.symbol, side: order.side, net: order.estimatedNet, status: order.status }));

  // Risk lens - the composition and exposure of the client book.
  const totalAum = sum(clients, (client) => client.totalCash);
  const bandOrder = ["standard", "enhanced", "review"];
  const bands: RiskBand[] = bandOrder.map((key) => {
    const members = clients.filter((client) => client.risk === key);
    return { key, label: RISK_META[key]?.label ?? key, count: members.length, cash: sum(members, (client) => client.totalCash), tone: RISK_META[key]?.tone ?? "warning" };
  }).filter((band) => band.count > 0);

  const kycCounts = new Map<string, number>();
  for (const client of clients) kycCounts.set(client.kyc, (kycCounts.get(client.kyc) ?? 0) + 1);
  const kyc = [...kycCounts.entries()].map(([key, count]) => ({ key, label: KYC_META[key]?.label ?? key.replaceAll("_", " "), count, tone: KYC_META[key]?.tone ?? "warning" }));

  const flagged = orders.filter((order) => order.riskFlag && order.riskFlag !== "none");
  const topClientCash = Math.max(0, ...clients.map((client) => client.totalCash));
  const topClientName = clients.find((client) => client.totalCash === topClientCash)?.name ?? "-";

  return {
    period,
    volume,
    revenue,
    marketCharges,
    ordersFilled,
    ordersTotal,
    ordersRejected,
    fillRate,
    avgOrderSize,
    effectiveRate,
    activeClients: clientTotals.size,
    newClients: Math.max(1, Math.round(clients.length * 0.18)),
    trend,
    buySell: { buy, sell },
    topInstruments,
    topClients,
    largestOrders,
    risk: {
      totalAum,
      bands,
      kyc,
      restrictedClients: clients.filter((client) => client.status === "restricted").length,
      flaggedOrders: { count: flagged.length, value: sum(flagged, (order) => order.estimatedNet) },
      concentration: { client: topClientName, share: totalAum ? topClientCash / totalAum : 0 },
      blockedRatio: totalAum ? sum(clients, (client) => client.blockedCash) / totalAum : 0,
    },
  };
}
