import type { Role } from "./frank";
import { hasPermission } from "./frank";

export type Actor = {
  id: string;
  email: string;
  role: Role;
  brokerId: string;
};

const demoActors: Record<Role, Omit<Actor, "role" | "brokerId">> = {
  broker_admin: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
  trader: { id: "usr_trader", email: "dawit@frankbroker.et" },
  operations: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
  compliance: { id: "usr_compliance", email: "liya@frankbroker.et" },
  settlement: { id: "usr_settlement", email: "rahel@frankbroker.et" },
  management: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
  super_admin: { id: "usr_demo_admin", email: "demo.admin@frankbroker.et" },
};

// This role header supports the MVP role selector. Replace it with a verified
// server-side session before allowing real users or live brokerage data.
export function resolveActor(request: Request): Actor {
  const requestedRole = request.headers.get("x-frank-demo-role") as Role | null;
  const role: Role = requestedRole && requestedRole in demoActors ? requestedRole : "broker_admin";

  return {
    ...demoActors[role],
    role,
    brokerId: "brk_abyssinia",
  };
}

export function requirePermission(request: Request, permission: string) {
  const actor = resolveActor(request);
  if (!hasPermission(actor.role, permission)) {
    throw new Response("This role is not permitted to perform that action.", { status: 403 });
  }
  return actor;
}
