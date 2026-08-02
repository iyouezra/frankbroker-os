import { apiError } from "../../../../../../lib/api";
import { complianceWorkbook, complianceWorkbookName, validationFrom } from "../../../../../../lib/compliance-workbooks";
import { getComplianceReport, type ComplianceSnapshot } from "../../../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS, hasPermission } from "../../../../../../lib/frank";
import { requirePermission } from "../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, COMPLIANCE_PERMISSIONS.view);
    const { id } = await context.params;
    const report = await getComplianceReport(actor, id);
    if (report.reportType === "client_statement" && !hasPermission(actor.role, COMPLIANCE_PERMISSIONS.statementExport)) {
      return Response.json({ error: "Your role cannot export client statements." }, { status: 403 });
    }
    const validation = validationFrom(report.validation);
    if (validation.blocking.length) return Response.json({ error: "Resolve the report validation issues before downloading the filing." }, { status: 409 });
    const snapshot = report.snapshot as unknown as ComplianceSnapshot;
    const bytes = complianceWorkbook(snapshot);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${complianceWorkbookName(snapshot)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
