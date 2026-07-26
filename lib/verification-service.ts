import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./prisma";

export const ORDER_SOURCES = ["digital", "in_person", "neway", "phone", "investor_portal"] as const;
export type OrderSource = typeof ORDER_SOURCES[number];
export const OTP_DELIVERY_CHANNELS = ["sms", "email"] as const;
export type OtpDeliveryChannel = typeof OTP_DELIVERY_CHANNELS[number];

export type OrderAuthorizationPayload = {
  accountId: string; instrumentId: string; side: string; quantity: number | string;
  price: number | string; triggerPrice?: number | string | null; orderType: string; source: string; submissionReference: string;
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
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

export async function createOtpChallenge(input: {
  brokerId: string; clientId: string; accountId?: string; purpose: "kyc_phone" | "order_instruction";
  source: string; payloadHash: string; destinationHint?: string; deliveryChannel?: OtpDeliveryChannel; createdBy?: string | null;
}) {
  const deliveryChannel = input.deliveryChannel ?? "sms";
  const code = process.env.NODE_ENV === "production" ? String(randomInt(100000, 1000000)) : "246810";
  const salt = randomBytes(16).toString("hex");
  const challenge = await prisma.verificationChallenge.create({ data: {
    id: `VER-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
    brokerId: input.brokerId, clientId: input.clientId, accountId: input.accountId,
    purpose: input.purpose, source: input.source, method: `${deliveryChannel}_otp`, destinationHint: input.destinationHint,
    payloadHash: input.payloadHash, codeHash: codeHash(code, salt), salt,
    expiresAt: new Date(Date.now() + 5 * 60_000), createdBy: input.createdBy ?? null,
  } });
  await prisma.auditLog.create({ data: {
    id: crypto.randomUUID(), brokerId: input.brokerId, actorId: input.createdBy ?? null,
    action: "VERIFICATION_CHALLENGE_CREATED", entityType: "verification_challenge", entityId: challenge.id,
    summary: `${input.purpose} verification requested by ${deliveryChannel} via ${input.source}`,
    newValue: JSON.stringify({ purpose: input.purpose, source: input.source, deliveryChannel, expiresAt: challenge.expiresAt }),
  } });
  return { id: challenge.id, expiresAt: challenge.expiresAt, destinationHint: challenge.destinationHint, deliveryChannel, demoCode: process.env.NODE_ENV === "production" ? undefined : code };
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
  const consumedAt = new Date();
  const updated = await tx.verificationChallenge.updateMany({ where: { id: row.id, status: "verified", consumedAt: null }, data: { status: "consumed", consumedAt } });
  if (updated.count !== 1) throw new Response("This verification has already been used.", { status: 409 });
  return consumedAt;
}
