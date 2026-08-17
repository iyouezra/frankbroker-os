/**
 * Open the chart of control accounts for every broker.
 *
 * This writes configuration, not financial data: nineteen control accounts per
 * broker with zero balances. It is idempotent and safe to re-run. Opening
 * balances are a separate, signed-off step — see backfill-gl-opening-balances.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { ensureChartOfAccounts } from "../lib/gl/chart-seed";

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const brokers = await prisma.broker.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  for (const broker of brokers) {
    await ensureChartOfAccounts(prisma, broker.id);
    const count = await prisma.ledgerAccount.count({ where: { brokerId: broker.id } });
    const enabled = await prisma.ledgerAccount.count({ where: { brokerId: broker.id, postingEnabled: true } });
    console.log(`${broker.name} (${broker.id}): ${count} control accounts, ${enabled} posting-enabled`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
