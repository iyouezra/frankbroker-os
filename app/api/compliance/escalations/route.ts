import { apiError } from "../../../../lib/api";
import { createComplianceEscalation, listComplianceEscalations } from "../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS } from "../../../../lib/frank";
import { requirePermission } from "../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, COMPLIANCE_PERMISSIONS.view);
    return Response.json({ escalations: await listComplianceEscalations(actor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, COMPLIANCE_PERMISSIONS.escalationCreate);
    return Response.json({ escalation: await createComplianceEscalation(actor, await request.json() as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
