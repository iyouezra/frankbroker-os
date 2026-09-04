import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./prisma";
import { isInsecureDemoMode, isInvestorDemoAuthEnabled } from "./deployment-mode";

export const ORDER_SOURCES = ["digital", "in_person", "neway", "phone", "investor_portal"] as const;
export type OrderSource = typeof ORDER_SOURCES[number];
export const OTP_DELIVERY_CHANNELS = ["sms", "email"] as const;
export type OtpDeliveryChannel = typeof OTP_DELIVERY_CHANNELS[number];

export type OrderAuthorizationPayload = {
  accountId: string; instrumentId: string; side: string; quantity: number | string;
  price: number | string; triggerPrice?: number | string | null; orderType: string;
  validity: string; goodTillDate?: string | null; source: string; submissionReference: string;
};

function normalizedOrderPayload(value: OrderAuthorizationPayload) {
  return {
    accountId: value.accountId,
    instrumentId: value.instrumentId,
    side: value.side.toLowerCase(),
    quantity: Number(value.quantity).toFixed(8),
    price: Number(value.price).toFixed(6),
    triggerPrice: value.triggerPrice === undefined || value.triggerPrice === null || value.triggerPrice === ""
      ? null
      : Number(value.triggerPrice).toFixed(6),
    orderType: value.orderType.trim().toLowerCase().replaceAll(" ", "-"),
    validity: value.validity.trim().toLowerCase().replaceAll(" ", "-"),
    goodTillDate: value.goodTillDate || null,
    source: value.source,
    submissionReference: value.submissionReference,
  };
}

export function orderPayloadHash(value: OrderAuthorizationPayload) {
  return createHash("sha256").update(JSON.stringify(normalizedOrderPayload(value))).digest("hex");
}

export function otpDestinationHint(channel: OtpDeliveryChannel, destination: string) {
  if (channel === "sms") {
    const digits = destination.replace(/\D/g, "");
    return digits ? `mobile ending ${digits.slice(-4)}` : "registered mobile";
  }
  const [local = "", domain = ""] = destination.trim().split("@");
  if (!local || !domain) return "registered email";
  return `${local.slice(0, 1)}${"*".repeat(Math.min(Math.max(local.length - 1, 3), 6))}@${domain}`;
}

function codeHash(code: string, salt: string) {
  const secret = process.env.FRANK_OTP_HASH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && !isInsecureDemoMode() && (!secret || secret.length < 32)) {
    throw new Response("OTP hashing is not configured.", { status: 503 });
  }
  return createHmac("sha256", secret || "explicit-demo-otp-hash-secret-not-for-live-data")
    .update(`${salt}:${code}`)
    .digest("hex");
}

function resolveDemoOtpCode() {
  const configured = process.env.FRANK_DEMO_OTP_CODE?.trim();
  if (configured && !/^\d{6}$/.test(configured)) {
    throw new Error("FRANK_DEMO_OTP_CODE must contain exactly six digits.");
  }
  return configured || "246810";
}

async function deliverOtp(input: { challengeId: string; channel: OtpDeliveryChannel; destination: string; code: string }) {
  const endpoint = process.env.FRANK_OTP_DELIVERY_URL?.trim();
  const token = process.env.FRANK_OTP_DELIVERY_TOKEN?.trim();
  if (!endpoint || !token) throw new Response("OTP delivery is not configured.", { status: 503 });
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Response("OTP delivery is not configured.", { status: 503 });
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Response("OTP delivery must use HTTPS.", { status: 503 });
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: input.challengeId,
        channel: input.channel,
        destination: input.destination,
        code: input.code,
        expiresInSeconds: 300,
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    throw new Response("OTP delivery is temporarily unavailable.", { status: 503 });
  }
  if (!response.ok) throw new Response("OTP delivery is temporarily unavailable.", { status: 503 });
}

