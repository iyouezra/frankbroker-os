import { apiError } from "../../../../../../../lib/api";
import { maskBankAccount } from "../../../../../../../lib/onboarding-evidence";
import { prisma } from "../../../../../../../lib/prisma";
import { requirePermission } from "../../../../../../../lib/server-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string; bankId: string }> }) {
  try {
    const payload = await request.json() as { action?: string; reason?: string };
    const action = payload.action === "approve" ? "approve" : payload.action === "reject" ? "reject" : null;
    if (!action) return Response.json({ error: "Choose approve or reject." }, { status: 400 });
    const actor = await requirePermission(request, action);
    const { id, bankId } = await context.params;
    const reason = String(payload.reason ?? "").trim();
    if (action === "reject" && reason.length < 5) {
      return Response.json({ error: "Enter a clear reason for not approving the bank account." }, { status: 400 });
    }
    const bank = await prisma.linkedBankAccount.findFirst({
      where: { id: bankId, clientId: id, brokerId: actor.brokerId },
      include: { client: true },
    });
    if (!bank) return Response.json({ error: "Linked bank account not found for this client." }, { status: 404 });
    const status = action === "approve" ? "approved" : "rejected";
    await prisma.$transaction(async (tx) => {
      await tx.linkedBankAccount.update({
        where: { id: bank.id },
        data: { status, reviewedBy: actor.id, reviewedAt: new Date(), rejectionReason: action === "reject" ? reason : null },
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId: actor.brokerId,
          actorId: actor.id,
          action: action === "approve" ? "LINKED_BANK_APPROVED" : "LINKED_BANK_REJECTED",
          entityType: "linked_bank_account",
          entityId: bank.id,
          summary: `${bank.bankName} ${maskBankAccount(bank.accountNumber)} ${status} for ${bank.client.fullName}`,
          reason: action === "reject" ? reason : null,
          newValue: JSON.stringify({ clientId: id, bankName: bank.bankName, accountMasked: maskBankAccount(bank.accountNumber), status }),
        },
      });
    });
    return Response.json({ ok: true, status });
  } catch (error) {
    return apiError(error);
  }
}
