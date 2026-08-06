import { apiError } from "../../../../lib/api";
import {
  maskBankAccount,
  normalizeBankAccountNumber,
  serializeLinkedBank,
} from "../../../../lib/onboarding-evidence";
import { prisma } from "../../../../lib/prisma";
import { resolveInvestorContext } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    const payload = await request.json() as { bankName?: string; accountNumber?: string; accountHolderName?: string };
    const client = await prisma.client.findFirst({ where: { id: clientId, brokerId }, include: { linkedBankAccounts: true } });
    if (!client) return Response.json({ error: "Investor profile not found." }, { status: 404 });
    if (client.linkedBankAccounts.length >= 3) return Response.json({ error: "You can link up to 3 bank accounts." }, { status: 409 });
    const bankName = String(payload.bankName ?? "").trim().slice(0, 120);
    const accountNumber = normalizeBankAccountNumber(String(payload.accountNumber ?? "")).slice(0, 64);
    const accountHolderName = String(payload.accountHolderName ?? "").trim().slice(0, 160);
    if (bankName.length < 2 || !/^\d{8,64}$/.test(accountNumber)) {
      return Response.json({ error: "Enter a bank name and valid account number." }, { status: 400 });
    }
    if (accountHolderName.toLocaleLowerCase() !== client.fullName.trim().toLocaleLowerCase()) {
      return Response.json({ error: "Account holder name must match verified records." }, { status: 400 });
    }
    if (client.linkedBankAccounts.some((bank) => bank.bankName.toLocaleLowerCase() === bankName.toLocaleLowerCase() && bank.accountNumber === accountNumber)) {
      return Response.json({ error: "This bank account is already linked." }, { status: 409 });
    }
    const bank = await prisma.$transaction(async (tx) => {
      const created = await tx.linkedBankAccount.create({
        data: {
          id: `BANK-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
          brokerId,
          clientId,
          bankName,
          accountNumber,
          accountHolderName,
          source: "investor_portal",
        },
      });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId,
          actorId: null,
          action: "LINKED_BANK_SUBMITTED",
          entityType: "linked_bank_account",
          entityId: created.id,
          summary: `${bankName} ${maskBankAccount(accountNumber)} submitted by ${client.fullName}`,
          newValue: JSON.stringify({ bankName, accountMasked: maskBankAccount(accountNumber), status: "pending_review" }),
        },
      });
      return created;
    });
    return Response.json({ bank: serializeLinkedBank(bank) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { brokerId, clientId } = await resolveInvestorContext(request);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "Choose a linked bank account to remove." }, { status: 400 });
    const bank = await prisma.linkedBankAccount.findFirst({ where: { id, clientId, brokerId } });
    if (!bank) return Response.json({ error: "Linked bank account not found." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.linkedBankAccount.delete({ where: { id: bank.id } });
      await tx.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          brokerId,
          actorId: null,
          action: "LINKED_BANK_REMOVED",
          entityType: "client",
          entityId: clientId,
          summary: `${bank.bankName} ${maskBankAccount(bank.accountNumber)} removed by investor`,
        },
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
