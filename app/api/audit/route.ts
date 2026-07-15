import { prisma } from "../../../lib/prisma";
import { apiError } from "../../../lib/api";
import { resolveActor } from "../../../lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = resolveActor(request);
    const rows = await prisma.auditLog.findMany({
      where: { brokerId: actor.brokerId },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({
      events: rows.map((row) => ({
        id: row.id,
        time: row.createdAt.toISOString(),
        actor: row.actor?.fullName ?? "System",
        action: row.action,
        detail: row.summary,
        entity: row.entityType,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
