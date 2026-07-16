import { apiError } from "../../../../../lib/api";
import {
  approveOrder,
  cancelOrder,
  failOrder,
  generateContractNote,
  rejectOrder,
} from "../../../../../lib/oms/order-service";
import { settleNextTrade } from "../../../../../lib/oms/settlement-service";
import { captureTrade } from "../../../../../lib/oms/trade-service";
import { parseDateOnly, parsePositiveFiniteNumber } from "../../../../../lib/order-input";
import { requirePermission } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

type WorkflowAction = "approve" | "reject" | "cancel" | "execute" | "settle" | "fail" | "contract_note";

const permissions: Record<WorkflowAction, string> = {
  approve: "approve",
  reject: "reject",
  cancel: "create",
  execute: "trade",
  settle: "settle",
  fail: "adjust",
  contract_note: "report",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as {
      action?: WorkflowAction;
      reason?: string;
      executionPrice?: number;
      quantityFilled?: number;
      tradeDate?: string;
      captureReference?: string;
      tradeId?: string;
    };
    if (!payload.action || !(payload.action in permissions)) {
      return Response.json({ error: "Unsupported workflow action." }, { status: 400 });
    }
    if ((payload.reason?.length ?? 0) > 1_000) {
      return Response.json({ error: "The workflow reason is too long." }, { status: 400 });
    }
    const actor = requirePermission(request, permissions[payload.action]);

    switch (payload.action) {
      case "approve":
        return Response.json({ ok: true, ...(await approveOrder(actor, id)) });
      case "reject":
        return Response.json({
          ok: true,
          ...(await rejectOrder(actor, id, payload.reason?.trim() || "Rejected during broker review")),
        });
      case "cancel":
        return Response.json({
          ok: true,
          ...(await cancelOrder(actor, id, payload.reason?.trim() || "Cancelled by broker")),
        });
      case "fail": {
        const reason = payload.reason?.trim();
        if (!reason) return Response.json({ error: "A reason is required when marking an order failed." }, { status: 400 });
        return Response.json({ ok: true, ...(await failOrder(actor, id, reason)) });
      }
      case "contract_note":
        return Response.json({ ok: true, ...(await generateContractNote(actor, id)) });
      case "execute": {
        const quantity = parsePositiveFiniteNumber(payload.quantityFilled);
        const executionPrice = parsePositiveFiniteNumber(payload.executionPrice);
        const tradeDate = parseDateOnly(payload.tradeDate);
        if (quantity === null || executionPrice === null || !tradeDate) {
          return Response.json(
            { error: "A positive execution quantity, positive price, and valid trade date are required." },
            { status: 400 },
          );
        }
        if (!payload.captureReference?.trim() || payload.captureReference.length > 120) {
          return Response.json({ error: "A valid trade capture reference is required." }, { status: 400 });
        }
        return Response.json({
          ok: true,
          ...(await captureTrade(actor, id, {
            quantity,
            executionPrice,
            tradeDate,
            captureReference: payload.captureReference?.trim() || undefined,
          })),
        });
      }
      case "settle": {
        const tradeId = payload.tradeId?.trim();
        if (!tradeId) return Response.json({ error: "A trade ID is required for settlement confirmation." }, { status: 400 });
        return Response.json({ ok: true, ...(await settleNextTrade(actor, id, tradeId)) });
      }
    }
  } catch (error) {
    return apiError(error);
  }
}
