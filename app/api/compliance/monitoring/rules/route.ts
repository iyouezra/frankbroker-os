import { apiError } from "../../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../../lib/frank";
import { listMonitoringAudit, listMonitoringRules, updateMonitoringRule } from "../../../../../lib/monitoring-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.sensitive);
    const [rules, audit] = await Promise.all([listMonitoringRules(actor), listMonitoringAudit(actor)]);
    return Response.json({ rules, audit });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.ruleManage);
    return Response.json({ rule: await updateMonitoringRule(actor, await request.json()) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
