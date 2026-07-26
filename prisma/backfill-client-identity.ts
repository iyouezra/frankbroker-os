import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { planIdentityBackfill, type BackfillClient } from "../lib/client-identity";

/**
 * One-off backfill of Client.identityReference for records created before the
 * reference became a deterministic hash of the legal identity.
 *
 * Only organizations can be backfilled — their business registration number is
 * stored, so the reference is recomputable. Individuals are keyed by the Fayda
 * FAN, which was never stored, so they are reported but left alone; they get a
 * real reference the next time their Fayda is captured.
 *
 * Dry run by default. Pass --apply to write. Run only after the
 * 20260726120000_client_identity_uniqueness migration is applied.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to backfill client identity references.");
}

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const rows: BackfillClient[] = await prisma.client.findMany({
    select: { id: true, brokerId: true, clientType: true, identityReference: true, businessRegistrationNumber: true },
  });
  const plan = planIdentityBackfill(rows);

  console.log(`Scanned ${rows.length} clients.`);
  console.log(`  ${plan.updates.length} organization(s) to update`);
  console.log(`  ${plan.alreadyCorrect.length} already correct`);
  console.log(`  ${plan.skippedIndividuals.length} individual(s) skipped — raw Fayda was never stored, so their reference cannot be recomputed`);
  console.log(`  ${plan.skippedNoRegistration.length} organization(s) skipped — no business registration number on file`);

  if (plan.collisions.length) {
    console.log(`\n⚠ ${plan.collisions.length} collision(s) — these share a registration number under one broker and need manual review; left unchanged:`);
    for (const collision of plan.collisions) {
      console.log(`    broker ${collision.brokerId}: ${collision.clientIds.join(", ")}`);
    }
  }

  if (!apply) {
    console.log(`\nDry run. Re-run with --apply to write ${plan.updates.length} change(s).`);
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const change of plan.updates) {
    try {
      await prisma.client.update({ where: { id: change.id }, data: { identityReference: change.to } });
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`  Failed to update ${change.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nApplied ${updated} update(s)${failed ? `, ${failed} failed` : ""}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
