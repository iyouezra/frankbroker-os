import { apiError } from "../../../../../../lib/api";
import { requirePermission } from "../../../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../../../lib/frank";
import { assignTask, changeTaskStatus, escalateTask } from "../../../../../../lib/crm/task-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "status") {
      // Completing is a distinct right from merely progressing a task.
      const permission = payload.status === "completed" ? CRM_PERMISSIONS.taskComplete : CRM_PERMISSIONS.taskCreate;
      const actor = requirePermission(request, permission);
      return Response.json({ ok: true, ...(await changeTaskStatus(actor, id, String(payload.status ?? ""), payload.completionNote)) });
    }
    if (action === "assign") {
      const actor = requirePermission(request, CRM_PERMISSIONS.taskAssign);
      return Response.json({ ok: true, ...(await assignTask(actor, id, payload.assignedToUserId ? String(payload.assignedToUserId) : null)) });
    }
    if (action === "escalate") {
      const actor = requirePermission(request, CRM_PERMISSIONS.taskAssign);
      return Response.json({ ok: true, ...(await escalateTask(actor, id, payload.escalated !== false)) });
    }

    return Response.json({ error: "Unsupported task action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
