import { apiError } from "../../../../lib/api";
import { requirePermission } from "../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../lib/frank";
import { boundedInteger } from "../../../../lib/crm/thread-service";
import { createTask, listTasks } from "../../../../lib/crm/task-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = requirePermission(request, CRM_PERMISSIONS.taskView);
    const url = new URL(request.url);
    return Response.json(await listTasks(actor, {
      page: boundedInteger(url.searchParams.get("page"), 1, 1, 100_000),
      pageSize: boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100),
      scope: url.searchParams.get("scope") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      assigned: url.searchParams.get("assigned") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, CRM_PERMISSIONS.taskCreate);
    const payload = (await request.json()) as Record<string, unknown>;
    const task = await createTask(actor, {
      clientId: String(payload.clientId ?? ""),
      title: payload.title,
      description: payload.description,
      taskType: payload.taskType,
      dueDate: payload.dueDate,
      priority: payload.priority,
      assignedToUserId: payload.assignedToUserId ? String(payload.assignedToUserId) : null,
      threadId: payload.threadId ? String(payload.threadId) : null,
      caseId: payload.caseId ? String(payload.caseId) : null,
      relatedType: payload.relatedType,
      relatedId: payload.relatedId,
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
