import { apiError } from "../../../../lib/api";
import { actOnInvestorComplaint, listInvestorComplaints } from "../../../../lib/crm/case-service";
import { resolveInvestorContext } from "../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const investor = await resolveInvestorContext(request);
    return Response.json({ complaints: await listInvestorComplaints(investor) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const investor = await resolveInvestorContext(request);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const caseId = String(payload.caseId ?? "");
    if (!caseId) return Response.json({ error: "Choose a complaint." }, { status: 400 });
    return Response.json(await actOnInvestorComplaint(investor, caseId, { action: String(payload.action ?? ""), reason: payload.reason }));
  } catch (error) {
    return apiError(error);
  }
}
