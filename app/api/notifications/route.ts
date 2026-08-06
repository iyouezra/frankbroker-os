import { prisma } from "../../../lib/prisma";
import { resolveAuthContext } from "../../../lib/server-auth";
import { roleMatches } from "../../../lib/oms/notification-service";
import { apiError } from "../../../lib/api";

export const runtime = "nodejs";

type NotificationRow = {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  roles: string | null;
  createdAt: Date;
  readAt: Date | null;
};

// Resolve which notifications belong to the caller's portal + identity.
async function resolveScope(request: Request) {
  const auth = await resolveAuthContext(request);
  if (auth.kind === "investor") {
    const context = auth.investor;
    return { kind: "investor" as const, where: { scope: "investor", brokerId: context.brokerId, clientId: context.clientId } };
  }
  const actor = auth.actor;
  if (actor.role === "super_admin") {
    return { kind: "platform" as const, where: { scope: "platform" } };
  }
  return { kind: "broker" as const, role: actor.role, where: { scope: "broker", brokerId: actor.brokerId } };
}

function serialize(rows: NotificationRow[]) {
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  }));
}

export async function GET(request: Request) {
  try {
    const scope = await resolveScope(request);
    const rows = await prisma.notification.findMany({
      where: scope.where,
      orderBy: { createdAt: "desc" },
      take: scope.kind === "broker" ? 80 : 40,
    });
    const visible = scope.kind === "broker"
      ? rows.filter((row) => roleMatches(scope.role, row.roles)).slice(0, 40)
      : rows;
    return Response.json({ notifications: serialize(visible), unread: visible.filter((row) => row.readAt === null).length });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { id?: string; all?: boolean };
    const scope = await resolveScope(request);
    const now = new Date();

    if (scope.kind === "broker") {
      // Roles live in a comma string, so filter role visibility in memory before updating.
      const unread = await prisma.notification.findMany({ where: { ...scope.where, readAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
      const ids = unread
        .filter((row) => roleMatches(scope.role, row.roles))
        .filter((row) => (payload.all ? true : row.id === payload.id))
        .map((row) => row.id);
      if (ids.length) await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { readAt: now } });
      return Response.json({ ok: true, updated: ids.length });
    }

    const where = payload.all ? { ...scope.where, readAt: null } : { ...scope.where, id: payload.id, readAt: null };
    const result = await prisma.notification.updateMany({ where, data: { readAt: now } });
    return Response.json({ ok: true, updated: result.count });
  } catch (error) {
    return apiError(error);
  }
}
