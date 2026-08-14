import { apiError } from "../../../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../../../lib/frank";
import { recordMonitoringEvidence } from "../../../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.caseManage);
    const { id } = await context.params;
    return Response.json({ evidence: await recordMonitoringEvidence(actor, id, await request.json()) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
