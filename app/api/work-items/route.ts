import { apiError } from "../../../lib/api";
import { listWorkItems } from "../../../lib/back-office-service";
import { requirePermission } from "../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return Response.json(await listWorkItems(await requirePermission(request, "report")));
  } catch (error) {
    return apiError(error);
  }
}
