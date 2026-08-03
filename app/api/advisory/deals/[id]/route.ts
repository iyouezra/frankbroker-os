import { advanceDealStage, getAdvisoryDeal } from "../../../../../lib/advisory-service";
import { apiError } from "../../../../../lib/api";
import { ADVISORY_PERMISSIONS } from "../../../../../lib/frank";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "issuer_advisory", ADVISORY_PERMISSIONS.view);
    const { id } = await context.params;
    return Response.json({ deal: await getAdvisoryDeal(actor.brokerId, id) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "issuer_advisory", ADVISORY_PERMISSIONS.stageAdvance);
    const { id } = await context.params;
    return Response.json({ deal: await advanceDealStage(actor, id, await request.json() as Record<string, unknown>) });
  } catch (error) { return apiError(error); }
}
