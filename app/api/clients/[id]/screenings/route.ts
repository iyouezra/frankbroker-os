import { apiError } from "../../../../../lib/api";
import { recordClientScreening } from "../../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS } from "../../../../../lib/frank";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, COMPLIANCE_PERMISSIONS.screeningRecord);
    const { id } = await context.params;
    return Response.json({ screening: await recordClientScreening(actor, id, await request.json() as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
