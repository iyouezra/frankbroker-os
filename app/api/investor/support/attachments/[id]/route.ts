import { apiError } from "../../../../../../lib/api";
import { resolveInvestorContext } from "../../../../../../lib/server-auth";
import { getAttachmentForInvestor } from "../../../../../../lib/crm/thread-service";
import { attachmentResponse } from "../../../../../../lib/crm/attachments";

export const runtime = "nodejs";

/**
 * Investor-facing attachment download. Authorization is by ownership, never by
 * broker permission: the lookup requires the attachment's tenant AND client to
 * match the caller's own context and its visibility to be "shared", so an
 * internal note's file is unreachable here even with a valid id.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const investor = await resolveInvestorContext(request);
    const { id } = await context.params;
    const attachment = await getAttachmentForInvestor(investor, id);
    return attachmentResponse(attachment, request.url);
  } catch (error) {
    return apiError(error);
  }
}
