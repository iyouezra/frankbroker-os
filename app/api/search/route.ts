import { apiError } from "../../../lib/api";
import { searchBackOffice } from "../../../lib/back-office-service";
import { resolveActor } from "../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(await searchBackOffice(resolveActor(request), url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit") ?? 20)));
  } catch (error) {
    return apiError(error);
  }
}
