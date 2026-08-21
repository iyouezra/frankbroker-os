import { apiError } from "../../../../lib/api";
import { isInsecureDemoMode } from "../../../../lib/deployment-mode";
import { runOrderExpirySweep } from "../../../../lib/oms/order-expiry-service";

export const runtime = "nodejs";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && !isInsecureDemoMode()) return new Response("Cron authentication is not configured.", { status: 503 });
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runOrderExpirySweep();
    return Response.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 207 : 200 });
  } catch (error) {
    return apiError(error);
  }
}

export function GET(request: Request) { return run(request); }
export function POST(request: Request) { return run(request); }
