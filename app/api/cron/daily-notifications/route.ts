import { runDailyNotificationSweep } from "../../../../lib/oms/notification-digest";
import { apiError } from "../../../../lib/api";

export const runtime = "nodejs";

/**
 * Daily reminder sweep. Wired to a Vercel Cron (see vercel.json) but also
 * callable manually. When CRON_SECRET is set it must be presented as a bearer
 * token; in local/demo use (no secret) it runs unauthenticated.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runDailyNotificationSweep();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}

export function GET(request: Request) {
  return run(request);
}

export function POST(request: Request) {
  return run(request);
}
