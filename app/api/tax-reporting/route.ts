import { apiError } from "../../../lib/api";
import { createTaxPolicy, documentTaxLotBasis, getTaxReporting, publishTaxPolicy } from "../../../lib/tax-reporting-service";
import { requireTenantModule } from "../../../lib/tenant-capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    return Response.json(await getTaxReporting(actor));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const permission = action === "publish_policy" ? "approve" : "adjust";
    const { actor } = await requireTenantModule(request, "dealer_operations", permission);
    if (action === "create_policy") return Response.json(await createTaxPolicy(actor, payload), { status: 201 });
    if (action === "publish_policy") return Response.json(await publishTaxPolicy(actor, String(payload.policyId ?? "")));
    if (action === "document_basis") return Response.json(await documentTaxLotBasis(actor, String(payload.lotId ?? ""), payload));
    throw new Response("Unsupported tax-reporting action.", { status: 400 });
  } catch (error) { return apiError(error); }
}
