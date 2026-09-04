import { createHash } from "node:crypto";

import { prisma } from "./prisma";
import { isInsecureDemoMode } from "./deployment-mode";
import { assertSessionConfiguration, createSessionToken } from "./server-auth";
import {
  confirmOtpChallenge,
  createOtpChallenge,
  otpDestinationHint,
  type OtpDeliveryChannel,
} from "./verification-service";

export const INVESTOR_AUTH_PROVIDERS = {
  otp: { provider: "frank_otp", issuer: "urn:frank-money:investor-otp" },
  fayda: { provider: "fayda_esignet" },
} as const;

export type InvestorAuthMode = "demo" | "otp";

export type VerifiedInvestorIdentity = {
  provider: string;
  issuer: string;
  subject: string;
  assuranceContext?: string | null;
  authenticationMethods?: string[];
  gender?: string | null;
  portraitReference?: string | null;
  authenticatedAt?: Date;
};

export function investorAuthMode(): InvestorAuthMode {
  const configured = process.env.FRANK_INVESTOR_AUTH_MODE?.trim().toLowerCase();
  if (configured && configured !== "demo" && configured !== "otp") {
    throw new Error("FRANK_INVESTOR_AUTH_MODE must be demo or otp.");
  }
  if (configured === "otp") return "otp";
  if (configured === "demo") return "demo";
  return isInsecureDemoMode() ? "demo" : "otp";
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeInvestorLogin(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLocaleLowerCase() : normalizedPhone(trimmed);
}

export function investorLoginPayloadHash(clientId: string, login: string) {
  return createHash("sha256").update(`${clientId}:${normalizeInvestorLogin(login)}`).digest("hex");
}

function loginDestination(client: { email: string | null; phone: string | null }, login: string) {
  const normalized = normalizeInvestorLogin(login);
  if (login.includes("@")) {
    const email = client.email?.trim();
    return email && email.toLocaleLowerCase() === normalized
      ? { channel: "email" as const, destination: email }
      : null;
  }
  const phone = client.phone?.trim();
  return phone && normalizedPhone(phone) === normalized
    ? { channel: "sms" as const, destination: phone }
    : null;
}

function unavailableLogin(): never {
  throw new Response("The account or registered contact could not be verified.", { status: 400 });
}

export async function requestInvestorLogin(input: { clientCode: string; login: string }) {
  if (investorAuthMode() !== "otp") throw new Response("Investor OTP authentication is not enabled.", { status: 409 });
  const clientCode = input.clientCode.trim().toUpperCase();
  const login = input.login.trim();
  if (!/^[A-Z0-9-]{4,32}$/.test(clientCode) || login.length < 5 || login.length > 160) unavailableLogin();

  const client = await prisma.client.findUnique({
    where: { clientCode },
    select: { id: true, brokerId: true, email: true, phone: true, status: true, broker: { select: { status: true } } },
  });
  const destination = client ? loginDestination(client, login) : null;
  if (!client || !destination || ["closed", "rejected"].includes(client.status) || client.broker.status === "suspended") unavailableLogin();

  return createOtpChallenge({
    brokerId: client.brokerId,
    clientId: client.id,
    purpose: "investor_login",
    source: "investor_portal",
    payloadHash: investorLoginPayloadHash(client.id, destination.destination),
    destination: destination.destination,
    destinationHint: otpDestinationHint(destination.channel, destination.destination),
    deliveryChannel: destination.channel,
  });
}

/**
 * The common trust boundary for every investor authenticator. A future Fayda
 * callback should verify issuer, signature, audience, nonce, expiry and `sub`,
 * then pass that verified result here. Roles and client ownership never come
 * from browser claims.
 */
export async function establishInvestorSession(input: {
  clientId?: string;
  identity: VerifiedInvestorIdentity;
  consumeChallengeId?: string;
}) {
  assertSessionConfiguration();
  const authenticatedAt = input.identity.authenticatedAt ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.investorIdentity.findUnique({
      where: { provider_issuer_subject: {
        provider: input.identity.provider,
        issuer: input.identity.issuer,
        subject: input.identity.subject,
      } },
      select: { id: true, clientId: true },
    });
    if (existingIdentity && input.clientId && existingIdentity.clientId !== input.clientId) {
      throw new Response("This authenticated identity is already linked to another investor.", { status: 409 });
    }
    const clientId = input.clientId ?? existingIdentity?.clientId;
    if (!clientId) {
      throw new Response("This authenticated identity is not linked to an investor account.", { status: 401 });
    }

    if (input.consumeChallengeId) {
      const consumed = await tx.verificationChallenge.updateMany({
        where: {
          id: input.consumeChallengeId,
          clientId,
          purpose: "investor_login",
          status: "verified",
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { status: "consumed", consumedAt: authenticatedAt },
      });
      if (consumed.count !== 1) throw new Response("This sign-in verification has expired or was already used.", { status: 409 });
    }

    const client = await tx.client.findFirst({
      where: { id: clientId, status: { notIn: ["closed", "rejected"] }, broker: { status: { not: "suspended" } } },
      select: { id: true, brokerId: true, fullName: true, portalAuthSubject: true },
    });
    if (!client) throw new Response("The investor account is unavailable.", { status: 401 });

    let principal = client.portalAuthSubject ?? `inv_${crypto.randomUUID()}`;
    if (!client.portalAuthSubject) {
      await tx.client.updateMany({
        where: { id: client.id, portalAuthSubject: null },
        data: { portalAuthSubject: principal },
      });
      const current = await tx.client.findUnique({ where: { id: client.id }, select: { portalAuthSubject: true } });
      if (!current?.portalAuthSubject) throw new Response("The investor account could not be secured.", { status: 409 });
      principal = current.portalAuthSubject;
    }
    const identityId = existingIdentity?.id ?? `iid_${crypto.randomUUID()}`;
    await tx.investorIdentity.upsert({
      where: { provider_issuer_subject: {
        provider: input.identity.provider,
        issuer: input.identity.issuer,
        subject: input.identity.subject,
      } },
      create: {
        id: identityId,
        brokerId: client.brokerId,
        clientId: client.id,
        provider: input.identity.provider,
        issuer: input.identity.issuer,
        subject: input.identity.subject,
        assuranceContext: input.identity.assuranceContext ?? null,
        authenticationMethods: input.identity.authenticationMethods ?? [],
        gender: input.identity.gender ?? null,
        portraitReference: input.identity.portraitReference ?? null,
        verifiedAt: authenticatedAt,
        lastLoginAt: authenticatedAt,
      },
      update: {
        assuranceContext: input.identity.assuranceContext ?? null,
        authenticationMethods: input.identity.authenticationMethods ?? [],
        ...(input.identity.gender !== undefined ? { gender: input.identity.gender } : {}),
        ...(input.identity.portraitReference !== undefined ? { portraitReference: input.identity.portraitReference } : {}),
        lastLoginAt: authenticatedAt,
      },
    });
    await tx.auditLog.create({ data: {
      id: crypto.randomUUID(),
      brokerId: client.brokerId,
      actorId: null,
      action: "INVESTOR_SIGNED_IN",
      entityType: "client",
      entityId: client.id,
      summary: `${client.fullName} signed in through ${input.identity.provider}`,
      newValue: JSON.stringify({
        provider: input.identity.provider,
        issuer: input.identity.issuer,
        assuranceContext: input.identity.assuranceContext ?? null,
        authenticationMethods: input.identity.authenticationMethods ?? [],
        genderRecorded: input.identity.gender !== undefined,
        portraitRecorded: Boolean(input.identity.portraitReference),
      }),
    } });
    return { clientId: client.id, brokerId: client.brokerId, fullName: client.fullName, principal };
  });

  return {
    ...result,
    token: createSessionToken({
      kind: "investor",
      subjectId: result.principal,
      brokerId: result.brokerId,
      clientId: result.clientId,
    }),
  };
}

