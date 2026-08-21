import type { Prisma, PrismaClient } from "../app/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const ACCOUNTING_POLICY_OPTIONS = {
  clientMoneyPresentation: ["gross_asset_and_liability", "off_balance_sheet_memorandum"],
  gatewayRecognitionPoint: ["bank_finality", "enforceable_gateway_receivable"],
  depositAvailabilityPoint: ["designated_bank_finality"],
  gatewayFeeTreatment: ["gross_settlement_operating_charge", "net_settlement_immediate_broker_funding"],
  protectedResourceDefinition: ["confirmed_designated_bank_cash_only"],
  feeSweepTiming: ["after_client_entitlement_ends_before_remittance"],
  withdrawalDerecognitionPoint: ["bank_payment_finality"],
} as const;

export async function getEffectiveAccountingPolicy(db: Db, brokerId: string, asAt = new Date()) {
  return db.accountingPolicyVersion.findFirst({
    where: { brokerId, status: "approved", effectiveFrom: { lte: asAt } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

export function assertAccountingPolicyValues(input: Record<string, string>) {
  for (const [field, options] of Object.entries(ACCOUNTING_POLICY_OPTIONS)) {
    if (!(options as readonly string[]).includes(input[field])) throw new Response(`Unsupported accounting policy value for ${field}.`, { status: 400 });
  }
}
