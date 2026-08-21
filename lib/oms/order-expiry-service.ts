import type { Actor } from "../server-auth";
import { prisma } from "../prisma";
import { orderValidityExpired } from "../order-input";
import { expireOrder } from "./order-service";

export async function runOrderExpirySweep(input: { brokerId?: string; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const candidates = await prisma.order.findMany({
    where: { ...(input.brokerId ? { brokerId: input.brokerId } : {}), status: { in: ["pending_broker_review", "approved", "partially_filled"] }, validity: { in: ["day", "gtd"] } },
    select: { id: true, brokerId: true, validity: true, goodTillDate: true, submittedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const due = candidates.filter((order) => orderValidityExpired({ ...order, now }));
  const actors = new Map<string, Actor>();
  let expired = 0;
  const errors: Array<{ orderId: string; error: string }> = [];
  for (const order of due) {
    try {
      let actor = actors.get(order.brokerId);
      if (!actor) {
        const user = await prisma.user.findFirst({ where: { brokerId: order.brokerId, status: "active" }, orderBy: { createdAt: "asc" } });
        if (!user) throw new Error("No active broker user is available to record reservation releases.");
        actor = { id: user.id, brokerId: order.brokerId, email: user.email, fullName: user.fullName, role: user.role as Actor["role"] };
        actors.set(order.brokerId, actor);
      }
      if ((await expireOrder(actor, order.id, now)).expired) expired += 1;
    } catch (error) {
      errors.push({ orderId: order.id, error: error instanceof Error ? error.message : "Expiry failed" });
    }
  }
  return { scanned: candidates.length, due: due.length, expired, errors };
}
