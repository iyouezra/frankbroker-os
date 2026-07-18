import { apiError } from "../../../../../lib/api";
import { reviewCashMovement, serializeCashMovement } from "../../../../../lib/cash-service";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, "adjust");
    const { id } = await context.params;
    const payload = await request.json() as { action?: string; reason?: string; bankReference?: string };
    if (!payload.action || !["verify", "approve", "complete", "reject", "fail"].includes(payload.action)) {
      return Response.json({ error: "Unsupported cash movement action." }, { status: 400 });
    }
    const movement = await reviewCashMovement(
      actor,
      id,
      payload.action as "verify" | "approve" | "complete" | "reject" | "fail",
      { reason: payload.reason, bankReference: payload.bankReference },
    );
    return Response.json({ movement: serializeCashMovement(movement) });
  } catch (error) {
    return apiError(error);
  }
}
