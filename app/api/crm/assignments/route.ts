import { apiError } from "../../../../lib/api";
import { requirePermission } from "../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../lib/frank";
import {
  assignRelationshipOfficer,
  bulkAssignRelationshipOfficer,
  getAssignmentHistory,
  getCurrentAssignment,
  officerWorkload,
} from "../../../../lib/crm/assignment-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requirePermission(request, CRM_PERMISSIONS.view);
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (clientId) {
      const [current, history] = await Promise.all([
        getCurrentAssignment(actor, clientId),
        getAssignmentHistory(actor, clientId),
      ]);
      return Response.json({ current, history });
    }
    return Response.json({ workload: await officerWorkload(actor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, CRM_PERMISSIONS.relationshipAssign);
    const payload = (await request.json()) as Record<string, unknown>;
    const primaryOfficerId = payload.primaryOfficerId ? String(payload.primaryOfficerId) : null;

    if (Array.isArray(payload.clientIds)) {
      const result = await bulkAssignRelationshipOfficer(actor, payload.clientIds.map(String), primaryOfficerId);
      return Response.json({ ok: true, ...result });
    }

    const assignment = await assignRelationshipOfficer(actor, {
      clientId: String(payload.clientId ?? ""),
      primaryOfficerId,
      backupOfficerId: payload.backupOfficerId ? String(payload.backupOfficerId) : null,
      team: payload.team ? String(payload.team) : null,
      branch: payload.branch ? String(payload.branch) : null,
      note: payload.note ? String(payload.note) : null,
    });
    return Response.json({ assignment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
