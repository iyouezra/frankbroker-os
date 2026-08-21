import { prisma } from "../../../lib/prisma";
import { apiError } from "../../../lib/api";
import { requirePermission } from "../../../lib/server-auth";
import { requireTenantModule } from "../../../lib/tenant-capabilities";
import { LEDGER_PERMISSIONS } from "../../../lib/frank";
import {
  buildAccountStatement,
  buildProtectedClientMoneyCoverage,
  buildSettlementCoverage,
  buildLedgerTies,
  buildTrialBalance,
  getJournalEntry,
  listJournalEntries,
} from "../../../lib/gl/ledger-reporting";

export const runtime = "nodejs";

/**
 * The ledger is read-only by design, so this route exposes GET and nothing
 * else. Balances change by capturing a trade or verifying a deposit, never by
 * calling an accounting endpoint.
 */
export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, LEDGER_PERMISSIONS.view);
    await requireTenantModule(request, "dealer_operations");
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "position";

    if (view === "account") {
      const accountId = url.searchParams.get("accountId");
      if (!accountId) return apiError(new Response("A ledger account is required.", { status: 400 }));
      const statement = await buildAccountStatement(prisma, actor.brokerId, accountId);
      if (!statement) return apiError(new Response("That ledger account does not exist for this broker.", { status: 404 }));
      return Response.json(statement);
    }

    if (view === "entry") {
      const entryId = url.searchParams.get("entryId");
      if (!entryId) return apiError(new Response("A journal entry is required.", { status: 400 }));
      const entry = await getJournalEntry(prisma, actor.brokerId, entryId);
      if (!entry) return apiError(new Response("That journal entry does not exist for this broker.", { status: 404 }));
      return Response.json(entry);
    }

    if (view === "entries") {
      const entries = await listJournalEntries(prisma, actor.brokerId, {
        limit: Number(url.searchParams.get("limit") ?? 50),
        sourceType: url.searchParams.get("sourceType") ?? undefined,
      });
      return Response.json({ entries });
    }

    const asAtParam = url.searchParams.get("asAt");
    const asAt = asAtParam ? new Date(`${asAtParam}T23:59:59.999Z`) : undefined;
    if (asAt && Number.isNaN(asAt.getTime())) return apiError(new Response("That as-at date is not a valid date.", { status: 400 }));

    const trialBalance = await buildTrialBalance(prisma, actor.brokerId, asAt);
    const [ties, entries] = await Promise.all([
      buildLedgerTies(prisma, actor.brokerId),
      listJournalEntries(prisma, actor.brokerId, { limit: 12 }),
    ]);

    return Response.json({
      // An unseeded chart is a normal pre-cutover state, not an error: the
      // workspace explains what to do rather than showing an empty grid.
      chartReady: trialBalance.rows.length > 0,
      trialBalance,
      protectedClientMoney: buildProtectedClientMoneyCoverage(trialBalance),
      settlementCoverage: buildSettlementCoverage(trialBalance),
      ties,
      recentEntries: entries,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/gl failed", error);
    return apiError(error);
  }
}
