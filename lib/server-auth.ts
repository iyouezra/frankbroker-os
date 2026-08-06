import { createHmac, timingSafeEqual } from "node:crypto";

import type { Role } from "./frank";
import { hasPermission, workflowPermissions } from "./frank";
import { prisma } from "./prisma";
import { isInsecureDemoMode } from "./deployment-mode";

export type Actor = {
  id: string;
  email: string;
  role: Role;
  brokerId: string;
};

export type InvestorContext = {
  brokerId: string;
  clientId: string;
};

type BaseSession = {
  v: 1;
  iss: "frankbroker";
  sub: string;
  brokerId: string;
  iat: number;
  exp: number;
};

export type BrokerSession = BaseSession & { kind: "broker" };
export type InvestorSession = BaseSession & { kind: "investor"; clientId: string };
export type FrankSession = BrokerSession | InvestorSession;

const SESSION_COOKIE = "__Host-frank_session";
const DEFAULT_SESSION_SECONDS = 15 * 60;
const MAX_SESSION_SECONDS = 60 * 60;

const defaultDemoActors: Record<Role, Omit<Actor, "role" | "brokerId">> = {
  access_admin: { id: "usr_access_admin", email: "access.admin@frankbroker.et" },
  broker_admin: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
  trader: { id: "usr_trader", email: "dawit@frankbroker.et" },
  operations: { id: "usr_operations", email: "hana@frankbroker.et" },
  compliance: { id: "usr_compliance", email: "liya@frankbroker.et" },
  settlement: { id: "usr_settlement", email: "rahel@frankbroker.et" },
  relationship_officer: { id: "usr_relationship", email: "kalkidan@frankbroker.et" },
  service_officer: { id: "usr_service", email: "bethel@frankbroker.et" },
  management: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
  advisory_lead: { id: "usr_advisory_lead", email: "lead@addiscapital.example" },
  advisory_analyst: { id: "usr_advisory_analyst", email: "analyst@addiscapital.example" },
  super_admin: { id: "usr_platform_admin", email: "platform.admin@frankmoney.et" },
};

const tenantDemoActors: Record<string, Partial<Record<Role, Omit<Actor, "role" | "brokerId">>>> = {
  brk_blue_nile: {
    broker_admin: { id: "usr_blue_tenant_admin", email: "tenant.admin@addiscapital.example" },
    management: { id: "usr_blue_tenant_admin", email: "tenant.admin@addiscapital.example" },
    advisory_lead: { id: "usr_advisory_lead", email: "lead@addiscapital.example" },
    advisory_analyst: { id: "usr_advisory_analyst", email: "analyst@addiscapital.example" },
  },
  brk_sheba: {
    broker_admin: { id: "usr_sheba_tenant_admin", email: "tenant.admin@sheba.example" },
    compliance: { id: "usr_sheba_tenant_admin", email: "tenant.admin@sheba.example" },
    management: { id: "usr_sheba_tenant_admin", email: "tenant.admin@sheba.example" },
    advisory_lead: { id: "usr_sheba_advisory_lead", email: "lead@sheba.example" },
    advisory_analyst: { id: "usr_sheba_advisory_analyst", email: "analyst@sheba.example" },
  },
};

const tenantAliases: Record<string, string> = {
  abyssinia: "brk_abyssinia",
  "blue-nile": "brk_blue_nile",
  sheba: "brk_sheba",
};

function unauthorized(message = "Authentication is required."): never {
  throw new Response(message, { status: 401, headers: { "cache-control": "no-store" } });
}

function demoAuthEnabled() {
  return isInsecureDemoMode();
}

function demoBrokerId(request: Request) {
  const requested = request.headers.get("x-frank-tenant-id")?.trim();
  if (!requested) return "brk_abyssinia";
  return tenantAliases[requested] ?? requested;
}

function demoActor(request: Request): Actor {
  const requestedRole = request.headers.get("x-frank-demo-role") as Role | null;
  if (requestedRole && !(requestedRole in workflowPermissions)) {
    throw new Response("The requested demo role is not authorized.", { status: 403 });
  }
  const role: Role = requestedRole && requestedRole in workflowPermissions ? requestedRole : "broker_admin";
  const brokerId = demoBrokerId(request);
  const selected = tenantDemoActors[brokerId]?.[role] ?? defaultDemoActors[role];
  return { ...selected, role, brokerId };
}

function sessionSecret() {
  const secret = process.env.FRANK_SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Response("Server authentication is not configured.", { status: 503 });
  }
  return secret;
}

function decodeBase64Json(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    unauthorized("The session is invalid.");
  }
}

function isSession(value: unknown): value is FrankSession {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.v === 1
    && row.iss === "frankbroker"
    && (row.kind === "broker" || row.kind === "investor")
    && typeof row.sub === "string"
    && row.sub.length > 0
    && typeof row.brokerId === "string"
    && row.brokerId.length > 0
    && Number.isInteger(row.iat)
    && Number.isInteger(row.exp)
    && (row.kind !== "investor" || (typeof row.clientId === "string" && row.clientId.length > 0));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        unauthorized("The session cookie is invalid.");
      }
    }
  }
  return null;
}

function tokenFrom(request: Request): { token: string; source: "bearer" | "cookie" } | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const cookie = cookieValue(request, SESSION_COOKIE);
  if (bearer && cookie && bearer !== cookie) unauthorized("Conflicting authentication credentials were supplied.");
  if (bearer) return { token: bearer, source: "bearer" };
  if (cookie) return { token: cookie, source: "cookie" };
  return null;
}

