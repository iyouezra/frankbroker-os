import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { prisma } from "./prisma";
import { establishInvestorSession } from "./investor-auth";
import { isInvestorDemoAuthEnabled } from "./deployment-mode";

const CHALLENGE_TTL_MS = 5 * 60_000;
const PASSKEY_PROVIDER = {
  provider: "frank_passkey",
  issuer: "urn:frank-money:investor-passkey",
} as const;

type CeremonyPurpose = "registration" | "login" | "order_instruction";

function requireProtectedInvestorMode() {
  if (isInvestorDemoAuthEnabled()) {
    throw new Response("Personal passkeys are unavailable for shared demo accounts.", { status: 409 });
  }
}

function ceremonyConfig(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  if (process.env.NODE_ENV === "production" && requestUrl.protocol !== "https:") {
    throw new Response("Passkeys require HTTPS.", { status: 503 });
  }
  const rpId = process.env.FRANK_WEBAUTHN_RP_ID?.trim().toLowerCase() || requestUrl.hostname.toLowerCase();
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname !== rpId && !hostname.endsWith(`.${rpId}`)) {
    throw new Response("Passkey relying-party configuration does not match this domain.", { status: 503 });
  }
  const configuredOrigins = (process.env.FRANK_WEBAUTHN_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (configuredOrigins.length && !configuredOrigins.includes(origin)) {
    throw new Response("Passkeys are not enabled on this application origin.", { status: 403 });
  }
  return { origin, rpId, rpName: process.env.FRANK_WEBAUTHN_RP_NAME?.trim() || "Frank Money" };
}

function assertChallengeRequest(request: Request, challenge: { origin: string; rpId: string }) {
  const current = ceremonyConfig(request);
  if (current.origin !== challenge.origin || current.rpId !== challenge.rpId) {
    throw new Response("This passkey request belongs to a different application domain.", { status: 409 });
  }
}

function activeChallengeWhere(id: string, purpose: CeremonyPurpose) {
  return { id, purpose, status: "pending", consumedAt: null, expiresAt: { gt: new Date() } } as const;
}

async function saveChallenge(input: {
  brokerId?: string;
  clientId?: string;
  purpose: CeremonyPurpose;
  challenge: string;
  rpId: string;
  origin: string;
  payloadHash?: string;
}) {
  const now = new Date();
  if (input.clientId) {
    await prisma.investorPasskeyChallenge.updateMany({
      where: {
        clientId: input.clientId,
        purpose: input.purpose,
        status: { in: ["pending", "verified"] },
        consumedAt: null,
      },
      data: { status: "superseded", consumedAt: now },
    });
  }
  return prisma.investorPasskeyChallenge.create({
    data: {
      id: `pkc_${crypto.randomUUID()}`,
      brokerId: input.brokerId ?? null,
      clientId: input.clientId ?? null,
      purpose: input.purpose,
      challenge: input.challenge,
      rpId: input.rpId,
      origin: input.origin,
      payloadHash: input.payloadHash ?? null,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    },
  });
}

function passkeyCredential(passkey: {
  credentialId: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: unknown;
}) {
  return {
    id: passkey.credentialId,
    publicKey: new Uint8Array(passkey.publicKey),
    counter: Number(passkey.counter),
    transports: Array.isArray(passkey.transports) ? passkey.transports.map(String) : undefined,
  };
}

function safePasskeyError(error: unknown): never {
  if (error instanceof Response) throw error;
  throw new Response("The passkey response could not be verified.", { status: 400 });
}

function requireCredentialResponse(
  response: AuthenticationResponseJSON | RegistrationResponseJSON | undefined,
) {
  if (
    !response ||
    typeof response !== "object" ||
    typeof response.id !== "string" ||
    !response.id ||
    response.type !== "public-key"
  ) {
    throw new Response("A valid passkey response is required.", { status: 400 });
  }
}

