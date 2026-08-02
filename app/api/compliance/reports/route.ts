import { apiError } from "../../../../lib/api";
import { prepareComplianceReport, listComplianceReports } from "../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS } from "../../../../lib/frank";
import { requirePermission } from "../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requirePermission(request, COMPLIANCE_PERMISSIONS.view);
    return Response.json({ reports: await listComplianceReports(actor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, COMPLIANCE_PERMISSIONS.reportPrepare);
    const payload = await request.json() as Record<string, unknown>;
    return Response.json({ report: await prepareComplianceReport(actor, payload) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
