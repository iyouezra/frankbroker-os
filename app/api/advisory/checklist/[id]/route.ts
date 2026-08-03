import { actOnChecklistItem } from "../../../../../lib/advisory-service";
import { apiError } from "../../../../../lib/api";
import { ADVISORY_PERMISSIONS } from "../../../../../lib/frank";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json() as Record<string, unknown>;
    const review = ["approve", "return", "not_applicable"].includes(String(input.action ?? ""));
    const { actor } = await requireTenantModule(request, "issuer_advisory", review ? ADVISORY_PERMISSIONS.checklistApprove : ADVISORY_PERMISSIONS.checklistPrepare);
    const { id } = await context.params;
    return Response.json({ item: await actOnChecklistItem(actor, id, input) });
  } catch (error) { return apiError(error); }
}
