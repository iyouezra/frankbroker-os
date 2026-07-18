import { apiError } from "../../../../lib/api";
import { evaluateClientReadiness } from "../../../../lib/client-readiness";
import { toNum } from "../../../../lib/money";
import { availableActions } from "../../../../lib/oms/status";
import { prisma } from "../../../../lib/prisma";
import { requirePermission } from "../../../../lib/server-auth";

export const runtime = "nodejs";

const terminalOrderStatuses = ["validation_failed", "rejected", "cancelled", "settled", "failed"];

function latestDate(values: Array<Date | null | undefined>) {
  const timestamps = values.flatMap((value) => value ? [value.getTime()] : []);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requirePermission(request, "report");
    const { id } = await context.params;
    const client = await prisma.client.findFirst({
      where: { id, brokerId: actor.brokerId },
      include: {
        creator: true,
        approver: true,
        broker: {
          include: {
            settings: true,
            legalDocuments: {
              where: { documentType: "brokerage_terms", status: "published" },
              orderBy: [{ effectiveAt: "desc" }, { publishedAt: "desc" }],
              take: 1,
            },
          },
        },
        consents: { include: { legalDocument: true }, orderBy: { acceptedAt: "desc" } },
        serviceRequests: { orderBy: { submittedAt: "desc" } },
        cashMovements: { include: { pooledBankAccount: true }, orderBy: { submittedAt: "desc" } },
        notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
        accounts: {
          orderBy: { createdAt: "asc" },
          include: {
            holdings: { include: { instrument: true }, orderBy: { instrument: { symbol: "asc" } } },
            cashLedgerEntries: { include: { createdByUser: true }, orderBy: { createdAt: "desc" } },
            securitiesLedgerEntries: { include: { instrument: true, createdByUser: true }, orderBy: { createdAt: "desc" } },
            orders: {
              include: {
                instrument: true,
                assignedTrader: true,
                trades: {
                  include: { settlement: true, capturedByUser: true },
                  orderBy: { capturedAt: "asc" },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
    if (!client) return Response.json({ error: "Client not found for this tenant." }, { status: 404 });

    const account = client.accounts[0] ?? null;
    const orders = account?.orders ?? [];
    const trades = orders.flatMap((order) => order.trades.map((trade) => ({ order, trade })));
    const currentLegal = client.broker.legalDocuments[0] ?? null;
    const acceptedConsent = currentLegal
      ? client.consents.find((consent) => consent.legalDocumentId === currentLegal.id && consent.accepted && !consent.withdrawnAt)
      : client.consents.find((consent) => consent.consentType === "brokerage_terms" && consent.accepted && !consent.withdrawnAt);
    const institutional = ["institution", "corporate"].includes(client.clientType);
    const availableCash = toNum(account?.availableCash);
    const sellableQuantity = (account?.holdings ?? []).reduce((total, holding) => total + toNum(holding.availableQuantity), 0);
    const readiness = evaluateClientReadiness({
      kycStatus: client.kycStatus,
      clientStatus: client.status,
      accountStatus: account?.status ?? null,
      proofOfAddressStatus: client.proofOfAddressStatus,
      institutional,
      businessRegistrationNumber: client.businessRegistrationNumber,
      authorizedRepresentativeName: client.authorizedRepresentativeName,
      signatoryAuthorityConfirmed: client.signatoryAuthorityConfirmed,
      currentLegalVersion: currentLegal?.version ?? null,
      acceptedLegalVersion: acceptedConsent?.version ?? null,
      csdReference: account?.csdReference ?? null,
      availableCash,
      availableHoldings: sellableQuantity,
      restrictionReason: account?.restrictionReason ?? null,
    });

    const entityIds = [
      client.id,
      ...(account ? [account.id] : []),
      ...orders.map((order) => order.id),
      ...trades.flatMap(({ trade }) => [trade.id, ...(trade.settlement ? [trade.settlement.id] : [])]),
      ...client.serviceRequests.map((item) => item.id),
      ...client.cashMovements.map((item) => item.id),
      ...client.notes.map((note) => note.id),
    ];
    const auditRows = await prisma.auditLog.findMany({
      where: { brokerId: actor.brokerId, entityId: { in: entityIds } },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 250,
    });
    const lastActivityAt = latestDate([
      client.updatedAt,
      account?.updatedAt,
      ...orders.map((order) => order.updatedAt),
      ...trades.map(({ trade }) => trade.capturedAt),
      ...(account?.cashLedgerEntries ?? []).map((entry) => entry.createdAt),
      ...(account?.securitiesLedgerEntries ?? []).map((entry) => entry.createdAt),
      ...client.notes.map((note) => note.createdAt),
      ...client.cashMovements.map((movement) => movement.updatedAt),
    ]);

    const transactions = [
      ...(account?.cashLedgerEntries ?? []).map((entry) => ({
        id: entry.id,
        ledger: "cash",
        createdAt: entry.createdAt.toISOString(),
        type: entry.entryType,
        instrument: null,
        debit: entry.totalImpact.lt(0) ? Math.abs(toNum(entry.totalImpact)) : 0,
        credit: entry.totalImpact.gt(0) ? toNum(entry.totalImpact) : 0,
        amount: toNum(entry.amount),
        quantity: null,
        availableImpact: toNum(entry.availableImpact),
        blockedImpact: toNum(entry.blockedImpact),
        unsettledImpact: toNum(entry.unsettledImpact),
        runningBalance: toNum(entry.runningBalance),
        reference: entry.cashMovementId ?? entry.tradeId ?? entry.orderId ?? entry.id,
        orderId: entry.orderId,
        tradeId: entry.tradeId,
        status: "posted",
        createdBy: entry.createdByUser?.fullName ?? "Investor portal",
        notes: entry.reason ?? entry.description,
      })),
      ...(account?.securitiesLedgerEntries ?? []).map((entry) => ({
        id: entry.id,
        ledger: "securities",
        createdAt: entry.createdAt.toISOString(),
        type: entry.entryType,
        instrument: entry.instrument.symbol,
        debit: 0,
        credit: 0,
        amount: null,
        quantity: toNum(entry.quantity),
        availableImpact: toNum(entry.availableImpact),
        blockedImpact: toNum(entry.blockedImpact),
        unsettledImpact: toNum(entry.unsettledImpact),
        runningBalance: toNum(entry.runningQuantity),
        reference: entry.tradeId ?? entry.orderId ?? entry.id,
        orderId: entry.orderId,
        tradeId: entry.tradeId,
        status: "posted",
        createdBy: entry.createdByUser.fullName,
        notes: entry.reason ?? entry.description,
      })),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Response.json({
      client: {
        id: client.id,
        code: client.clientCode,
        name: client.fullName,
        type: client.clientType,
        phone: client.phone,
        email: client.email,
        broker: client.broker.settings?.tradingName ?? client.broker.name,
        branch: null,
        openedAt: client.createdAt.toISOString(),
        lastActivityAt,
        kycStatus: client.kycStatus,
        clientStatus: client.status,
        accountStatus: account?.status ?? "missing",
        tradingStatus: readiness.baseReady ? "ready" : "not_ready",
        csdReference: account?.csdReference ?? null,
        riskRating: client.riskRating,
        createdBy: client.creator?.fullName ?? null,
        submittedAt: client.submittedAt?.toISOString() ?? null,
        approvedBy: client.approver?.fullName ?? null,
        approvedAt: client.approvedAt?.toISOString() ?? null,
        rejectionReason: client.rejectionReason,
      },
      readiness: { canTrade: readiness.canTrade, blockingReasons: readiness.blockingReasons, items: readiness.items },
      cash: account ? {
        total: toNum(account.totalCash),
        available: toNum(account.availableCash),
        blocked: toNum(account.blockedCash),
        unsettled: toNum(account.unsettledCash),
        pendingDeposits: client.cashMovements
          .filter((movement) => movement.movementType === "deposit" && movement.status === "pending_verification")
          .reduce((sum, movement) => sum + toNum(movement.amount), 0),
        pendingWithdrawals: client.cashMovements
          .filter((movement) => movement.movementType === "withdrawal" && ["pending_approval", "approved"].includes(movement.status))
          .reduce((sum, movement) => sum + toNum(movement.amount), 0),
        currency: account.currency,
      } : null,
      holdings: (account?.holdings ?? []).map((holding) => ({
        id: holding.id,
        instrumentId: holding.instrumentId,
        symbol: holding.instrument.symbol,
        name: holding.instrument.name,
        assetClass: holding.instrument.assetClass,
        total: toNum(holding.totalQuantity),
        available: toNum(holding.availableQuantity),
        blocked: toNum(holding.blockedQuantity),
        unsettled: toNum(holding.unsettledQuantity),
        averageCost: toNum(holding.averageCost),
        lastPrice: toNum(holding.instrument.lastPrice),
        marketValue: toNum(holding.totalQuantity.times(holding.instrument.lastPrice ?? 0)),
        updatedAt: holding.updatedAt.toISOString(),
      })),
      orders: orders.map((order) => ({
        id: order.id,
        createdAt: (order.submittedAt ?? order.createdAt).toISOString(),
        instrumentId: order.instrumentId,
        symbol: order.instrument.symbol,
        side: order.side,
        quantity: toNum(order.quantity),
        price: toNum(order.price),
        filledQuantity: toNum(order.filledQuantity),
        remainingQuantity: toNum(order.remainingQuantity),
        status: order.status,
        source: order.source,
        trader: order.assignedTrader?.fullName ?? "Unassigned",
        actionRequired: order.status === "pending_broker_review" ? "Broker review" : ["approved", "partially_filled"].includes(order.status) ? "Execution capture" : order.status === "settlement_pending" ? "Settlement follow-up" : null,
        availableActions: availableActions(order.status),
      })),
      trades: trades.map(({ order, trade }) => ({
        id: trade.id,
        orderId: order.id,
        tradeDate: trade.tradeDate.toISOString().slice(0, 10),
        settlementDate: trade.settlementDate.toISOString().slice(0, 10),
        instrumentId: order.instrumentId,
        symbol: order.instrument.symbol,
        side: order.side,
        quantity: toNum(trade.quantityFilled),
        executionPrice: toNum(trade.executionPrice),
        gross: toNum(trade.grossAmount),
        fees: toNum(trade.fees),
        net: toNum(trade.netAmount),
        settlementStatus: trade.settlement?.status ?? "missing",
        cashStatus: trade.settlement?.cashStatus ?? "missing",
        securitiesStatus: trade.settlement?.securitiesStatus ?? "missing",
        exceptionNotes: trade.settlement?.exceptionNotes,
        contractNoteNumber: order.contractNoteNumber,
        contractNoteGeneratedAt: order.contractNoteGeneratedAt?.toISOString() ?? null,
        capturedBy: trade.capturedByUser.fullName,
      })),
      transactions,
      settlements: trades.map(({ order, trade }) => ({
        id: trade.settlement?.id ?? `missing-${trade.id}`,
        tradeId: trade.id,
        orderId: order.id,
        symbol: order.instrument.symbol,
        tradeDate: trade.tradeDate.toISOString().slice(0, 10),
        settlementDate: trade.settlementDate.toISOString().slice(0, 10),
        cashStatus: trade.settlement?.cashStatus ?? "missing",
        securitiesStatus: trade.settlement?.securitiesStatus ?? "missing",
        status: trade.settlement?.status ?? "missing",
        exception: Boolean(trade.settlement?.exceptionNotes || trade.settlement?.cashStatus === "exception" || trade.settlement?.securitiesStatus === "exception"),
        notes: trade.settlement?.exceptionNotes,
      })),
      legal: {
        required: Boolean(currentLegal),
        accepted: readiness.consentReady,
        latestRequiredVersion: currentLegal?.version ?? null,
        latestAcceptedVersion: acceptedConsent?.version ?? null,
        lastAcceptedAt: acceptedConsent?.acceptedAt.toISOString() ?? null,
        missingDocuments: [
          client.proofOfAddressStatus !== "received" ? "Proof of address" : null,
          institutional && !client.businessRegistrationNumber ? "Business registration" : null,
          institutional && !client.signatoryAuthorityConfirmed ? "Signatory authority" : null,
          !readiness.consentReady ? currentLegal?.title ?? "Brokerage account terms" : null,
        ].filter((value): value is string => Boolean(value)),
      },
      restrictions: {
        restricted: !readiness.unrestricted,
        reason: account?.restrictionReason ?? null,
        restrictedAt: account?.restrictedAt?.toISOString() ?? null,
        flags: [
          client.kycStatus !== "approved" ? "Missing or incomplete KYC" : null,
          !readiness.consentReady ? "Missing current legal consent" : null,
          !readiness.documentsReady ? "Insufficient account-opening documents" : null,
          client.riskRating === "enhanced" || client.riskRating === "review" ? "Compliance review required" : null,
          orders.some((order) => order.riskFlag !== "none" && !terminalOrderStatuses.includes(order.status)) ? "Manual approval required" : null,
        ].filter((value): value is string => Boolean(value)),
      },
      documents: {
        kyc: [
          client.identityReference ? { id: client.identityReference, name: "Fayda identity reference", status: "recorded" } : null,
          client.proofOfAddressReference ? { id: client.proofOfAddressReference, name: client.proofOfAddressType ?? "Proof of address", status: client.proofOfAddressStatus } : null,
          client.businessRegistrationNumber ? { id: client.businessRegistrationNumber, name: "Business registration", status: "recorded" } : null,
        ].filter(Boolean),
        legal: client.consents.filter((consent) => consent.consentType === "brokerage_terms").map((consent) => ({
          id: consent.id,
          name: consent.legalDocument?.title ?? "Brokerage account terms",
          version: consent.version,
          acceptedAt: consent.acceptedAt.toISOString(),
          status: consent.withdrawnAt ? "withdrawn" : consent.accepted ? "accepted" : "declined",
        })),
        contractNotes: orders.filter((order) => order.trades.length).map((order) => ({
          orderId: order.id,
          number: order.contractNoteNumber,
          generatedAt: order.contractNoteGeneratedAt?.toISOString() ?? null,
          status: order.contractNoteNumber ? "available" : "not_generated",
        })),
        statements: [
          { type: "Account statement", status: "not_implemented" },
          { type: "Cash statement", status: "not_implemented" },
          { type: "Holdings statement", status: "not_implemented" },
        ],
      },
      requests: client.serviceRequests.map((item) => ({
        id: item.id,
        requestType: item.requestType,
        status: item.status,
        subject: item.subject,
        description: item.description,
        orderId: item.orderId,
        submittedAt: item.submittedAt.toISOString(),
        resolutionNotes: item.resolutionNotes,
      })),
      notes: client.notes.map((note) => ({
        id: note.id,
        text: note.noteText,
        category: note.category,
        visibility: note.visibility,
        createdBy: note.author.fullName,
        createdAt: note.createdAt.toISOString(),
      })),
      auditTrail: auditRows.map((entry) => ({
        id: entry.id,
        timestamp: entry.createdAt.toISOString(),
        user: entry.actor?.fullName ?? "System",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.previousValue,
        newValue: entry.newValue,
        reason: entry.reason ?? entry.summary,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
