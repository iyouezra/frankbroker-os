import { runDailyNotificationSweep } from "../../../../lib/oms/notification-digest";
import { apiError } from "../../../../lib/api";
import { isInsecureDemoMode } from "../../../../lib/deployment-mode";

export const runtime = "nodejs";

/**
 * Daily reminder sweep. Wired to a Vercel Cron (see vercel.json) but also
 * callable manually. When CRON_SECRET is set it must be presented as a bearer
 * token. It fails closed when no token is configured, except in the explicitly
 * enabled demo profile.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const insecureDemo = isInsecureDemoMode();
  if (!secret && !insecureDemo) return new Response("Cron authentication is not configured.", { status: 503 });
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
