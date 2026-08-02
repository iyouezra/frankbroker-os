import { apiError } from "../../../../../lib/api";
import { complianceWorkbook, complianceWorkbookName } from "../../../../../lib/compliance-workbooks";
import { buildClientStatement, type ComplianceSnapshot } from "../../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS } from "../../../../../lib/frank";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, COMPLIANCE_PERMISSIONS.statementExport);
    const { id } = await context.params;
    const url = new URL(request.url);
    const report = await buildClientStatement(actor, id, url.searchParams.get("from"), url.searchParams.get("to"));
    const snapshot = report.snapshot as unknown as ComplianceSnapshot;
    return new Response(Buffer.from(complianceWorkbook(snapshot)), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${complianceWorkbookName(snapshot)}"`,
        "cache-control": "private, no-store",
        "x-frank-report-id": report.id,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
