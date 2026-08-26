import { Prisma } from "../app/generated/prisma/client";
import { D, money, ZERO, type DecimalValue } from "./money";

export type ActivePlatformTaxRule = {
  id: string;
  appliesTo: string;
  assetClass: string;
  ratePct: Prisma.Decimal;
  calculationBasis: string;
  collectionMethod: string;
  inflationAdjustmentPct: Prisma.Decimal;
  schedule: { id: string; version: string; legalReference: string; effectiveFrom: Date; effectiveTo: Date | null };
};

type PlatformTaxDb = Pick<Prisma.TransactionClient, "platformTaxSchedule">;

export async function resolveActivePlatformTaxRule(db: PlatformTaxDb, appliesTo: string, assetClass: string, valueDate: Date): Promise<ActivePlatformTaxRule | null> {
  const schedule = await db.platformTaxSchedule.findFirst({
    where: {
      status: "published",
      effectiveFrom: { lte: valueDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: valueDate } }],
      rules: { some: { appliesTo, assetClass } },
    },
    include: { rules: { where: { appliesTo, assetClass }, take: 1 } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const rule = schedule?.rules[0];
  return schedule && rule ? { ...rule, schedule } : null;
}

export function capitalGainTaxBase(input: { grossProceeds: DecimalValue; allocatedFees: DecimalValue; costBasis: DecimalValue; inflationAdjustmentPct: DecimalValue }) {
  const costBasis = money(input.costBasis);
  const inflationAdjustment = money(costBasis.times(D(input.inflationAdjustmentPct)).div(100));
  const netConsideration = money(D(input.grossProceeds).minus(D(input.allocatedFees)));
  const taxableGain = money(Prisma.Decimal.max(ZERO, netConsideration.minus(costBasis).minus(inflationAdjustment)));
  return { netConsideration, costBasis, inflationAdjustment, taxableGain };
}

export function taxAmount(taxableAmount: DecimalValue, ratePct: DecimalValue) {
  return money(D(taxableAmount).times(D(ratePct)).div(100));
}

export function platformTaxSnapshot(rule: ActivePlatformTaxRule, extra: Record<string, unknown> = {}) {
  return {
    scheduleVersion: rule.schedule.version,
    legalReference: rule.schedule.legalReference,
    calculationBasis: rule.calculationBasis,
    collectionMethod: rule.collectionMethod,
    taxLiabilityParty: "investor",
    ...extra,
  };
}
