import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { addisDateOnly } from "../lib/addis-date";
import { money, toNum, ZERO } from "../lib/money";
import { ensureChartOfAccounts } from "../lib/gl/chart-seed";
import { postJournalEntry } from "../lib/gl/posting-service";
import { LEDGER_ROLES, openingBalance, type DraftLine } from "../lib/gl/journal-rules";

/**
 * Open a broker's general ledger with a single dated entry derived from the
 * sub-ledgers as they stand today.
 *
 * Replaying history was considered and rejected: trades captured before the fee
 * schedules existed carry no fee breakdown, so a replay would invent ECMA, ESX,
 * and CSD payables the broker never actually owed. The granular past already
 * lives in the cash, securities, client-money, and pooled-bank ledgers, and in
 * the audit log. What the general ledger needs is a correct starting position,
 * signed off by two officers — which is how brokers migrate onto a new ledger
 * in practice.
 *
 * If the sub-ledgers do not agree with the confirmed bank position, the
 * residual is posted to unidentified receipts (holding more than we owe) or to
 * client money shortfall (holding less). It is never quietly absorbed into the
 * corporate bridge, because that would bury a real break on day one instead of
 * surfacing it.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npm run db:backfill-gl-opening -- --broker brk_abyssinia \
 *     --actor usr_demo_admin --approver usr_compliance \
 *     --evidence "Signed opening balance pack 2026-08-16" --apply
 */

// Match prisma.config.ts, and prefer the direct connection: the opening entry
// runs in a serializable transaction, which a pooled connection handles poorly.
config({ path: [".env.local", ".env"], quiet: true });
const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required to open the general ledger.");
}

