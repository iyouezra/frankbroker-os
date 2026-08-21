import { Prisma } from "../app/generated/prisma/client";
import { D, money, ZERO, type DecimalValue } from "./money";

export type LotForAllocation = { id: string; remainingQuantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; basisStatus: string };

export function allocateTaxLots(lots: LotForAllocation[], quantityValue: DecimalValue, grossValue: DecimalValue, feesValue: DecimalValue) {
  const quantity = D(quantityValue);
  const gross = money(grossValue);
  const fees = money(feesValue);
  if (quantity.lte(0)) throw new Error("Disposition quantity must be positive.");
  let remaining = quantity;
  const allocations: Array<{ lotId: string; quantity: Prisma.Decimal; grossProceeds: Prisma.Decimal; allocatedFees: Prisma.Decimal; netProceeds: Prisma.Decimal; costBasis: Prisma.Decimal | null; realizedGain: Prisma.Decimal | null; basisStatus: string }> = [];
  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const used = Prisma.Decimal.min(remaining, lot.remainingQuantity);
    if (used.lte(0)) continue;
    const ratio = used.div(quantity);
    const allocatedGross = money(gross.times(ratio));
    const allocatedFees = money(fees.times(ratio));
    const netProceeds = money(allocatedGross.minus(allocatedFees));
    const costBasis = lot.unitCost === null || lot.basisStatus === "unknown" ? null : money(lot.unitCost.times(used));
    allocations.push({ lotId: lot.id, quantity: used, grossProceeds: allocatedGross, allocatedFees, netProceeds, costBasis, realizedGain: costBasis === null ? null : money(netProceeds.minus(costBasis)), basisStatus: costBasis === null ? "unknown" : lot.basisStatus });
    remaining = remaining.minus(used);
  }
  if (remaining.gt(0)) throw new Error(`Tax lots are short by ${remaining.toString()} units.`);
  // Put any rounding residue on the final allocation so totals remain exact.
  const final = allocations.at(-1);
  if (final) {
    final.grossProceeds = final.grossProceeds.plus(gross.minus(allocations.reduce((sum, item) => sum.plus(item.grossProceeds), ZERO)));
    final.allocatedFees = final.allocatedFees.plus(fees.minus(allocations.reduce((sum, item) => sum.plus(item.allocatedFees), ZERO)));
    final.netProceeds = money(final.grossProceeds.minus(final.allocatedFees));
    if (final.costBasis !== null) final.realizedGain = money(final.netProceeds.minus(final.costBasis));
  }
  return allocations;
}

