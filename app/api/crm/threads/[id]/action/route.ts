import { apiError } from "../../../../../../lib/api";
import { requirePermission } from "../../../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../../../lib/frank";
import {
  addInternalNote,
  assignThread,
  changeThreadPriority,
  changeThreadStatus,
  markThreadReadByBroker,
  postBrokerMessage,
} from "../../../../../../lib/crm/thread-service";
import { prepareAttachments } from "../../../../../../lib/crm/attachments";
import { completeServiceRequest } from "../../../../../../lib/crm/service-request-service";

export const runtime = "nodejs";

type ThreadAction = "reply" | "note" | "assign" | "status" | "priority" | "read" | "service_request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const payload = multipart
      ? (JSON.parse(String(formData?.get("payload") ?? "{}")) as Record<string, unknown>)
      : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
    const action = payload.action as ThreadAction | undefined;

    // Each branch names its own permission literal so the gate is explicit and
    // auditable per action rather than derived from a shared lookup.
    if (action === "reply") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.reply);
      const attachments = formData ? await prepareAttachments(formData) : [];
      return Response.json({ ok: true, ...(await postBrokerMessage(actor, id, payload.body, attachments)) });
    }
    if (action === "note") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.note);
      const attachments = formData ? await prepareAttachments(formData) : [];
      return Response.json({ ok: true, ...(await addInternalNote(actor, id, payload.body, attachments)) });
    }
    if (action === "assign") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.assign);
      const assignee = payload.assignedToUserId ? String(payload.assignedToUserId) : null;
      return Response.json({ ok: true, ...(await assignThread(actor, id, assignee)) });
    }
    if (action === "status") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.status);
      const reason = payload.reason ? String(payload.reason).slice(0, 500) : undefined;
      return Response.json({ ok: true, ...(await changeThreadStatus(actor, id, String(payload.status ?? ""), reason)) });
    }
    if (action === "priority") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.priority);
      return Response.json({ ok: true, ...(await changeThreadPriority(actor, id, payload.priority)) });
    }
    if (action === "read") {
      const actor = await requirePermission(request, CRM_PERMISSIONS.view);
      return Response.json(await markThreadReadByBroker(actor, id));
    }
    if (action === "service_request") {
      const actor = await requirePermission(request, "adjust");
      const decision = String(payload.decision ?? "");
      if (!["resolve", "reject", "approve_closure"].includes(decision)) {
        return Response.json({ error: "Choose a supported request decision." }, { status: 400 });
      }
      return Response.json({
        ok: true,
        ...(await completeServiceRequest(actor, {
          threadId: id,
          decision: decision as "resolve" | "reject" | "approve_closure",
          outcomeSummary: payload.outcomeSummary,
        })),
      });
    }

    return Response.json({ error: "Unsupported conversation action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
