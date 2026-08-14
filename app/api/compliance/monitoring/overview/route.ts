import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS, hasPermission } from "../../../../../lib/frank";
import { monitoringOverview } from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.summary);
    return Response.json(await monitoringOverview(actor, hasPermission(actor.role, MONITORING_PERMISSIONS.sensitive)));
  } catch (error) {
    return apiError(error);
  }
}
