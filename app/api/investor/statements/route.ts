import { apiError } from "../../../../lib/api";
import { buildClientStatementSnapshot } from "../../../../lib/compliance-service";
import { complianceWorkbook, complianceWorkbookName } from "../../../../lib/compliance-workbooks";
import { prisma } from "../../../../lib/prisma";
import { resolveInvestorContext } from "../../../../lib/server-auth";
import { resolveTenantContext } from "../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    const [context, settings] = await Promise.all([
      resolveTenantContext(brokerId),
      prisma.brokerSettings.findUnique({ where: { brokerId }, select: { features: true } }),
    ]);
    const features = (settings?.features ?? {}) as Record<string, unknown>;
    if (!context?.modules.investor_servicing || features.investorPortal !== true) {
      throw new Response("The investor portal is not enabled for this tenant's active registration, licence, and modules.", { status: 403 });
    }
    const url = new URL(request.url);
    const { snapshot } = await buildClientStatementSnapshot(
      { brokerId },
      clientId,
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );
    const workbook = complianceWorkbook(snapshot);
    await prisma.auditLog.create({ data: {
      id: crypto.randomUUID(), brokerId, actorId: null,
      action: "INVESTOR_STATEMENT_DOWNLOADED", entityType: "client", entityId: clientId,
      summary: `${snapshot.client.name} downloaded an account statement for ${snapshot.periodStart} to ${snapshot.periodEnd}`,
      newValue: JSON.stringify({ periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, source: "investor_portal" }),
    } });
    return new Response(Buffer.from(workbook), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${complianceWorkbookName(snapshot)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
