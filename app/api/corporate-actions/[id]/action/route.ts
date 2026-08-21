import { apiError } from "../../../../../lib/api";
import { approveCorporateAction, calculateEntitlements, payCorporateAction, reconcileEntitlements, recordEntitlementElection } from "../../../../../lib/corporate-action-service";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";

export const runtime = "nodejs";

const permissions: Record<string, string> = { calculate: "adjust", reconcile: "adjust", approve: "approve", elect: "adjust", pay: "settle" };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    if (!permissions[action]) throw new Response("Unsupported corporate-action workflow step.", { status: 400 });
    const { actor } = await requireTenantModule(request, "dealer_operations", permissions[action]);
    if (action === "calculate") return Response.json(await calculateEntitlements(actor, id));
    if (action === "reconcile") {
      const positions = Array.isArray(payload.positions) ? payload.positions as Array<{ accountId: string; quantity: number | string }> : [];
      return Response.json(await reconcileEntitlements(actor, id, positions, String(payload.evidenceReference ?? "")));
    }
    if (action === "approve") return Response.json(await approveCorporateAction(actor, id));
    if (action === "elect") return Response.json(await recordEntitlementElection(actor, id, String(payload.entitlementId ?? ""), String(payload.election ?? ""), String(payload.evidence ?? "")));
    return Response.json(await payCorporateAction(actor, id, { pooledBankAccountId: String(payload.pooledBankAccountId ?? "") || undefined, paymentReference: String(payload.paymentReference ?? "") }));
  } catch (error) { return apiError(error); }
}