export async function verifyInvestorLogin(input: { challengeId: string; code: string }) {
  if (investorAuthMode() !== "otp") throw new Response("Investor OTP authentication is not enabled.", { status: 409 });
  const challenge = await prisma.verificationChallenge.findFirst({
    where: { id: input.challengeId, purpose: "investor_login" },
    include: { client: { select: { id: true, email: true, phone: true } } },
  });
  if (!challenge) throw new Response("The sign-in verification was not found.", { status: 404 });
  const channel = challenge.method === "email_otp" ? "email" : "sms";
  const destination = channel === "email" ? challenge.client.email : challenge.client.phone;
  if (!destination || challenge.payloadHash !== investorLoginPayloadHash(challenge.clientId, destination)) {
    throw new Response("The registered contact changed. Request a new sign-in code.", { status: 409 });
  }
  await confirmOtpChallenge({ id: challenge.id, brokerId: challenge.brokerId, clientId: challenge.clientId, code: input.code });
  return establishInvestorSession({
    clientId: challenge.clientId,
    consumeChallengeId: challenge.id,
    identity: {
      ...INVESTOR_AUTH_PROVIDERS.otp,
      subject: challenge.clientId,
      assuranceContext: "urn:frank-money:acr:otp",
      authenticationMethods: [channel as OtpDeliveryChannel, "otp"],
    },
  });
}

export function investorAuthPresentation() {
  const mode = investorAuthMode();
  return { mode, demo: isInsecureDemoMode() };
}
