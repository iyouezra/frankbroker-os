import { apiError } from "../../../../lib/api";
import { resolveInvestorContext } from "../../../../lib/server-auth";
import { boundedInteger, getInvestorThread, investorSupportSummary, listInvestorThreads } from "../../../../lib/crm/thread-service";

export const runtime = "nodejs";

/**
 * Investor support reads. Kept off the `/api/investor` bootstrap because
 * conversations paginate in two dimensions (thread list, and messages within a
 * thread) and the bootstrap has no shape for that.
 *
 * Authorization is ownership-only - this route must never call
 * `requirePermission`, which is the broker gate. Every query is scoped by both
 * tenant and client through `resolveInvestorContext`.
 */
export async function GET(request: Request) {
  try {
    const investor = await resolveInvestorContext(request);
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100_000);
    const pageSize = boundedInteger(url.searchParams.get("pageSize"), 25, 10, 100);

    if (threadId) {
      return Response.json(await getInvestorThread(investor, threadId, page, pageSize));
    }

    const [list, summary] = await Promise.all([
      listInvestorThreads(investor, page, pageSize),
      investorSupportSummary(investor),
    ]);
    return Response.json({ ...list, summary });
  } catch (error) {
    return apiError(error);
  }
}
