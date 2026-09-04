import { apiError } from "../../../../lib/api";
import {
  investorAuthPresentation,
  requestInvestorLogin,
  verifyInvestorLogin,
} from "../../../../lib/investor-auth";
import { prisma } from "../../../../lib/prisma";
import {
  expiredSessionCookieHeaders,
  resolveInvestorContext,
  sessionCookieHeaders,
} from "../../../../lib/server-auth";

export const runtime = "nodejs";

function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new Response("Cross-site authentication request rejected.", { status: 403 });
  }
}

function withCookies(response: Response, cookies: string[]) {
  cookies.forEach((cookie) => response.headers.append("Set-Cookie", cookie));
  return response;
}

export async function GET(request: Request) {
  const presentation = investorAuthPresentation();
  if (presentation.mode === "demo") return Response.json({ ...presentation, authenticated: false });
  try {
    const context = await resolveInvestorContext(request);
    const client = await prisma.client.findFirst({
      where: { id: context.clientId, brokerId: context.brokerId },
      select: { fullName: true },
    });
    return Response.json({ ...presentation, authenticated: Boolean(client), fullName: client?.fullName ?? null });
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return Response.json({ ...presentation, authenticated: false });
    }
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "request") {
      const challenge = await requestInvestorLogin({
        clientCode: String(body.clientCode ?? ""),
        login: String(body.login ?? ""),
      });
      return Response.json(challenge, { status: 201 });
    }
    if (action === "verify") {
      const authenticated = await verifyInvestorLogin({
        challengeId: String(body.challengeId ?? ""),
        code: String(body.code ?? ""),
      });
      const response = Response.json({
        authenticated: true,
        fullName: authenticated.fullName,
      });
      return withCookies(response, sessionCookieHeaders(request, authenticated.token));
    }
    if (action === "logout") {
      return withCookies(Response.json({ authenticated: false }), expiredSessionCookieHeaders());
    }
    return Response.json({ error: "Unsupported investor authentication action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