export async function createOtpChallenge(input: {
  brokerId: string; clientId: string; accountId?: string; purpose: "kyc_phone" | "order_instruction" | "investor_login";
  source: string; payloadHash: string; destination: string; destinationHint?: string; deliveryChannel?: OtpDeliveryChannel; createdBy?: string | null;
  preAuthMethod?: "webauthn_uv"; preAuthReference?: string;
}) {
  const deliveryChannel = input.deliveryChannel ?? "sms";
  const demoCode = isInsecureDemoMode() ? resolveDemoOtpCode() : null;
  const code = demoCode ?? String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString("hex");
  const challengeId = `VER-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
  const now = new Date();
  const recentSince = new Date(now.getTime() - 10 * 60_000);
  const [latest, recentCount] = await Promise.all([
    prisma.verificationChallenge.findFirst({
      where: { brokerId: input.brokerId, clientId: input.clientId, purpose: input.purpose },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.verificationChallenge.count({
      where: { brokerId: input.brokerId, clientId: input.clientId, purpose: input.purpose, createdAt: { gte: recentSince } },
    }),
  ]);
  if (latest && now.getTime() - latest.createdAt.getTime() < 30_000) {
    throw new Response("Wait before requesting another verification code.", { status: 429 });
  }
  if (recentCount >= 5) throw new Response("Too many verification codes requested. Try again later.", { status: 429 });
  await prisma.verificationChallenge.updateMany({
    where: { brokerId: input.brokerId, clientId: input.clientId, purpose: input.purpose, status: { in: ["pending", "verified"] }, consumedAt: null },
    data: { status: "superseded" },
  });
  const challenge = await prisma.verificationChallenge.create({ data: {
    id: challengeId,
    brokerId: input.brokerId, clientId: input.clientId, accountId: input.accountId,
    purpose: input.purpose, source: input.source, method: `${deliveryChannel}_otp`, destinationHint: input.destinationHint,
    payloadHash: input.payloadHash, codeHash: codeHash(code, salt), salt,
    expiresAt: new Date(now.getTime() + 5 * 60_000), createdBy: input.createdBy ?? null,
    preAuthMethod: input.preAuthMethod ?? null, preAuthReference: input.preAuthReference ?? null,
  } });
  await prisma.auditLog.create({ data: {
    id: crypto.randomUUID(), brokerId: input.brokerId, actorId: input.createdBy ?? null,
    action: "VERIFICATION_CHALLENGE_CREATED", entityType: "verification_challenge", entityId: challenge.id,
    summary: `${input.purpose} verification requested by ${deliveryChannel} via ${input.source}`,
    newValue: JSON.stringify({ purpose: input.purpose, source: input.source, deliveryChannel, expiresAt: challenge.expiresAt, preAuthMethod: input.preAuthMethod ?? null, preAuthReference: input.preAuthReference ?? null }),
  } });
  if (!demoCode) {
    try {
      await deliverOtp({ challengeId, channel: deliveryChannel, destination: input.destination, code });
    } catch (error) {
      await prisma.verificationChallenge.update({ where: { id: challengeId }, data: { status: "delivery_failed" } });
      throw error;
    }
  }
  return { id: challenge.id, expiresAt: challenge.expiresAt, destinationHint: challenge.destinationHint, deliveryChannel, demoCode: demoCode ?? undefined };
}

export async function confirmOtpChallenge(input: { id: string; brokerId: string; clientId: string; code: string }) {
  const row = await prisma.verificationChallenge.findFirst({ where: { id: input.id, brokerId: input.brokerId, clientId: input.clientId } });
  if (!row) throw new Response("Verification challenge not found.", { status: 404 });
  if (row.status === "verified") return { id: row.id, status: row.status };
  if (row.status !== "pending" || row.expiresAt <= new Date()) throw new Response("This verification code has expired. Request a new code.", { status: 409 });
  if (row.attempts >= row.maxAttempts) throw new Response("This verification challenge is locked.", { status: 409 });
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(codeHash(input.code.trim(), row.salt), "hex");
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!valid) {
    const attempts = row.attempts + 1;
    await prisma.verificationChallenge.update({ where: { id: row.id }, data: { attempts, status: attempts >= row.maxAttempts ? "locked" : "pending" } });
    throw new Response("The verification code is incorrect.", { status: 400 });
  }
  const verifiedAt = new Date();
  await prisma.$transaction([
    prisma.verificationChallenge.update({ where: { id: row.id }, data: { status: "verified", verifiedAt } }),
    prisma.auditLog.create({ data: { id: crypto.randomUUID(), brokerId: row.brokerId, action: "VERIFICATION_COMPLETED", entityType: "verification_challenge", entityId: row.id, summary: `${row.purpose} verified`, newValue: JSON.stringify({ status: "verified", verifiedAt }) } }),
  ]);
  return { id: row.id, status: "verified", verifiedAt };
}

export async function consumeOrderVerification(tx: Prisma.TransactionClient, input: {
  id: string; brokerId: string; clientId: string; accountId: string; payloadHash: string; orderId: string;
}) {
  const row = await tx.verificationChallenge.findFirst({ where: { id: input.id, brokerId: input.brokerId, clientId: input.clientId, accountId: input.accountId, purpose: "order_instruction" } });
  if (!row || row.status !== "verified" || row.consumedAt || row.expiresAt <= new Date() || row.payloadHash !== input.payloadHash) {
    throw new Response("A valid, unexpired verification for these exact order details is required.", { status: 409 });
  }
  if (row.source === "investor_portal" && !isInvestorDemoAuthEnabled()) {
    if (row.preAuthMethod !== "webauthn_uv" || !row.preAuthReference) {
      throw new Response("Passkey verification is required before an investor order can be submitted.", { status: 409 });
    }
    const passkeyProof = await tx.investorPasskeyChallenge.findFirst({ where: {
      id: row.preAuthReference,
      brokerId: input.brokerId,
      clientId: input.clientId,
      purpose: "order_instruction",
      payloadHash: input.payloadHash,
      status: "verified",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    } });
    if (!passkeyProof) {
      throw new Response("The passkey proof for this order has expired or was already used.", { status: 409 });
    }
    const passkeyConsumed = await tx.investorPasskeyChallenge.updateMany({
      where: { id: passkeyProof.id, status: "verified", consumedAt: null },
      data: { status: "consumed", consumedAt: new Date() },
    });
    if (passkeyConsumed.count !== 1) throw new Response("This passkey proof has already been used.", { status: 409 });
  }
  const consumedAt = new Date();
  const updated = await tx.verificationChallenge.updateMany({ where: { id: row.id, status: "verified", consumedAt: null }, data: { status: "consumed", consumedAt } });
  if (updated.count !== 1) throw new Response("This verification has already been used.", { status: 409 });
  return consumedAt;
}
