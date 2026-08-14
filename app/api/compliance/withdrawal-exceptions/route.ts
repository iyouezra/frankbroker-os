import { apiError } from "../../../../lib/api";
import { MONITORING_PERMISSIONS } from "../../../../lib/frank";
import { decideWithdrawalException, requestWithdrawalException } from "../../../../lib/monitoring-service";
import { requirePermission } from "../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, MONITORING_PERMISSIONS.withdrawalExceptionApprove);
    const payload = await request.json() as Record<string, unknown>;
    const cashMovementId = String(payload.cashMovementId ?? "");
    if (payload.action === "request") return Response.json({ exception: await requestWithdrawalException(actor, cashMovementId, String(payload.reason ?? "")) }, { status: 201 });
    if (payload.action === "decide") return Response.json({ exception: await decideWithdrawalException(actor, cashMovementId, String(payload.decision ?? "rejected")) });
    return Response.json({ error: "Unsupported withdrawal-exception action." }, { status: 400 });
  } catch (error) { return apiError(error); }
}
