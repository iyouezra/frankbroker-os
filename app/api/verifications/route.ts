import { apiError } from "../../../lib/api";
import { prisma } from "../../../lib/prisma";
import { requirePermission } from "../../../lib/server-auth";
import { confirmOtpChallenge, createOtpChallenge, ORDER_SOURCES, orderPayloadHash } from "../../../lib/verification-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = requirePermission(request, "create");
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const accountId = String(payload.accountId ?? "");
    const account = await prisma.account.findFirst({ where: { id: accountId, client: { brokerId: actor.brokerId } }, include: { client: true } });
    if (!account) return Response.json({ error: "Client account not found for this tenant." }, { status: 404 });
    if (action === "confirm") {
      return Response.json(await confirmOtpChallenge({ id: String(payload.verificationId ?? ""), brokerId: actor.brokerId, clientId: account.clientId, code: String(payload.code ?? "") }));
    }
    if (action !== "request_order") return Response.json({ error: "Unsupported verification action." }, { status: 400 });
    const source = String(payload.source ?? "");
    if (!ORDER_SOURCES.includes(source as (typeof ORDER_SOURCES)[number]) || source === "investor_portal") {
      return Response.json({ error: "Choose digital, in-person, Neway, or phone as the instruction source." }, { status: 400 });
    }
    const challenge = await createOtpChallenge({
      brokerId: actor.brokerId, clientId: account.clientId, accountId: account.id,
      purpose: "order_instruction", source, createdBy: actor.id,
      destinationHint: account.client.phone ? `mobile ending ${account.client.phone.replace(/\D/g, "").slice(-4)}` : "registered contact",
      payloadHash: orderPayloadHash({
        accountId, instrumentId: String(payload.instrumentId ?? ""), side: String(payload.side ?? ""),
        quantity: String(payload.quantity ?? ""), price: String(payload.price ?? ""), orderType: String(payload.orderType ?? ""),
        source, submissionReference: String(payload.submissionReference ?? ""),
      }),
    });
    return Response.json(challenge, { status: 201 });
  } catch (error) { return apiError(error); }
}
