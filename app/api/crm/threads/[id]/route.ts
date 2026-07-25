import { apiError } from "../../../../../lib/api";
import { requirePermission } from "../../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../../lib/frank";
import { boundedInteger, getThread } from "../../../../../lib/crm/thread-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, CRM_PERMISSIONS.view);
    const { id } = await context.params;
    const url = new URL(request.url);
    const result = await getThread(
      actor,
      id,
      boundedInteger(url.searchParams.get("page"), 1, 1, 100_000),
      boundedInteger(url.searchParams.get("pageSize"), 50, 10, 100),
    );
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
