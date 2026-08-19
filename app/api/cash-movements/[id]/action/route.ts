import { apiError } from "../../../../../lib/api";
import { reviewCashMovement, serializeCashMovement } from "../../../../../lib/cash-service";
import { requireTenantModule } from "../../../../../lib/tenant-capabilities";
import { prisma } from "../../../../../lib/prisma";
import { assertBusinessDayOpen } from "../../../../../lib/reconciliation-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    await assertBusinessDayOpen(prisma, actor.brokerId);
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
