import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { apiError } from "../../../../../lib/api";
import {
  beginInvestorPasskeyRegistration,
  finishInvestorPasskeyRegistration,
  listInvestorPasskeys,
  revokeInvestorPasskey,
} from "../../../../../lib/investor-passkeys";
import { resolveInvestorContext } from "../../../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    return Response.json({ passkeys: await listInvestorPasskeys(brokerId, clientId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "register_options") {
      return Response.json(await beginInvestorPasskeyRegistration(request, brokerId, clientId), { status: 201 });
    }
    if (action === "register_verify") {
      return Response.json(await finishInvestorPasskeyRegistration({
        request,
        brokerId,
        clientId,
        challengeId: String(body.challengeId ?? ""),
        response: body.response as RegistrationResponseJSON,
        label: String(body.label ?? ""),
      }), { status: 201 });
    }
    if (action === "revoke") {
      return Response.json(await revokeInvestorPasskey(brokerId, clientId, String(body.passkeyId ?? "")));
    }
    return Response.json({ error: "Unsupported passkey action." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
