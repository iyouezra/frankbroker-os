import { apiError } from "../../../../lib/api";
import { requirePermission } from "../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../lib/frank";
import { boundedInteger, createBrokerThread, listThreads } from "../../../../lib/crm/thread-service";
import { prepareAttachments } from "../../../../lib/crm/attachments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.view);
    const url = new URL(request.url);
    const result = await listThreads(actor, {
      page: boundedInteger(url.searchParams.get("page"), 1, 1, 100_000),
      pageSize: boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100),
      status: url.searchParams.get("status") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      assigned: url.searchParams.get("assigned") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.create);
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const payload = multipart
      ? (JSON.parse(String(formData?.get("payload") ?? "{}")) as Record<string, unknown>)
      : ((await request.json()) as Record<string, unknown>);
    const attachments = formData ? await prepareAttachments(formData) : [];

    const thread = await createBrokerThread(actor, {
      clientId: String(payload.clientId ?? ""),
      subject: payload.subject,
      body: payload.body,
      category: payload.category,
      priority: payload.priority,
      relatedType: payload.relatedType,
      relatedId: payload.relatedId,
      attachments,
    });
    return Response.json({ thread }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