function argValue(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const brokerFilter = argValue("broker");
const actorId = argValue("actor");
const approverId = argValue("approver");
const evidenceReference = argValue("evidence");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type OpeningPosition = {
  pooledStatement: Prisma.Decimal;
  clientSettled: Prisma.Decimal;
  clientUnsettled: Prisma.Decimal;
  settlementPayable: Prisma.Decimal;
  settlementReceivable: Prisma.Decimal;
  unsettledFees: Prisma.Decimal;
};

async function readPosition(brokerId: string): Promise<OpeningPosition> {
  const pools = await prisma.pooledBankAccount.findMany({ where: { brokerId } });
  const accounts = await prisma.account.findMany({ where: { client: { brokerId } } });
  const unsettled = await prisma.trade.findMany({
    where: { order: { brokerId }, settlement: { status: { not: "settled" } } },
    include: { order: { select: { side: true } } },
  });

  return {
    pooledStatement: pools.reduce((total, pool) => money(total.plus(pool.statementBalance)), ZERO),
    clientSettled: accounts.reduce((total, account) => money(total.plus(account.availableCash).plus(account.blockedCash)), ZERO),
    clientUnsettled: accounts.reduce((total, account) => money(total.plus(account.unsettledCash)), ZERO),
    settlementPayable: unsettled
      .filter((trade) => trade.order.side === "buy")
      .reduce((total, trade) => money(total.plus(trade.grossAmount)), ZERO),
    settlementReceivable: unsettled
      .filter((trade) => trade.order.side === "sell")
      .reduce((total, trade) => money(total.plus(trade.grossAmount)), ZERO),
    // Fees charged on captured-but-unsettled trades. On a buy the client has
    // already paid them into the pool; on a sell they will be netted out of the
    // proceeds. Either way they are not owed to clients.
    unsettledFees: unsettled.reduce((total, trade) => money(total.plus(trade.fees)), ZERO),
  };
}

function buildLines(position: OpeningPosition): DraftLine[] {
  const lines: DraftLine[] = [];
  const debit = (role: DraftLine["role"], amount: Prisma.Decimal, memo: string) => {
    if (amount.gt(0)) lines.push({ role, side: "debit", amount, memo });
  };
  const credit = (role: DraftLine["role"], amount: Prisma.Decimal, memo: string) => {
    if (amount.gt(0)) lines.push({ role, side: "credit", amount, memo });
  };

  debit(LEDGER_ROLES.clientMoneyPooledBank, position.pooledStatement, "Confirmed pooled client bank balance at cutover");
  debit(LEDGER_ROLES.settlementReceivable, position.settlementReceivable, "Unsettled sell proceeds receivable at cutover");
  credit(LEDGER_ROLES.clientMoneyPayableSettled, position.clientSettled, "Settled client cash owed at cutover");
  credit(LEDGER_ROLES.clientMoneyPayableUnsettled, position.clientUnsettled, "Unsettled client proceeds owed at cutover");
  credit(LEDGER_ROLES.settlementPayable, position.settlementPayable, "Unsettled buy consideration owed at cutover");
  // Fees already charged belong to the firm and the market bodies, not to
  // clients. Splitting them into brokerage, ECMA, ESX, and CSD would mean
  // inventing a breakdown for trades that predate the fee schedules, so they
  // are carried on the bridge to corporate books instead — the one account
  // whose whole purpose is holding value that belongs to the firm's own ledger.
  credit(LEDGER_ROLES.corporateBooksBridge, position.unsettledFees, "Fees earned on unsettled trades at cutover");

  const debitTotal = lines.filter((line) => line.side === "debit").reduce((total, line) => money(total.plus(line.amount)), ZERO);
  const creditTotal = lines.filter((line) => line.side === "credit").reduce((total, line) => money(total.plus(line.amount)), ZERO);
  const residual = money(debitTotal.minus(creditTotal));

  if (residual.gt(0)) {
    // More is held than the sub-ledgers say is owed. Park it as an unidentified
    // client receipt so it is investigated, not absorbed.
    credit(LEDGER_ROLES.unidentifiedReceipts, residual, "Unexplained surplus at cutover — requires investigation");
  } else if (residual.lt(0)) {
    // Less is held than is owed. This is a segregation shortfall and is named
    // as one.
    debit(LEDGER_ROLES.clientMoneyShortfall, residual.abs(), "Client money shortfall identified at cutover");
  }
  return lines;
}

async function main() {
  const brokers = await prisma.broker.findMany({
    where: brokerFilter ? { id: brokerFilter } : {},
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  if (!brokers.length) throw new Error("No matching broker found.");

  for (const broker of brokers) {
    const position = await readPosition(broker.id);
    const lines = buildLines(position);

    console.log(`\n${broker.name} (${broker.id})`);
    console.log(`  pooled bank (confirmed)      ${toNum(position.pooledStatement).toFixed(2)}`);
    console.log(`  client cash settled          ${toNum(position.clientSettled).toFixed(2)}`);
    console.log(`  client cash unsettled        ${toNum(position.clientUnsettled).toFixed(2)}`);
    console.log(`  settlement payable (buys)    ${toNum(position.settlementPayable).toFixed(2)}`);
    console.log(`  settlement receivable (sells)${toNum(position.settlementReceivable).toFixed(2)}`);
    console.log(`  fees on unsettled trades     ${toNum(position.unsettledFees).toFixed(2)}`);
    if (!lines.length) {
      console.log("  nothing to open — sub-ledgers are empty");
      continue;
    }
    for (const line of lines) {
      console.log(`    ${line.side.padEnd(6)} ${line.role.padEnd(32)} ${toNum(line.amount).toFixed(2)}  ${line.memo}`);
    }
    const break_ = lines.find((line) => line.role === LEDGER_ROLES.unidentifiedReceipts || line.role === LEDGER_ROLES.clientMoneyShortfall);
    if (break_) {
      console.log(`  ⚠ opening break of ${toNum(break_.amount).toFixed(2)} ETB posted to ${break_.role} — investigate before sign-off`);
    }

    if (!apply) continue;
    if (!actorId || !approverId || !evidenceReference) {
      throw new Error("--actor, --approver, and --evidence are all required to apply an opening balance.");
    }
    if (actorId === approverId) {
      throw new Error("Maker-checker control requires a different approver from the preparer.");
    }

    await prisma.$transaction(async (tx) => {
      await ensureChartOfAccounts(tx, broker.id);
      const result = await postJournalEntry(tx, {
        brokerId: broker.id,
        actorId,
        approverId,
        reason: evidenceReference,
        draft: openingBalance({ brokerId: broker.id, lines, valueDate: addisDateOnly() }),
      });
      console.log(result.idempotent
        ? `  already opened — journal entry ${result.entryId} exists, nothing written`
        : `  opened with journal entry ${result.entryId}`);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  if (!apply) console.log("\nDry run. Re-run with --apply (plus --actor, --approver, --evidence) to write.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