export async function listInvestorPasskeys(brokerId: string, clientId: string) {
  requireProtectedInvestorMode();
  const rows = await prisma.investorPasskey.findMany({
    where: { brokerId, clientId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
  });
  return rows.map((row) => ({
    ...row,
    label: row.label || "Passkey",
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function beginInvestorPasskeyRegistration(request: Request, brokerId: string, clientId: string) {
  requireProtectedInvestorMode();
  const config = ceremonyConfig(request);
  const client = await prisma.client.findFirst({
    where: { id: clientId, brokerId },
    select: {
      id: true,
      clientCode: true,
      fullName: true,
      passkeys: { where: { revokedAt: null }, select: { credentialId: true, transports: true } },
    },
  });
  if (!client) throw new Response("Investor account not found.", { status: 404 });
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: Buffer.from(client.id, "utf8"),
    userName: client.clientCode,
    userDisplayName: client.fullName,
    attestationType: "none",
    excludeCredentials: client.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: Array.isArray(passkey.transports) ? passkey.transports.map(String) : undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    timeout: CHALLENGE_TTL_MS,
  });
  const challenge = await saveChallenge({ brokerId, clientId, purpose: "registration", challenge: options.challenge, ...config });
  return { challengeId: challenge.id, options };
}

export async function finishInvestorPasskeyRegistration(input: {
  request: Request;
  brokerId: string;
  clientId: string;
  challengeId: string;
  response: RegistrationResponseJSON;
  label?: string;
}) {
  requireProtectedInvestorMode();
  requireCredentialResponse(input.response);
  const challenge = await prisma.investorPasskeyChallenge.findFirst({
    where: { ...activeChallengeWhere(input.challengeId, "registration"), brokerId: input.brokerId, clientId: input.clientId },
  });
  if (!challenge) throw new Response("This passkey setup has expired. Start again.", { status: 409 });
  assertChallengeRequest(input.request, challenge);
  try {
    const verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: true,
    });
    if (!verification.verified) safePasskeyError(null);
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const createdAt = new Date();
    const label = input.label?.trim().slice(0, 80) || "This device";
    const passkey = await prisma.$transaction(async (tx) => {
      const consumed = await tx.investorPasskeyChallenge.updateMany({
        where: { id: challenge.id, status: "pending", consumedAt: null },
        data: { status: "consumed", verifiedAt: createdAt, consumedAt: createdAt },
      });
      if (consumed.count !== 1) throw new Response("This passkey setup was already used.", { status: 409 });
      const row = await tx.investorPasskey.create({ data: {
        id: `pk_${crypto.randomUUID()}`,
        brokerId: input.brokerId,
        clientId: input.clientId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        webauthnUserId: Buffer.from(input.clientId, "utf8").toString("base64url"),
        counter: BigInt(credential.counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports ?? [],
        label,
      } });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(), brokerId: input.brokerId, actorId: null,
        action: "INVESTOR_PASSKEY_REGISTERED", entityType: "investor_passkey", entityId: row.id,
        summary: `Investor registered passkey ${label}`,
        newValue: JSON.stringify({ clientId: input.clientId, deviceType: credentialDeviceType, backedUp: credentialBackedUp }),
      } });
      return row;
    });
    return { id: passkey.id, label: passkey.label, verified: true };
  } catch (error) {
    safePasskeyError(error);
  }
}

export async function revokeInvestorPasskey(brokerId: string, clientId: string, passkeyId: string) {
  requireProtectedInvestorMode();
  const passkey = await prisma.investorPasskey.findFirst({ where: { id: passkeyId, brokerId, clientId, revokedAt: null } });
  if (!passkey) throw new Response("Passkey not found.", { status: 404 });
  const revokedAt = new Date();
  await prisma.$transaction([
    prisma.investorPasskey.update({ where: { id: passkey.id }, data: { revokedAt } }),
    prisma.auditLog.create({ data: {
      id: crypto.randomUUID(), brokerId, actorId: null,
      action: "INVESTOR_PASSKEY_REVOKED", entityType: "investor_passkey", entityId: passkey.id,
      summary: `Investor revoked passkey ${passkey.label || "Passkey"}`,
      newValue: JSON.stringify({ clientId, revokedAt }),
    } }),
  ]);
  return { revoked: true };
}

export async function beginInvestorPasskeyLogin(request: Request) {
  requireProtectedInvestorMode();
  const config = ceremonyConfig(request);
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "required",
    timeout: CHALLENGE_TTL_MS,
  });
  const challenge = await saveChallenge({ purpose: "login", challenge: options.challenge, ...config });
  return { challengeId: challenge.id, options };
}

