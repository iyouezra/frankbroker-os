import { apiError } from "../../../lib/api";
import { serializeCashMovement, submitBrokerCashMovement, type CashMovementInput } from "../../../lib/cash-service";
import { toNum } from "../../../lib/money";
import { prisma } from "../../../lib/prisma";
import { requireTenantModule } from "../../../lib/tenant-capabilities";
import { assertBusinessDayOpen } from "../../../lib/reconciliation-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "report");
    const [pools, movements, linkedBanks] = await Promise.all([
      prisma.pooledBankAccount.findMany({
        where: { brokerId: actor.brokerId },
        include: { positions: { select: { balance: true } } },
        orderBy: [{ status: "asc" }, { purpose: "asc" }],
      }),
      prisma.cashMovement.findMany({
        where: { brokerId: actor.brokerId },
        include: { client: true, account: true, pooledBankAccount: true, proof: { select: { originalName: true, mimeType: true, sizeBytes: true, uploadedAt: true } } },
        orderBy: { submittedAt: "desc" },
        take: 250,
      }),
      prisma.linkedBankAccount.findMany({
        where: { brokerId: actor.brokerId, status: "approved" },
        select: { id: true, clientId: true, bankName: true, accountHolderName: true, accountNumber: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const serializedPools = pools.map((pool) => {
      const beneficialTotal = pool.positions.reduce((sum, position) => sum + toNum(position.balance), 0);
      const bookBalance = toNum(pool.bookBalance);
      const statementBalance = toNum(pool.statementBalance);
      return {
        id: pool.id,
        bankName: pool.bankName,
        accountName: pool.accountName,
        accountNumberMasked: pool.accountNumberMasked,
        currency: pool.currency,
        purpose: pool.purpose,
        status: pool.status,
        bookBalance,
        statementBalance,
        beneficialTotal,
        ownershipVariance: bookBalance - beneficialTotal,
        bankVariance: statementBalance - bookBalance,
        lastReconciledAt: pool.lastReconciledAt?.toISOString() ?? null,
      };
    });
    const pending = movements.filter((movement) => !["completed", "rejected", "failed", "cancelled"].includes(movement.status));
    return Response.json({
      summary: {
        bankBookTotal: serializedPools.reduce((sum, pool) => sum + pool.bookBalance, 0),
        statementTotal: serializedPools.reduce((sum, pool) => sum + pool.statementBalance, 0),
        beneficialTotal: serializedPools.reduce((sum, pool) => sum + pool.beneficialTotal, 0),
        pendingDeposits: pending.filter((movement) => movement.movementType === "deposit").length,
        pendingWithdrawals: pending.filter((movement) => movement.movementType === "withdrawal").length,
      },
      pools: serializedPools,
      movements: movements.map(serializeCashMovement),
      linkedBanks: linkedBanks.map((bank) => ({ id: bank.id, clientId: bank.clientId, bankName: bank.bankName, accountHolderName: bank.accountHolderName, accountNumberMasked: `•••••• ${bank.accountNumber.slice(-6)}` })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requireTenantModule(request, "dealer_operations", "adjust");
    await assertBusinessDayOpen(prisma, actor.brokerId);
    const payload = await request.json() as CashMovementInput;
    if (!payload || !["deposit", "withdrawal"].includes(payload.movementType)) {
      return Response.json({ error: "Movement type must be deposit or withdrawal." }, { status: 400 });
    }
    const movement = await submitBrokerCashMovement(actor, payload);
    return Response.json({ movement: serializeCashMovement(movement) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
