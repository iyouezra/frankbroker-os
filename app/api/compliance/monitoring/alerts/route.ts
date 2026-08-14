import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../lib/frank";
import { listMonitoringAlerts } from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.sensitive);
    const url = new URL(request.url);
    return Response.json({ alerts: await listMonitoringAlerts(actor, { category: url.searchParams.get("category") ?? undefined, status: url.searchParams.get("status") ?? undefined }) });
  } catch (error) {
    return apiError(error);
  }
}