export async function resolveActiveTaxPolicy(tx: Prisma.TransactionClient, brokerId: string, appliesTo: string, assetClass: string, valueDate: Date) {
  const effective: Prisma.TaxPolicyVersionWhereInput = {
    brokerId,
    appliesTo,
    status: "published",
    AND: [
      { OR: [{ effectiveFrom: { lte: valueDate } }, { retrospectiveFrom: { lte: valueDate } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gte: valueDate } }] },
    ],
  };
  return await tx.taxPolicyVersion.findFirst({ where: { ...effective, assetClass }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] })
    ?? tx.taxPolicyVersion.findFirst({ where: { ...effective, assetClass: null }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
}

export async function recordSettledBuyTaxLot(tx: Prisma.TransactionClient, input: { accountId: string; instrumentId: string; tradeId: string; tradeDate: Date; quantity: Prisma.Decimal; gross: Prisma.Decimal; fees: Prisma.Decimal; net: Prisma.Decimal }) {
  const existing = await tx.taxLot.findUnique({ where: { acquisitionTradeId: input.tradeId } });
  if (existing) return existing;
  return tx.taxLot.create({ data: {
    id: `lot_${input.tradeId}`, accountId: input.accountId, instrumentId: input.instrumentId, acquisitionTradeId: input.tradeId,
    acquisitionDate: input.tradeDate, originalQuantity: input.quantity, remainingQuantity: input.quantity,
    acquisitionGross: input.gross, acquisitionFees: input.fees, costBasis: input.net,
    unitCost: input.net.div(input.quantity), basisStatus: "known", basisSource: "settled_trade", sourceReference: input.tradeId,
  } });
}

export async function recordSettledSaleRealizations(tx: Prisma.TransactionClient, input: { brokerId: string; accountId: string; instrumentId: string; assetClass: string; tradeId: string; tradeDate: Date; quantity: Prisma.Decimal; gross: Prisma.Decimal; fees: Prisma.Decimal }) {
  const existing = await tx.realizedGainAllocation.findFirst({ where: { saleTradeId: input.tradeId } });
  if (existing) return;
  let lots = await tx.taxLot.findMany({ where: { accountId: input.accountId, instrumentId: input.instrumentId, remainingQuantity: { gt: 0 } }, orderBy: { createdAt: "asc" } });
  // Null-dated opening positions predate platform-captured acquisitions. Consume
  // them first so an unknown imported basis cannot be hidden behind newer lots.
  lots.sort((left, right) => left.acquisitionDate === null && right.acquisitionDate !== null ? -1 : left.acquisitionDate !== null && right.acquisitionDate === null ? 1 : (left.acquisitionDate?.getTime() ?? 0) - (right.acquisitionDate?.getTime() ?? 0) || left.createdAt.getTime() - right.createdAt.getTime());
  const available = lots.reduce((sum, lot) => sum.plus(lot.remainingQuantity), ZERO);
  if (available.lt(input.quantity)) {
    const missing = input.quantity.minus(available);
    const unknown = await tx.taxLot.create({ data: { id: `lot_unknown_${input.tradeId}`, accountId: input.accountId, instrumentId: input.instrumentId, acquisitionDate: null, originalQuantity: missing, remainingQuantity: missing, basisStatus: "unknown", basisSource: "unreconciled_position", sourceReference: input.tradeId, notes: "Created during disposal because no acquisition evidence was available for the full position." } });
    lots = [...lots, unknown];
  }
  const allocations = allocateTaxLots(lots, input.quantity, input.gross, input.fees);
  const policy = await resolveActiveTaxPolicy(tx, input.brokerId, "capital_gain", input.assetClass, input.tradeDate);
  for (const allocation of allocations) {
    await tx.taxLot.update({ where: { id: allocation.lotId }, data: { remainingQuantity: { decrement: allocation.quantity }, version: { increment: 1 } } });
    const id = crypto.randomUUID();
    await tx.realizedGainAllocation.create({ data: { id, saleTradeId: input.tradeId, taxLotId: allocation.lotId, quantity: allocation.quantity, grossProceeds: allocation.grossProceeds, allocatedFees: allocation.allocatedFees, netProceeds: allocation.netProceeds, costBasis: allocation.costBasis, realizedGain: allocation.realizedGain, basisStatus: allocation.basisStatus, status: allocation.realizedGain === null ? "needs_basis" : "provisional", calculationSnapshot: { method: "fifo", tradeId: input.tradeId, basisSource: allocation.basisStatus } } });
    if (policy && allocation.realizedGain !== null) {
      const taxable = money(Prisma.Decimal.max(ZERO, allocation.realizedGain));
      await tx.taxCalculation.create({ data: { id: crypto.randomUUID(), realizedGainAllocationId: id, taxPolicyVersionId: policy.id, taxableAmount: taxable, ratePct: policy.ratePct, taxAmount: money(taxable.times(policy.ratePct).div(100)), status: "estimate", calculationSnapshot: { policyVersion: policy.version, legalReference: policy.legalReference, method: "fifo", negativeGainFlooredForEstimate: true } } });
    }
  }
}

/** Consume lots when principal is redeemed without an exchange trade. */
export async function recordCorporateActionRealization(tx: Prisma.TransactionClient, input: { brokerId: string; accountId: string; instrumentId: string; assetClass: string; entitlementId: string; paymentDate: Date; quantity: Prisma.Decimal; gross: Prisma.Decimal }) {
  const existing = await tx.realizedGainAllocation.findFirst({ where: { corporateActionEntitlementId: input.entitlementId } });
  if (existing) return;
  let lots = await tx.taxLot.findMany({ where: { accountId: input.accountId, instrumentId: input.instrumentId, remainingQuantity: { gt: 0 } }, orderBy: { createdAt: "asc" } });
  lots.sort((left, right) => left.acquisitionDate === null && right.acquisitionDate !== null ? -1 : left.acquisitionDate !== null && right.acquisitionDate === null ? 1 : (left.acquisitionDate?.getTime() ?? 0) - (right.acquisitionDate?.getTime() ?? 0) || left.createdAt.getTime() - right.createdAt.getTime());
  const available = lots.reduce((sum, lot) => sum.plus(lot.remainingQuantity), ZERO);
  if (available.lt(input.quantity)) {
    const missing = input.quantity.minus(available);
    const unknown = await tx.taxLot.create({ data: { id: `lot_unknown_${input.entitlementId}`, accountId: input.accountId, instrumentId: input.instrumentId, originalQuantity: missing, remainingQuantity: missing, basisStatus: "unknown", basisSource: "unreconciled_position", sourceReference: input.entitlementId, notes: "Created at redemption because acquisition evidence was unavailable for the full position." } });
    lots = [...lots, unknown];
  }
  const allocations = allocateTaxLots(lots, input.quantity, input.gross, ZERO);
  const policy = await resolveActiveTaxPolicy(tx, input.brokerId, "capital_gain", input.assetClass, input.paymentDate);
  for (const allocation of allocations) {
    await tx.taxLot.update({ where: { id: allocation.lotId }, data: { remainingQuantity: { decrement: allocation.quantity }, version: { increment: 1 } } });
    const id = crypto.randomUUID();
    await tx.realizedGainAllocation.create({ data: { id, corporateActionEntitlementId: input.entitlementId, taxLotId: allocation.lotId, quantity: allocation.quantity, grossProceeds: allocation.grossProceeds, allocatedFees: ZERO, netProceeds: allocation.netProceeds, costBasis: allocation.costBasis, realizedGain: allocation.realizedGain, basisStatus: allocation.basisStatus, status: allocation.realizedGain === null ? "needs_basis" : "provisional", calculationSnapshot: { method: "fifo", dispositionType: "redemption", entitlementId: input.entitlementId, basisSource: allocation.basisStatus } } });
    if (policy && allocation.realizedGain !== null) {
      const taxable = money(Prisma.Decimal.max(ZERO, allocation.realizedGain));
      await tx.taxCalculation.create({ data: { id: crypto.randomUUID(), realizedGainAllocationId: id, taxPolicyVersionId: policy.id, taxableAmount: taxable, ratePct: policy.ratePct, taxAmount: money(taxable.times(policy.ratePct).div(100)), status: "estimate", calculationSnapshot: { policyVersion: policy.version, legalReference: policy.legalReference, method: "fifo", dispositionType: "redemption", negativeGainFlooredForEstimate: true } } });
    }
  }
}
