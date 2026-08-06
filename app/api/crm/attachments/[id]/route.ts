import { apiError } from "../../../../../lib/api";
import { requirePermission } from "../../../../../lib/server-auth";
import { CRM_PERMISSIONS } from "../../../../../lib/frank";
import { getAttachmentForBroker } from "../../../../../lib/crm/thread-service";
import { attachmentResponse } from "../../../../../lib/crm/attachments";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(request, CRM_PERMISSIONS.view);
    const { id } = await context.params;
    const attachment = await getAttachmentForBroker(actor, id);
    return attachmentResponse(attachment, request.url);
  } catch (error) {
    return apiError(error);
  }
}
