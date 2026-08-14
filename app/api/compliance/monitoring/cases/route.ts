import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../lib/frank";
import { createMonitoringCase, listMonitoringCases } from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.sensitive);
    return Response.json({ cases: await listMonitoringCases(actor) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.caseManage);
    return Response.json({ case: await createMonitoringCase(actor, await request.json()) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
