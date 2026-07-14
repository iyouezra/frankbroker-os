import { prisma } from "../../../lib/prisma";
import { D } from "../../../lib/money";
import { requirePermission, resolveActor } from "../../../lib/server-auth";

export const runtime = "nodejs";

type ReconciliationRow = {
  reference?: string;
  type?: "cash" | "securities";
  actualValue?: number;
};

const serializeBatch = (batch: {
  id: string;
  batchDate: Date;
  fileName: string | null;
  totalRecords: number;
  matchedRecords: number;
  exceptionRecords: number;
  status: string;
  exceptions: Array<{
    id: string;
    reference: string;
    exceptionType: string;
    expectedValue: string | null;
    actualValue: string | null;
    status: string;
    resolutionNotes: string | null;
  }>;
}) => ({
  id: batch.id,
  batchDate: batch.batchDate.toISOString().slice(0, 10),
  fileName: batch.fileName,
  totalRecords: batch.totalRecords,
  matchedRecords: batch.matchedRecords,
  exceptionRecords: batch.exceptionRecords,
  status: batch.status,
  exceptions: batch.exceptions,
});

export async function GET(request: Request) {
  try {
    const actor = resolveActor(request);
    const batches = await prisma.reconciliationBatch.findMany({
      where: { brokerId: actor.brokerId },
      include: { exceptions: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return Response.json({ batches: batches.map(serializeBatch) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load reconciliation batches." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, "adjust");
    const payload = (await request.json()) as { fileName?: string; rows?: ReconciliationRow[] };
    const rows = (payload.rows ?? []).filter((row) => row.reference && row.type && Number.isFinite(Number(row.actualValue)));
    if (!payload.fileName || !rows.length) {
      return Response.json({ error: "Upload a CSV containing reference, type, and actual_value columns." }, { status: 400 });
    }
    if (rows.length > 1_000) {
      return Response.json({ error: "The demonstration importer accepts up to 1,000 rows per batch." }, { status: 400 });
    }

    const references = [...new Set(rows.map((row) => row.reference!))];
    const trades = await prisma.trade.findMany({
      where: { id: { in: references }, order: { brokerId: actor.brokerId } },
      include: { order: { include: { instrument: true } } },
    });
    const tradeById = new Map(trades.map((trade) => [trade.id, trade]));
    const exceptions: Array<{
      id: string;
      reference: string;
      exceptionType: string;
      expectedValue: string | null;
      actualValue: string;
    }> = [];

    for (const row of rows) {
      const trade = tradeById.get(row.reference!);
      const actual = D(Number(row.actualValue));
      if (!trade) {
        exceptions.push({
          id: crypto.randomUUID(),
          reference: row.reference!,
          exceptionType: "missing_internal_reference",
          expectedValue: null,
          actualValue: actual.toFixed(),
        });
        continue;
      }
      const expected = row.type === "cash" ? trade.netAmount : trade.quantityFilled;
      if (!actual.equals(expected)) {
        exceptions.push({
          id: crypto.randomUUID(),
          reference: row.reference!,
          exceptionType: row.type === "cash" ? "cash_variance" : "quantity_mismatch",
          expectedValue: expected.toFixed(),
          actualValue: actual.toFixed(),
        });
      }
    }

    const id = `REC-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const matchedRecords = rows.length - exceptions.length;
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.reconciliationBatch.create({
        data: {
          id,
          brokerId: actor.brokerId,
          batchDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
          fileName: payload.fileName,
          source: "manual_upload",
          totalRecords: rows.length,
          matchedRecords,
          exceptionRecords: exceptions.length,
          status: exceptions.length ? "exceptions" : "matched",
          uploadedBy: actor.id,
          exceptions: { create: exceptions },
        },
        include: { exceptions: true },
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: "RECONCILIATION_IMPORTED",
          entityType: "reconciliation_batch",
          entityId: id,
          summary: `${payload.fileName}: ${matchedRecords}/${rows.length} records matched`,
          newValue: JSON.stringify({ totalRecords: rows.length, matchedRecords, exceptionRecords: exceptions.length }),
        },
      });
      return created;
    });

    return Response.json({ batch: serializeBatch(batch), matchRate: rows.length ? Math.round((matchedRecords / rows.length) * 1_000) / 10 : 0 }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to process reconciliation file." }, { status: 500 });
  }
}
