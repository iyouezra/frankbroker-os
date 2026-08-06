import { apiError } from "../../../lib/api";
import { searchBackOffice } from "../../../lib/back-office-service";
import { requirePermission } from "../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(await searchBackOffice(await requirePermission(request, "report"), url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit") ?? 20)));
  } catch (error) {
    return apiError(error);
  }
}
