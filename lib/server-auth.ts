import type { Role } from "./frank";
import { hasPermission } from "./frank";

export type Actor = {
  id: string;
  email: string;
  role: Role;
  brokerId: string;
};

export function resolveActor(request: Request): Actor {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");
  const email = authenticatedEmail ?? "demo.admin@frankbroker.et";
  const roleByEmail: Record<string, Role> = {
    "demo.admin@frankbroker.et": "broker_admin",
    "dawit@frankbroker.et": "trader",
    "liya@frankbroker.et": "compliance",
    "rahel@frankbroker.et": "settlement",
  };
  const requestedRole = request.headers.get("x-frank-demo-role") as Role | null;
  const demoRoles: Role[] = ["broker_admin", "trader", "operations", "compliance", "settlement", "management", "super_admin"];
  const role: Role = authenticatedEmail
    ? roleByEmail[email] ?? "broker_admin"
    : requestedRole && demoRoles.includes(requestedRole) ? requestedRole : "broker_admin";

  return {
    id: "usr_demo_admin",
    email,
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
