import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../lib/frank";
import { runMonitoringSweeps } from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.alertManage);
    return Response.json(await runMonitoringSweeps(actor.brokerId));
  } catch (error) { return apiError(error); }
}
