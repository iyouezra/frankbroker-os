import { apiError } from "../../../../../../lib/api";
import { requirePermission } from "../../../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../../../lib/frank";
import { assignCase, changeCaseStatus, recordCaseFindings, recordCaseRegulatoryStatus } from "../../../../../../lib/crm/case-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "status") {
      const actor = requirePermission(request, CRM_PERMISSIONS.caseManage);
      return Response.json({ ok: true, ...(await changeCaseStatus(actor, id, String(payload.status ?? ""), payload.resolutionSummary)) });
    }
    if (action === "assign") {
      const actor = requirePermission(request, CRM_PERMISSIONS.caseManage);
      return Response.json({ ok: true, ...(await assignCase(actor, id, payload.assignedToUserId ? String(payload.assignedToUserId) : null)) });
    }
    if (action === "findings") {
      const actor = requirePermission(request, CRM_PERMISSIONS.caseManage);
      return Response.json(await recordCaseFindings(actor, id, payload.findings));
    }
    if (action === "regulatory_status") {
      const actor = requirePermission(request, CRM_PERMISSIONS.caseManage);
      return Response.json({ ok: true, ...(await recordCaseRegulatoryStatus(actor, id, payload.status, payload.comment)) });
    }

    return Response.json({ error: "Unsupported case action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