export async function finishInvestorPasskeyLogin(request: Request, challengeId: string, response: AuthenticationResponseJSON) {
  requireProtectedInvestorMode();
  requireCredentialResponse(response);
  const [challenge, passkey] = await Promise.all([
    prisma.investorPasskeyChallenge.findFirst({ where: activeChallengeWhere(challengeId, "login") }),
    prisma.investorPasskey.findUnique({
      where: { credentialId: response.id },
      include: { client: { select: { id: true, status: true } }, broker: { select: { status: true } } },
    }),
  ]);
  if (!challenge) throw new Response("This passkey sign-in has expired. Start again.", { status: 409 });
  if (!passkey || passkey.revokedAt || ["closed", "rejected"].includes(passkey.client.status) || passkey.broker.status === "suspended") {
    throw new Response("The passkey or investor account is unavailable.", { status: 401 });
  }
  assertChallengeRequest(request, challenge);
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: passkeyCredential(passkey),
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.authenticationInfo.userVerified) safePasskeyError(null);
    const authenticatedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.investorPasskeyChallenge.updateMany({
        where: { id: challenge.id, status: "pending", consumedAt: null },
        data: { status: "consumed", verifiedAt: authenticatedAt, consumedAt: authenticatedAt, passkeyId: passkey.id, brokerId: passkey.brokerId, clientId: passkey.clientId },
      });
      if (consumed.count !== 1) throw new Response("This passkey sign-in was already used.", { status: 409 });
      await tx.investorPasskey.update({
        where: { id: passkey.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: authenticatedAt },
      });
    });
    return establishInvestorSession({
      clientId: passkey.clientId,
      identity: {
        ...PASSKEY_PROVIDER,
        subject: passkey.clientId,
        assuranceContext: "urn:frank-money:acr:webauthn-uv",
        authenticationMethods: ["passkey", "user_verification"],
        authenticatedAt,
      },
    });
  } catch (error) {
    safePasskeyError(error);
  }
}

export async function beginInvestorOrderPasskey(request: Request, input: { brokerId: string; clientId: string; payloadHash: string }) {
  requireProtectedInvestorMode();
  const config = ceremonyConfig(request);
  const passkeys = await prisma.investorPasskey.findMany({
    where: { brokerId: input.brokerId, clientId: input.clientId, revokedAt: null },
    select: { credentialId: true, transports: true },
  });
  if (!passkeys.length) {
    throw new Response("Set up a passkey under Profile → Security before placing an order.", { status: 409 });
  }
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: Array.isArray(passkey.transports) ? passkey.transports.map(String) : undefined,
    })),
    userVerification: "required",
    timeout: CHALLENGE_TTL_MS,
  });
  const challenge = await saveChallenge({ ...input, purpose: "order_instruction", challenge: options.challenge, ...config });
  return { challengeId: challenge.id, options };
}

export async function finishInvestorOrderPasskey(input: {
  request: Request;
  brokerId: string;
  clientId: string;
  challengeId: string;
  response: AuthenticationResponseJSON;
}) {
  requireProtectedInvestorMode();
  requireCredentialResponse(input.response);
  const [challenge, passkey] = await Promise.all([
    prisma.investorPasskeyChallenge.findFirst({
      where: { ...activeChallengeWhere(input.challengeId, "order_instruction"), brokerId: input.brokerId, clientId: input.clientId },
    }),
    prisma.investorPasskey.findFirst({
      where: { credentialId: input.response.id, brokerId: input.brokerId, clientId: input.clientId, revokedAt: null },
    }),
  ]);
  if (!challenge) throw new Response("This order passkey check has expired. Start again.", { status: 409 });
  if (!passkey) throw new Response("This passkey is not registered to the signed-in investor.", { status: 401 });
  assertChallengeRequest(input.request, challenge);
  try {
    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: passkeyCredential(passkey),
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.authenticationInfo.userVerified) safePasskeyError(null);
    const verifiedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const verified = await tx.investorPasskeyChallenge.updateMany({
        where: { id: challenge.id, status: "pending", consumedAt: null },
        data: { status: "verified", verifiedAt, passkeyId: passkey.id },
      });
      if (verified.count !== 1) throw new Response("This order passkey check was already used.", { status: 409 });
      await tx.investorPasskey.update({ where: { id: passkey.id }, data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: verifiedAt } });
      await tx.auditLog.create({ data: {
        id: crypto.randomUUID(), brokerId: input.brokerId, actorId: null,
        action: "INVESTOR_ORDER_PASSKEY_VERIFIED", entityType: "investor_passkey_challenge", entityId: challenge.id,
        summary: "Investor completed passkey verification for an exact order instruction",
        newValue: JSON.stringify({ clientId: input.clientId, passkeyId: passkey.id, payloadHash: challenge.payloadHash, verifiedAt }),
      } });
    });
    return { verified: true, passkeyVerificationId: challenge.id };
  } catch (error) {
    safePasskeyError(error);
  }
}

export async function assertInvestorOrderPasskey(input: { brokerId: string; clientId: string; challengeId: string; payloadHash: string }) {
  requireProtectedInvestorMode();
  const challenge = await prisma.investorPasskeyChallenge.findFirst({
    where: {
      id: input.challengeId,
      brokerId: input.brokerId,
      clientId: input.clientId,
      purpose: "order_instruction",
      payloadHash: input.payloadHash,
      status: "verified",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!challenge) throw new Response("Complete passkey verification for these exact order details before requesting the SMS code.", { status: 409 });
  return challenge;
}
