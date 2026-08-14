import { apiError } from "../../../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../../../lib/frank";
import { actOnMonitoringAlert } from "../../../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.alertManage);
    const { id } = await context.params;
    const payload = await request.json() as { action: string; rationale?: string; caseId?: string };
    return Response.json({ alert: await actOnMonitoringAlert(actor, id, payload) });
  } catch (error) {
    return apiError(error);
  }
}
