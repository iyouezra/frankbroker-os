import type { Role } from "./frank";
import { hasPermission } from "./frank";

export type Actor = {
  id: string;
  email: string;
  role: Role;
  brokerId: string;
};

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

export function resolveBrokerId(request: Request) {
  const requested = request.headers.get("x-frank-tenant-id")?.trim();
  if (!requested) return "brk_abyssinia";
  return tenantAliases[requested] ?? requested;
}

// This role header supports the MVP role selector. Replace it with a verified
// server-side session before allowing real users or live brokerage data.
export function resolveActor(request: Request): Actor {
  const requestedRole = request.headers.get("x-frank-demo-role") as Role | null;
  if (requestedRole && !(requestedRole in defaultDemoActors)) {
    throw new Response("The requested demo role is not authorized.", { status: 403 });
  }
  const role: Role = requestedRole && requestedRole in defaultDemoActors ? requestedRole : "broker_admin";
  const brokerId = resolveBrokerId(request);
  const demoActor = tenantDemoActors[brokerId]?.[role] ?? defaultDemoActors[role];

  return {
    ...demoActor,
    role,
    brokerId,
  };
}

export function requirePermission(request: Request, permission: string) {
  const actor = resolveActor(request);
  if (!hasPermission(actor.role, permission)) {
    throw new Response("This role is not permitted to perform that action.", { status: 403 });
  }
  return actor;
}

export function requirePlatformAdmin(request: Request) {
  const actor = resolveActor(request);
  if (actor.role !== "super_admin") {
    throw new Response("Platform administrator access is required.", { status: 403 });
  }
  return actor;
}

export function resolveInvestorContext(request: Request) {
  return {
    brokerId: resolveBrokerId(request),
    clientId: request.headers.get("x-frank-client-id")?.trim() || "cli_investor_demo",
  };
}
