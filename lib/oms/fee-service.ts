import { Prisma } from "../../app/generated/prisma/client";
import { D, money, ZERO, type DecimalValue } from "../money";

export type FeePolicy = {
  scheduleId: string | null;
  scheduleVersion: string;
  assetClass: string;
  marketSegment: string;
  brokeragePct: Prisma.Decimal;
  regulatorPct: Prisma.Decimal;
  exchangePct: Prisma.Decimal;
  csdPct: Prisma.Decimal;
  minimumFee: Prisma.Decimal;
  maximumFee: Prisma.Decimal | null;
};

export type FeeBreakdown = {
  brokerage: Prisma.Decimal;
  regulator: Prisma.Decimal;
  exchange: Prisma.Decimal;
  csd: Prisma.Decimal;
  total: Prisma.Decimal;
};

type FeeDb = Pick<Prisma.TransactionClient, "feeSchedule">;
type SettingsLike = {
  brokerageFeePct: Prisma.Decimal;
  minimumFee: Prisma.Decimal;
} | null;
type InstrumentLike = { assetClass: string; marketSegment: string };

export async function resolveFeePolicy(
  db: FeeDb,
  brokerId: string,
  instrument: InstrumentLike,
  settings: SettingsLike,
  valueDate = new Date(),
): Promise<FeePolicy> {
  const schedule = await db.feeSchedule.findFirst({
    where: {
      brokerId,
      status: "published",
      effectiveFrom: { lte: valueDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: valueDate } }],
    },
    include: { rules: true },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const rule = schedule?.rules.find((item) => item.assetClass === instrument.assetClass && item.marketSegment === instrument.marketSegment)
    ?? schedule?.rules.find((item) => item.assetClass === instrument.assetClass)
    ?? schedule?.rules[0];
  return {
    scheduleId: schedule?.id ?? null,
    scheduleVersion: schedule?.version ?? "legacy",
    assetClass: instrument.assetClass,
    marketSegment: instrument.marketSegment,
    brokeragePct: rule?.brokeragePct ?? settings?.brokerageFeePct ?? D(0.5),
    regulatorPct: rule?.regulatorPct ?? ZERO,
    exchangePct: rule?.exchangePct ?? ZERO,
    csdPct: rule?.csdPct ?? ZERO,
    minimumFee: rule?.minimumFee ?? settings?.minimumFee ?? ZERO,
    maximumFee: rule?.maximumFee ?? null,
  };
}

function percentageFee(gross: Prisma.Decimal, pct: Prisma.Decimal) {
  return money(gross.times(pct).div(100));
}

function cappedBrokerage(gross: Prisma.Decimal, policy: FeePolicy) {
  let brokerage = percentageFee(gross, policy.brokeragePct);
  if (brokerage.lt(policy.minimumFee)) brokerage = money(policy.minimumFee);
  if (policy.maximumFee && brokerage.gt(policy.maximumFee)) brokerage = money(policy.maximumFee);
  return brokerage;
}

export function computeFeeBreakdown(grossValue: DecimalValue, policy: FeePolicy): FeeBreakdown {
  const gross = money(grossValue);
  if (gross.lte(0)) return { brokerage: ZERO, regulator: ZERO, exchange: ZERO, csd: ZERO, total: ZERO };
  const brokerage = cappedBrokerage(gross, policy);
  const regulator = percentageFee(gross, policy.regulatorPct);
  const exchange = percentageFee(gross, policy.exchangePct);
  const csd = percentageFee(gross, policy.csdPct);
  return { brokerage, regulator, exchange, csd, total: money(brokerage.plus(regulator).plus(exchange).plus(csd)) };
}

export function computeConfiguredAmounts(side: "buy" | "sell", quantity: DecimalValue, price: DecimalValue, policy: FeePolicy) {
  const gross = money(D(quantity).times(price));
  const breakdown = computeFeeBreakdown(gross, policy);
  const net = side === "buy" ? money(gross.plus(breakdown.total)) : money(gross.minus(breakdown.total));
  return { gross, fees: breakdown.total, net, breakdown };
}

export function computeCumulativeConfiguredFill(
  side: "buy" | "sell",
  quantity: DecimalValue,
  price: DecimalValue,
  priorGrossValue: DecimalValue,
  priorBreakdown: FeeBreakdown,
  policy: FeePolicy,
) {
  const gross = money(D(quantity).times(price));
  const cumulative = computeFeeBreakdown(D(priorGrossValue).plus(gross), policy);
  const breakdown = {
    brokerage: money(Prisma.Decimal.max(ZERO, cumulative.brokerage.minus(priorBreakdown.brokerage))),
    regulator: money(Prisma.Decimal.max(ZERO, cumulative.regulator.minus(priorBreakdown.regulator))),
    exchange: money(Prisma.Decimal.max(ZERO, cumulative.exchange.minus(priorBreakdown.exchange))),
    csd: money(Prisma.Decimal.max(ZERO, cumulative.csd.minus(priorBreakdown.csd))),
    total: ZERO,
  };
  breakdown.total = money(breakdown.brokerage.plus(breakdown.regulator).plus(breakdown.exchange).plus(breakdown.csd));
  const net = side === "buy" ? money(gross.plus(breakdown.total)) : money(gross.minus(breakdown.total));
  return { gross, fees: breakdown.total, net, breakdown };
}

export function feeBreakdownFromJson(value: unknown): FeeBreakdown {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const brokerage = D(String(data.brokerage ?? 0));
  const regulator = D(String(data.regulator ?? 0));
  const exchange = D(String(data.exchange ?? 0));
  const csd = D(String(data.csd ?? 0));
  return { brokerage, regulator, exchange, csd, total: money(brokerage.plus(regulator).plus(exchange).plus(csd)) };
}

export function addFeeBreakdowns(values: FeeBreakdown[]): FeeBreakdown {
  return values.reduce((total, item) => ({
    brokerage: total.brokerage.plus(item.brokerage),
    regulator: total.regulator.plus(item.regulator),
    exchange: total.exchange.plus(item.exchange),
    csd: total.csd.plus(item.csd),
    total: total.total.plus(item.total),
  }), { brokerage: ZERO, regulator: ZERO, exchange: ZERO, csd: ZERO, total: ZERO });
}

export function serializeFeeBreakdown(breakdown: FeeBreakdown): Prisma.InputJsonObject {
  return {
    brokerage: breakdown.brokerage.toFixed(2),
    regulator: breakdown.regulator.toFixed(2),
    exchange: breakdown.exchange.toFixed(2),
    csd: breakdown.csd.toFixed(2),
    total: breakdown.total.toFixed(2),
  };
}
