import { apiError } from "../../../lib/api";
import { documentTaxLotBasis, getTaxReporting } from "../../../lib/tax-reporting-service";
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
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    if (action === "create_policy" || action === "publish_policy") throw new Response("Tax rates are controlled centrally by Platform Admin for every brokerage.", { status: 403 });
    if (action === "document_basis") return Response.json(await documentTaxLotBasis(actor, String(payload.lotId ?? ""), payload));
    throw new Response("Unsupported tax-reporting action.", { status: 400 });
  } catch (error) { return apiError(error); }
}
