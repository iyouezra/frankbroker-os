import { apiError } from "../../../../../../lib/api";
import { recordComplianceSubmission, reviewComplianceReport } from "../../../../../../lib/compliance-service";
import { COMPLIANCE_PERMISSIONS } from "../../../../../../lib/frank";
import { requirePermission } from "../../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action === "review") {
      const actor = await requirePermission(request, COMPLIANCE_PERMISSIONS.reportReview);
      return Response.json({ report: await reviewComplianceReport(actor, id) });
    }
    if (payload.action === "submit") {
      const actor = await requirePermission(request, COMPLIANCE_PERMISSIONS.reportSubmit);
      return Response.json({ report: await recordComplianceSubmission(actor, id, payload.submissionReference, payload.note) });
    }
    return Response.json({ error: "Unsupported report action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
