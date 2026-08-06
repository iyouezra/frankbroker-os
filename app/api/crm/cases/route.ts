import { apiError } from "../../../../lib/api";
import { requirePermission } from "../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../lib/frank";
import { boundedInteger } from "../../../../lib/crm/thread-service";
import { convertThreadToCase, listCases } from "../../../../lib/crm/case-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.caseView);
    const url = new URL(request.url);
    return Response.json(await listCases(actor, {
      page: boundedInteger(url.searchParams.get("page"), 1, 1, 100_000),
      pageSize: boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100),
      status: url.searchParams.get("status") ?? undefined,
      severity: url.searchParams.get("severity") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
    }));
  } catch (error) {
    return apiError(error);
  }
}

/** Opens a case from an existing conversation; the thread stays intact and linked. */
export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.caseManage);
    const payload = (await request.json()) as Record<string, unknown>;
    const threadId = String(payload.threadId ?? "");
    if (!threadId) return Response.json({ error: "A conversation is required to open a case." }, { status: 400 });
    const serviceCase = await convertThreadToCase(actor, threadId, {
      severity: payload.severity,
      category: payload.category,
      subject: payload.subject,
    });
    return Response.json({ case: serviceCase }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
