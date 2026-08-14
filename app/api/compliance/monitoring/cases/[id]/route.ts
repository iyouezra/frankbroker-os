import { apiError } from "../../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../../lib/frank";
import { updateMonitoringCase } from "../../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.caseManage);
    const { id } = await context.params;
    return Response.json({ case: await updateMonitoringCase(actor, id, await request.json()) });
  } catch (error) { return apiError(error); }
}
