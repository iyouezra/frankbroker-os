import { apiError } from "../../../../lib/api";
import { requirePermission } from "../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../lib/frank";
import { boundedInteger } from "../../../../lib/crm/thread-service";
import { broadcastOptions, broadcastRecipients, listBroadcasts, previewBroadcast, sendBroadcast } from "../../../../lib/crm/broadcast-service";

export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.view);
    const params = new URL(request.url).searchParams;
    const page = boundedInteger(params.get("page"), 1, 1, 100_000);
    if (params.get("options") === "1") return Response.json(await broadcastOptions(actor));
    if (params.get("id")) return Response.json(await broadcastRecipients(actor, params.get("id")!, page));
    return Response.json(await listBroadcasts(actor, page));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.broadcastSend);
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Invalid broadcast." }, { status: 400 });
    if (payload.action === "preview") return Response.json(await previewBroadcast(actor, payload));
    if (payload.action === "send") return Response.json(await sendBroadcast(actor, payload), { status: 201 });
    return Response.json({ error: "Choose preview or send." }, { status: 400 });
  } catch (error) { return apiError(error); }
}
