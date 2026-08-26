import { apiError } from "../../../lib/api";
import { createCorporateAction, generateFixedIncomeSchedule } from "../../../lib/corporate-action-service";
import { toNum } from "../../../lib/money";
import { prisma } from "../../../lib/prisma";
import { requireTenantModule } from "../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const [actions, instruments, pooledAccounts] = await Promise.all([
      prisma.corporateAction.findMany({ where: { brokerId: actor.brokerId }, include: { instrument: true, entitlements: { include: { account: { include: { client: true } } }, orderBy: { account: { accountNumber: "asc" } } } }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], take: 100 }),
      prisma.brokerInstrument.findMany({ where: { brokerId: actor.brokerId }, include: { instrument: true }, orderBy: { instrument: { symbol: "asc" } } }),
      prisma.pooledBankAccount.findMany({ where: { brokerId: actor.brokerId, status: "active" }, select: { id: true, bankName: true, accountNumberMasked: true, currency: true }, orderBy: { bankName: "asc" } }),
    ]);
    return Response.json({
      actions: actions.map((action) => ({ id: action.id, instrumentId: action.instrumentId, symbol: action.instrument.symbol, name: action.instrument.name, actionType: action.actionType, status: action.status, announcementDate: action.announcementDate?.toISOString().slice(0, 10) ?? null, exDate: action.exDate?.toISOString().slice(0, 10) ?? null, recordDate: action.recordDate.toISOString().slice(0, 10), electionDeadline: action.electionDeadline?.toISOString().slice(0, 10) ?? null, paymentDate: action.paymentDate.toISOString().slice(0, 10), currency: action.currency, cashRatePerUnit: action.cashRatePerUnit === null ? null : toNum(action.cashRatePerUnit), securityRatioNumerator: action.securityRatioNumerator === null ? null : toNum(action.securityRatioNumerator), securityRatioDenominator: action.securityRatioDenominator === null ? null : toNum(action.securityRatioDenominator), supportsReinvestment: action.supportsReinvestment, taxTreatment: action.taxTreatment, sourceReference: action.sourceReference, approvedBy: action.approvedBy, entitlements: action.entitlements.map((item) => ({ id: item.id, accountId: item.accountId, accountNumber: item.account.accountNumber, clientCode: item.account.client.clientCode, clientName: item.account.client.fullName, ledgerQuantity: toNum(item.ledgerQuantity), externalQuantity: item.externalQuantity === null ? null : toNum(item.externalQuantity), eligibleQuantity: toNum(item.eligibleQuantity), reconciliationStatus: item.reconciliationStatus, grossCash: item.grossCash === null ? null : toNum(item.grossCash), withholdingAmount: item.withholdingAmount === null ? null : toNum(item.withholdingAmount), netCash: item.netCash === null ? null : toNum(item.netCash), withholdingStatus: item.withholdingStatus, withholdingAgent: item.withholdingAgent, withholdingEvidence: item.withholdingEvidence, securityQuantity: item.securityQuantity === null ? null : toNum(item.securityQuantity), election: item.election, status: item.status, exceptionReason: item.exceptionReason })) })),
      instruments: instruments.map(({ instrument }) => ({ id: instrument.id, symbol: instrument.symbol, name: instrument.name, assetClass: instrument.assetClass, currency: instrument.currency, faceValue: instrument.faceValue === null ? null : toNum(instrument.faceValue), maturityDate: instrument.maturityDate?.toISOString().slice(0, 10) ?? null, couponRate: instrument.couponRate === null ? null : toNum(instrument.couponRate), couponFrequency: instrument.couponFrequency })),
      pooledAccounts,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    const payload = await request.json() as Record<string, unknown>;
    if (payload.mode === "fixed_income_schedule") return Response.json(await generateFixedIncomeSchedule(actor, payload), { status: 201 });
    return Response.json(await createCorporateAction(actor, payload), { status: 201 });
  } catch (error) { return apiError(error); }
}
