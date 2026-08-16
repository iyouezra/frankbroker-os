import type { Prisma } from "../../app/generated/prisma/client";
import { LEDGER_ROLE_TEMPLATE } from "./journal-rules";

/**
 * Create a broker's chart of control accounts from the frozen template.
 *
 * The upsert keys on `(brokerId, role)`, never on code, so re-running this is
 * safe even after a broker has renamed or renumbered their accounts: their
 * presentation is left exactly as they set it and only genuinely missing roles
 * are added. Optional roles — the payment gateway, the operating bank account,
 * the tax and memorandum accounts — are created disabled, and are turned on
 * when a broker actually needs them.
 *
 * This is called from seeding, from broker provisioning, and from the cutover
 * script. It is deliberately never called lazily from inside a posting
 * transaction: a serializable transaction is the wrong place to be creating
 * eighteen rows the first time somebody happens to trade.
 */
export async function ensureChartOfAccounts(tx: Prisma.TransactionClient, brokerId: string) {
  for (const template of LEDGER_ROLE_TEMPLATE) {
    await tx.ledgerAccount.upsert({
      where: { brokerId_role: { brokerId, role: template.role } },
      update: {},
      create: {
        id: crypto.randomUUID(),
        brokerId,
        role: template.role,
        code: template.defaultCode,
        name: template.name,
        accountClass: template.accountClass,
        normalBalance: template.normalBalance,
        statementCaption: template.statementCaption,
        subLedger: template.subLedger,
        postingEnabled: template.required,
      },
    });
  }
}

/**
 * Turn an optional role on or off. Disabling an account that still holds a
 * balance is refused: the balance would silently stop being reportable while
 * the money it represents still exists.
 */
export async function setLedgerAccountPosting(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; role: string; enabled: boolean },
) {
  const account = await tx.ledgerAccount.findUnique({
    where: { brokerId_role: { brokerId: input.brokerId, role: input.role } },
  });
  if (!account) throw new Error(`Ledger role "${input.role}" is not configured for this broker.`);
  if (!input.enabled && !account.balance.isZero()) {
    throw new Error(`Ledger account "${account.code} ${account.name}" still holds a balance and cannot be disabled.`);
  }
  return tx.ledgerAccount.update({
    where: { id: account.id },
    data: { postingEnabled: input.enabled, version: { increment: 1 } },
  });
}