function trustedOrigins(request: Request) {
  const configured = (process.env.FRANK_TRUSTED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return new Set([new URL(request.url).origin, ...configured]);
}

function enforceCookieCsrf(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (!origin || !trustedOrigins(request).has(origin)) {
    throw new Response("Cross-site request rejected.", { status: 403 });
  }
}

function verifyToken(token: string): FrankSession {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) unauthorized("The session is invalid.");
  const expected = createHmac("sha256", sessionSecret()).update(parts[0]).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[1], "base64url");
  } catch {
    unauthorized("The session is invalid.");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) unauthorized("The session is invalid.");
  const claims = decodeBase64Json(parts[0]);
  if (!isSession(claims)) unauthorized("The session is invalid.");
  const now = Math.floor(Date.now() / 1000);
  if (claims.iat > now + 30 || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > MAX_SESSION_SECONDS) {
    unauthorized("The session has expired or is invalid.");
  }
  return claims;
}

function verifiedSession(request: Request): FrankSession | null {
  const credential = tokenFrom(request);
  if (!credential) return null;
  if (credential.source === "cookie") enforceCookieCsrf(request);
  return verifyToken(credential.token);
}

/**
 * Create a short-lived server session after an external identity provider has
 * authenticated the subject. This function is server-only and never accepts a
 * role: broker roles are loaded from PostgreSQL for every request.
 */
export function createSessionToken(input: { kind: "broker"; userId: string; brokerId: string; expiresInSeconds?: number } | { kind: "investor"; subjectId: string; brokerId: string; clientId: string; expiresInSeconds?: number }) {
  const now = Math.floor(Date.now() / 1000);
  const requested = Math.floor(input.expiresInSeconds ?? DEFAULT_SESSION_SECONDS);
  const expiresIn = Math.max(60, Math.min(MAX_SESSION_SECONDS, requested));
  const claims: FrankSession = input.kind === "broker"
    ? { v: 1, iss: "frankbroker", kind: "broker", sub: input.userId, brokerId: input.brokerId, iat: now, exp: now + expiresIn }
    : { v: 1, iss: "frankbroker", kind: "investor", sub: input.subjectId, brokerId: input.brokerId, clientId: input.clientId, iat: now, exp: now + expiresIn };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function resolveActor(request: Request): Promise<Actor> {
  const session = verifiedSession(request);
  if (!session) {
    if (demoAuthEnabled()) return demoActor(request);
    unauthorized();
  }
  if (session.kind !== "broker") unauthorized("A broker user session is required.");
  const user = await prisma.user.findFirst({
    where: { id: session.sub, status: "active" },
    select: { id: true, email: true, role: true, brokerId: true },
  });
  if (!user || !(user.role in workflowPermissions)) unauthorized("The user account is unavailable.");
  const role = user.role as Role;
  if (role === "super_admin") {
    if (user.brokerId !== null) unauthorized("The platform administrator account is invalid.");
    return { id: user.id, email: user.email, role, brokerId: "platform" };
  }
  if (!user.brokerId || user.brokerId !== session.brokerId) unauthorized("The user is not a member of this tenant.");
  return { id: user.id, email: user.email, role, brokerId: user.brokerId };
}

export async function requirePermission(request: Request, permission: string) {
  const actor = await resolveActor(request);
  if (!hasPermission(actor.role, permission)) {
    throw new Response("This role is not permitted to perform that action.", { status: 403 });
  }
  return actor;
}

export async function requirePlatformAdmin(request: Request) {
  const actor = await resolveActor(request);
  if (actor.role !== "super_admin") {
    throw new Response("Platform administrator access is required.", { status: 403 });
  }
  return actor;
}

export async function resolveInvestorContext(request: Request): Promise<InvestorContext> {
  const session = verifiedSession(request);
  if (!session) {
    if (demoAuthEnabled()) {
      return {
        brokerId: demoBrokerId(request),
        clientId: request.headers.get("x-frank-client-id")?.trim() || "cli_investor_demo",
      };
    }
    unauthorized();
  }
  if (session.kind !== "investor") unauthorized("An investor session is required.");
  const client = await prisma.client.findFirst({
    where: {
      id: session.clientId,
      brokerId: session.brokerId,
      portalAuthSubject: session.sub,
      status: { not: "closed" },
      broker: { status: { not: "suspended" } },
    },
    select: { id: true, brokerId: true },
  });
  if (!client) unauthorized("The investor account is unavailable.");
  return { brokerId: client.brokerId, clientId: client.id };
}

export async function resolveBrokerId(request: Request) {
  const session = verifiedSession(request);
  if (!session) {
    if (demoAuthEnabled()) return demoBrokerId(request);
    unauthorized();
  }
  return session.kind === "broker" ? (await resolveActor(request)).brokerId : (await resolveInvestorContext(request)).brokerId;
}

export async function resolveAuthContext(request: Request) {
  const session = verifiedSession(request);
  if (session?.kind === "investor") return { kind: "investor" as const, investor: await resolveInvestorContext(request) };
  if (session?.kind === "broker") return { kind: "broker" as const, actor: await resolveActor(request) };
  if (demoAuthEnabled() && request.headers.has("x-frank-client-id")) {
    return { kind: "investor" as const, investor: await resolveInvestorContext(request) };
  }
  return { kind: "broker" as const, actor: await resolveActor(request) };
}
