import { Prisma } from "../../app/generated/prisma/client";
import type { Actor } from "../server-auth";
import { prisma } from "../prisma";
import { D, toNum, ZERO } from "../money";
import { normalizeOrderType } from "../order-input";
import { writeAudit, writeOrderEvent } from "./audit-service";
import { writeNotification, APPROVERS, TRADERS } from "./notification-service";
import {
  blockBuyCash,
  blockSellSecurities,
  releaseBuyCash,
  releaseSellSecurities,
  type CashSnapshot,
  type SecuritySnapshot,
} from "./ledger-service";
import { lockAccount, lockHolding, lockOrder, persistCashMutation, persistSecuritiesMutation } from "./persistence";
import { assertTransition, isTerminalStatus } from "./status";
import { validatePreTrade, validationPassed, type ValidationCheck } from "./validation-service";
import { computeConfiguredAmounts, resolveFeePolicy, serializeFeeBreakdown } from "./fee-service";
import { consumeOrderVerification, ORDER_SOURCES, orderPayloadHash } from "../verification-service";
import { assertNoEmployeeSelfProcessing, createMonitoringAlert, evaluateEmployeeOrder } from "../monitoring-service";
import { addisDateOnly, addisYear } from "../addis-date";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

function dateOnly(value = new Date()) {
  return addisDateOnly(value);
}

function cashSnapshot(account: { totalCash: Prisma.Decimal; availableCash: Prisma.Decimal; blockedCash: Prisma.Decimal; unsettledCash: Prisma.Decimal }): CashSnapshot {
  return { total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash };
}

function securitySnapshot(holding: { totalQuantity: Prisma.Decimal; availableQuantity: Prisma.Decimal; blockedQuantity: Prisma.Decimal; unsettledQuantity: Prisma.Decimal }): SecuritySnapshot {
  return { total: holding.totalQuantity, available: holding.availableQuantity, blocked: holding.blockedQuantity, unsettled: holding.unsettledQuantity };
}

function investorBuyingPowerError(requiredCash: Prisma.Decimal, availableCash: Prisma.Decimal) {
  return Response.json({
    error: `This order requires ${requiredCash.toFixed(2)} ETB including estimated fees, but only ${availableCash.toFixed(2)} ETB is available.`,
  }, { status: 409 });
}

export type CreateOrderInput = {
  accountId: string;
  instrumentId: string;
  side: "buy" | "sell";
  quantity: number | string | Prisma.Decimal;
  price: number | string | Prisma.Decimal;
  triggerPrice?: number | string | Prisma.Decimal | null;
  orderType?: string;
  validity?: string;
  notes?: string;
  source?: string;
  submissionReference?: string;
  termsVersion?: string;
  disclosureVersion?: string;
  disclosureAcceptedAt?: Date;
  verificationId?: string;
};

type SubmissionActor = Omit<Actor, "id"> & { id: string | null };

export async function createSubmittedOrder(actor: SubmissionActor, input: CreateOrderInput) {
  const [account, instrument, entitlement, settings, fallbackLedgerActor, existingOrder] = await Promise.all([
    prisma.account.findUnique({
      where: { id: input.accountId },
      include: { client: { include: { screenings: { orderBy: { screenedAt: "desc" }, take: 1 } } }, holdings: { where: { instrumentId: input.instrumentId } } },
    }),
    prisma.instrument.findUnique({ where: { id: input.instrumentId } }),
    prisma.brokerInstrument.findUnique({
      where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId: input.instrumentId } },
    }),
    prisma.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
    actor.id
      ? Promise.resolve(null)
      : prisma.user.findFirst({ where: { brokerId: actor.brokerId, status: "active" }, orderBy: { createdAt: "asc" } }),
    input.submissionReference
      ? prisma.order.findUnique({
        where: { brokerId_submissionReference: { brokerId: actor.brokerId, submissionReference: input.submissionReference } },
        include: { account: { include: { client: true } }, instrument: true, validations: true },
      })
      : Promise.resolve(null),
  ]);
  if (existingOrder) {
    return {
      order: {
        id: existingOrder.id,
        createdAt: (existingOrder.submittedAt ?? existingOrder.createdAt).toISOString(),
        client: existingOrder.account.client.fullName,
        clientCode: existingOrder.account.client.clientCode,
        accountId: existingOrder.accountId,
        instrumentId: existingOrder.instrumentId,
        symbol: existingOrder.instrument.symbol,
        side: existingOrder.side,
        quantity: toNum(existingOrder.quantity),
        price: toNum(existingOrder.price),
        triggerPrice: existingOrder.triggerPrice ? toNum(existingOrder.triggerPrice) : null,
        orderType: existingOrder.orderType,
        estimatedGross: toNum(existingOrder.estimatedGross),
        estimatedFees: toNum(existingOrder.estimatedFees),
        estimatedNet: toNum(existingOrder.estimatedNet),
        filledQuantity: toNum(existingOrder.filledQuantity),
        remainingQuantity: toNum(existingOrder.remainingQuantity),
        averageFillPrice: existingOrder.averageFillPrice ? toNum(existingOrder.averageFillPrice) : null,
        executedGross: toNum(existingOrder.executedGross),
        executedFees: toNum(existingOrder.executedFees),
        executedNet: toNum(existingOrder.executedNet),
        blockedCash: toNum(existingOrder.blockedCash),
        blockedQuantity: toNum(existingOrder.blockedQuantity),
        status: existingOrder.status,
        source: existingOrder.source,
        riskFlag: existingOrder.riskFlag,
      },
      checks: existingOrder.validations.map((check) => ({
        code: check.ruleCode,
        label: check.label,
        passed: check.result === "passed",
        message: check.message ?? "",
      })),
      idempotent: true,
    };
  }
  if (!account || !instrument) throw new Response("The selected client account or instrument does not exist.", { status: 404 });
  if (account.client.brokerId !== actor.brokerId) throw new Response("The selected account does not belong to this tenant.", { status: 403 });

  const quantity = D(input.quantity);
  const price = D(input.price);
  const triggerPrice = input.triggerPrice === undefined || input.triggerPrice === null ? null : D(input.triggerPrice);
  const orderType = normalizeOrderType(input.orderType ?? "limit");
  const feePolicy = await resolveFeePolicy(prisma, actor.brokerId, instrument, settings);
  const amounts = computeConfiguredAmounts(input.side, quantity, price, feePolicy);
  const allowedOrderTypes = Array.isArray(settings?.allowedOrderTypes)
    ? settings.allowedOrderTypes.filter((item): item is string => typeof item === "string")
    : ["Limit"];
  const holding = account.holdings[0];

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const dayAgg = await prisma.order.aggregate({
    where: {
      accountId: account.id,
      submittedAt: { gte: startOfDay },
      status: { notIn: ["rejected", "validation_failed", "cancelled", "failed"] },
    },
    _sum: { estimatedGross: true },
  });
  const projectedDailyGross = (dayAgg._sum.estimatedGross ?? ZERO).plus(amounts.gross);
  const checks = validatePreTrade({
    tenantMatches: account.client.brokerId === actor.brokerId,
    kycApproved: account.client.kycStatus === "approved",
    screeningClear: account.client.screenings[0]?.result === "clear",
    accountActive: account.status === "active",
    clientActive: account.client.status === "active",
    instrumentTradable: instrument.tradingStatus === "tradable",
    instrumentEnabled: entitlement?.enabled === true,
    orderTypeAllowed: allowedOrderTypes.some((item) => normalizeOrderType(item) === orderType),
    quantity,
    lotSize: instrument.lotSize,
    price,
    tickSize: instrument.tickSize,
    side: input.side,
    requiredCash: amounts.net,
    availableCash: account.availableCash,
    availableHoldings: holding?.availableQuantity ?? ZERO,
    projectedDailyGross,
    dailyLimit: settings?.clientDailyLimit,
    sellNet: amounts.net,
  });
  if (input.source === "investor_portal" && input.side === "buy" && account.availableCash.lt(amounts.net)) {
    throw investorBuyingPowerError(amounts.net, account.availableCash);
  }
  const employeeControl = await evaluateEmployeeOrder(prisma, {
    brokerId: actor.brokerId,
    accountId: input.accountId,
    instrumentId: input.instrumentId,
    side: input.side,
    quantity,
    value: amounts.gross,
    actorId: actor.id,
  });
  if (employeeControl.employeeProfile && (input.validity ?? "day").trim().toLowerCase() !== "day") {
    employeeControl.failures.push({ code: "EC_MISSING_CLEARANCE", severity: "high", message: "Employee-account orders must use Day validity." });
  }
  checks.push(...employeeControl.failures.map((failure) => ({
    code: failure.code,
    label: "Employee personal-dealing control",
    passed: false,
    message: failure.message,
  })));
  const valid = validationPassed(checks);
  const finalStatus = valid ? "pending_broker_review" : "validation_failed";
  const id = `ORD-${addisYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date();
  const riskFlag = amounts.net.gte(2_000_000) || employeeControl.employeeProfile ? "review" : "none";
  const source = input.source ?? "manual";
  const requiresVerification = ORDER_SOURCES.includes(source as (typeof ORDER_SOURCES)[number]);
  if (requiresVerification && !input.verificationId) {
    throw new Response("Verify the client instruction before submitting this order.", { status: 409 });
  }
  const verificationPayloadHash = orderPayloadHash({
    accountId: input.accountId, instrumentId: input.instrumentId, side: input.side,
    quantity: toNum(quantity), price: toNum(price), triggerPrice: triggerPrice ? toNum(triggerPrice) : null, orderType, source,
    submissionReference: input.submissionReference ?? "",
  });
  const ledgerActorId = actor.id ?? fallbackLedgerActor?.id;
  if (valid && !ledgerActorId) throw new Response("No active broker user is available to record the asset reservation.", { status: 409 });

  await prisma.$transaction(async (tx) => {
    const instructionVerifiedAt = requiresVerification ? await consumeOrderVerification(tx, {
      id: input.verificationId!, brokerId: actor.brokerId, clientId: account.client.id,
      accountId: input.accountId, payloadHash: verificationPayloadHash, orderId: id,
    }) : null;
    let cashBlock: ReturnType<typeof blockBuyCash> | null = null;
    let securitiesBlock: ReturnType<typeof blockSellSecurities> | null = null;
    let holdingId: string | null = null;
    let currentAccount: Awaited<ReturnType<typeof tx.account.findUnique>> = null;
    if (valid) {
      await lockAccount(tx, input.accountId);
      currentAccount = await tx.account.findUnique({ where: { id: input.accountId } });
      if (!currentAccount) throw new Response("Account not found.", { status: 404 });
      const currentDayAgg = await tx.order.aggregate({
        where: {
          accountId: input.accountId,
          submittedAt: { gte: startOfDay },
          status: { notIn: ["rejected", "validation_failed", "cancelled", "failed"] },
        },
        _sum: { estimatedGross: true },
      });
      const currentProjectedGross = (currentDayAgg._sum.estimatedGross ?? ZERO).plus(amounts.gross);
      if (settings?.clientDailyLimit && currentProjectedGross.gt(settings.clientDailyLimit)) {
        throw new Response("The client daily trading limit changed before reservation. Revalidate the order.", { status: 409 });
      }
    }
    if (valid && input.side === "buy" && currentAccount) {
      if (currentAccount.availableCash.lt(amounts.net)) {
        throw investorBuyingPowerError(amounts.net, currentAccount.availableCash);
      }
      cashBlock = blockBuyCash(cashSnapshot(currentAccount), amounts.net);
    }
    if (valid && input.side === "sell") {
      await lockHolding(tx, input.accountId, input.instrumentId);
      const currentHolding = await tx.holding.findUnique({
        where: { accountId_instrumentId: { accountId: input.accountId, instrumentId: input.instrumentId } },
      });
      if (!currentHolding) throw new Response("The account has no holding for this instrument.", { status: 409 });
      securitiesBlock = blockSellSecurities(securitySnapshot(currentHolding), quantity);
      holdingId = currentHolding.id;
    }
    await tx.order.create({
      data: {
        id,
        brokerId: actor.brokerId,
        submissionReference: input.submissionReference ?? null,
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        side: input.side,
        quantity,
        price,
        triggerPrice,
        orderType,
        validity: employeeControl.employeeProfile ? "day" : input.validity ?? "day",
        estimatedGross: amounts.gross,
        estimatedFees: amounts.fees,
        estimatedNet: amounts.net,
        estimatedFeeBreakdown: serializeFeeBreakdown(amounts.breakdown, feePolicy),
        termsVersion: input.termsVersion ?? null,
        disclosureVersion: input.disclosureVersion ?? null,
        disclosureAcceptedAt: input.disclosureAcceptedAt ?? null,
        filledQuantity: ZERO,
        remainingQuantity: quantity,
        blockedCash: cashBlock ? amounts.net : ZERO,
        blockedQuantity: securitiesBlock ? quantity : ZERO,
        status: finalStatus,
        source,
        instructionVerificationId: input.verificationId ?? null,
        personalTradeClearanceId: employeeControl.failures.length ? null : employeeControl.clearance?.id ?? null,
        instructionVerifiedAt,
        riskFlag,
        notes: input.notes?.trim() || null,
        submittedAt: now,
        validations: {
          create: checks.map((check) => ({
            id: crypto.randomUUID(),
            ruleCode: check.code,
            label: check.label,
            result: check.passed ? "passed" : "failed",
            message: check.message,
          })),
        },
      },
    });
    for (const failure of employeeControl.failures) {
      await createMonitoringAlert(tx, {
        brokerId: actor.brokerId,
        ruleCode: failure.code,
        fingerprint: `${failure.code}:${id}`,
        severity: failure.severity,
        clientId: account.client.id,
        orderId: id,
        forceClearance: true,
        actorUserId: actor.id,
        summary: failure.message,
        details: { employeeProfileId: employeeControl.employeeProfile?.id, accountId: input.accountId, instrumentId: input.instrumentId, side: input.side },
      });
    }
    if (employeeControl.employeeProfile) {
      const watch = await tx.restrictedSecurity.findFirst({
        where: { brokerId: actor.brokerId, instrumentId: input.instrumentId, classification: "watch", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      });
      if (watch) await createMonitoringAlert(tx, {
        brokerId: actor.brokerId, ruleCode: "EC_ACTIVE_OVERLAP", fingerprint: `EC_WATCH:${id}`, severity: "medium",
        clientId: account.client.id, orderId: id, summary: "Employee order uses a watch-list security and requires compliance review.",
        actorUserId: actor.id,
        details: { employeeProfileId: employeeControl.employeeProfile.id, restrictionId: watch.id },
      });
      const interacted = await tx.order.findFirst({
        where: {
          brokerId: actor.brokerId, instrumentId: input.instrumentId, side: input.side, accountId: { not: input.accountId }, submittedAt: { lt: now },
          events: { some: { actorId: employeeControl.employeeProfile.userId } },
        },
        orderBy: { submittedAt: "desc" }, select: { id: true },
      });
      const overlap = interacted ?? await tx.order.findFirst({
        where: {
          brokerId: actor.brokerId, instrumentId: input.instrumentId, side: input.side, accountId: { not: input.accountId }, submittedAt: { lt: now },
          status: { in: ["submitted", "pending_broker_review", "approved", "partially_filled"] },
        },
        orderBy: { submittedAt: "desc" }, select: { id: true },
      });
      if (overlap) await createMonitoringAlert(tx, {
        brokerId: actor.brokerId, ruleCode: interacted ? "EC_FRONT_RUNNING" : "EC_ACTIVE_OVERLAP", fingerprint: `${interacted ? "EC_FRONT_RUNNING" : "EC_ACTIVE_OVERLAP"}:${id}:${overlap.id}`,
        severity: interacted ? "high" : "medium", clientId: account.client.id, orderId: id, forceClearance: Boolean(interacted),
        actorUserId: actor.id,
        summary: interacted
          ? "The employee placed a personal order after interacting with an earlier client order in the same instrument and direction."
          : "The employee order overlaps earlier active client interest in the same instrument and direction.",
        details: { employeeProfileId: employeeControl.employeeProfile.id, relatedOrderId: overlap.id },
      });
    } else if (actor.id) {
      // Retrospective side of the targeted front-running control: an employee
      // who handled this client order may already have traded personally in the
      // same instrument and direction during the prior business-day window.
      const actorProfile = await tx.employeeConductProfile.findFirst({ where: { brokerId: actor.brokerId, userId: actor.id, status: "active", linkedAccountId: { not: null } } });
      if (actorProfile?.linkedAccountId && actorProfile.linkedAccountId !== input.accountId) {
        const personalOrder = await tx.order.findFirst({
          where: { brokerId: actor.brokerId, accountId: actorProfile.linkedAccountId, instrumentId: input.instrumentId, side: input.side, submittedAt: { gte: new Date(now.getTime() - 86_400_000), lt: now } },
          orderBy: { submittedAt: "desc" }, select: { id: true },
        });
        if (personalOrder) await createMonitoringAlert(tx, {
          brokerId: actor.brokerId, ruleCode: "EC_FRONT_RUNNING", fingerprint: `EC_FRONT_RUNNING:${personalOrder.id}:${id}`,
          severity: "high", orderId: personalOrder.id, forceClearance: true,
          actorUserId: actor.id,
          summary: "The employee traded personally within one business day before processing a client order in the same instrument and direction.",
          details: { employeeProfileId: actorProfile.id, relatedClientOrderId: id },
        });
      }
    }
    if (cashBlock) {
      await persistCashMutation(tx, {
        accountId: input.accountId,
        orderId: id,
        actorId: ledgerActorId!,
        valueDate: dateOnly(now),
        reason: "Pre-trade validation passed",
        mutation: cashBlock,
      });
    }
    if (securitiesBlock && holdingId) {
      await persistSecuritiesMutation(tx, {
        holdingId,
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        orderId: id,
        actorId: ledgerActorId!,
        valueDate: dateOnly(now),
        reason: "Pre-trade validation passed",
        mutation: securitiesBlock,
      });
    }
    await writeOrderEvent(tx, { orderId: id, fromStatus: null, toStatus: "draft", actorId: actor.id, reason: "Order record created" });
    await writeOrderEvent(tx, { orderId: id, fromStatus: "draft", toStatus: "submitted", actorId: actor.id, reason: "Order submitted for pre-trade validation" });
    await writeOrderEvent(tx, {
      orderId: id,
      fromStatus: "submitted",
      toStatus: finalStatus,
      actorId: actor.id,
      reason: valid ? "Pre-trade validation passed" : "Pre-trade validation failed",
      detail: { checks: checks.map((check) => ({ code: check.code, passed: check.passed })) },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: id,
      summary: `${input.side.toUpperCase()} order created for ${account.client.fullName}: ${toNum(quantity)} ${instrument.symbol} at ${toNum(price)} ETB`,
      newValue: {
        status: "draft",
        quantity: toNum(quantity),
        price: toNum(price),
        estimatedNet: toNum(amounts.net),
        feeScheduleVersion: feePolicy.scheduleVersion,
        regulatoryFeeScheduleVersion: feePolicy.regulatoryScheduleVersion,
        disclosureVersion: input.disclosureVersion ?? null,
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_SUBMITTED",
      entityType: "order",
      entityId: id,
      summary: `Order ${id} submitted for pre-trade validation`,
      previousValue: { status: "draft" },
      newValue: { status: "submitted" },
    });
    if (input.source === "investor_portal") {
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "INVESTOR_ORDER_SUBMITTED",
        entityType: "order",
        entityId: id,
        summary: `${input.side.toUpperCase()} ${toNum(quantity)} ${instrument.symbol} submitted from investor portal`,
        newValue: { status: finalStatus, estimatedNet: toNum(amounts.net) },
      });
    }
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: valid ? "ORDER_VALIDATED" : "ORDER_VALIDATION_FAILED",
      entityType: "order",
      entityId: id,
      summary: valid ? "Pre-trade validation passed; order sent for broker review" : "Pre-trade validation failed",
      previousValue: { status: "submitted" },
      newValue: { status: finalStatus, failedRules: checks.filter((check) => !check.passed).map((check) => check.code) },
      reason: valid ? null : checks.filter((check) => !check.passed).map((check) => check.message).join("; "),
    });
    if (cashBlock) {
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "CASH_BLOCKED",
        entityType: "order",
        entityId: id,
        summary: `${toNum(amounts.net)} ETB blocked after successful pre-trade validation`,
        newValue: { blockedCash: toNum(amounts.net) },
      });
    }
    if (securitiesBlock) {
      await writeAudit(tx, {
        brokerId: actor.brokerId,
        actorId: actor.id,
        action: "SECURITIES_BLOCKED",
        entityType: "order",
        entityId: id,
        summary: `${toNum(quantity)} ${instrument.symbol} blocked after successful pre-trade validation`,
        newValue: { blockedQuantity: toNum(quantity) },
      });
    }
    // Notify the broker roles who must review/approve this instruction.
    if (valid) {
      await writeNotification(tx, {
        scope: "broker",
        brokerId: actor.brokerId,
        roles: APPROVERS,
        category: "order",
        severity: riskFlag === "review" ? "warning" : "info",
        title: `Order awaiting review · ${instrument.symbol}`,
        body: `${input.side.toUpperCase()} ${toNum(quantity)} ${instrument.symbol} for ${account.client.fullName} · ${toNum(amounts.net)} ETB${riskFlag === "review" ? ": flagged for enhanced review" : ""}.`,
        entityType: "order",
        entityId: id,
      });
    }
    // Keep the investor informed about their own submission.
    if (input.source === "investor_portal") {
      await writeNotification(tx, {
        scope: "investor",
        brokerId: actor.brokerId,
        clientId: account.clientId,
        category: "order",
        severity: valid ? "info" : "warning",
        title: valid ? "Order submitted" : "Order needs attention",
        body: valid
          ? `Your ${input.side} order for ${toNum(quantity)} ${instrument.symbol} was submitted for broker review.`
          : `Your ${input.side} order for ${instrument.symbol} was held: ${checks.filter((check) => !check.passed).map((check) => check.message)[0] ?? "pre-trade checks did not pass"}.`,
        entityType: "order",
        entityId: id,
      });
    }
  }, transactionOptions);

  return {
    order: {
      id,
      createdAt: now.toISOString(),
      client: account.client.fullName,
      clientCode: account.client.clientCode,
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      symbol: instrument.symbol,
      side: input.side,
      quantity: toNum(quantity),
      price: toNum(price),
      orderType,
      estimatedGross: toNum(amounts.gross),
      estimatedFees: toNum(amounts.fees),
      estimatedNet: toNum(amounts.net),
      filledQuantity: 0,
      remainingQuantity: toNum(quantity),
      averageFillPrice: null,
      executedGross: 0,
      executedFees: 0,
      executedNet: 0,
      blockedCash: valid && input.side === "buy" ? toNum(amounts.net) : 0,
      blockedQuantity: valid && input.side === "sell" ? toNum(quantity) : 0,
      status: finalStatus,
      source: input.source ?? "manual",
      riskFlag,
    },
    checks,
  };
}

async function loadApprovalContext(tx: Prisma.TransactionClient, orderId: string, actor: Actor) {
  await lockOrder(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      account: { include: { client: { include: { screenings: { orderBy: { screenedAt: "desc" }, take: 1 } } } } },
      instrument: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
  const [settings, entitlement] = await Promise.all([
    tx.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } }),
    tx.brokerInstrument.findUnique({ where: { brokerId_instrumentId: { brokerId: actor.brokerId, instrumentId: order.instrumentId } } }),
  ]);
  return { order, settings, entitlement };
}

export async function approveOrder(actor: Actor, orderId: string) {
  return prisma.$transaction(async (tx) => {
    await assertNoEmployeeSelfProcessing(tx, actor.brokerId, orderId, actor.id);
    const { order, settings, entitlement } = await loadApprovalContext(tx, orderId, actor);
    assertTransition(order.status, "approved");
    const makerChecker = settings?.makerChecker ?? true;
    const approvalThreshold = settings?.approvalThreshold ?? ZERO;
    if (makerChecker && order.estimatedNet.gte(approvalThreshold)) {
      const creatorId = order.events.find((event) => event.fromStatus === null)?.actorId;
      if (creatorId && creatorId === actor.id) {
        throw new Response("Four-eyes control: the order creator cannot approve this order.", { status: 409 });
      }
    }
    const allowedOrderTypes = Array.isArray(settings?.allowedOrderTypes)
      ? settings.allowedOrderTypes.filter((item): item is string => typeof item === "string")
      : ["Limit"];
    const controlFailure = order.account.client.brokerId !== actor.brokerId
      ? "The account no longer belongs to this tenant."
      : order.account.client.kycStatus !== "approved"
        ? "Client KYC is no longer approved."
        : order.account.client.screenings[0]?.result !== "clear"
          ? "A clear sanctions and PEP screening result is required."
          : order.account.status !== "active" || order.account.client.status !== "active"
            ? "The client or trading account is no longer active."
            : order.instrument.tradingStatus !== "tradable" || entitlement?.enabled !== true
              ? "The instrument is no longer tradable for this tenant."
              : !allowedOrderTypes.some((item) => normalizeOrderType(item) === normalizeOrderType(order.orderType))
                ? "The order type is no longer enabled for this tenant."
                : !["buy", "sell"].includes(order.side) || order.quantity.lte(0) || order.price.lte(0)
                  ? "The stored order direction, quantity, or price is invalid."
                  : !order.quantity.mod(order.instrument.lotSize).isZero() || !order.price.div(order.instrument.tickSize).isInteger()
                    ? "The order no longer meets the instrument lot or tick-size rules."
                    : null;
    if (controlFailure) throw new Response(`${controlFailure} Run validation again before approval.`, { status: 409 });

    if (order.side === "buy") {
      await lockAccount(tx, order.accountId);
      const account = await tx.account.findUnique({ where: { id: order.accountId } });
      if (!account) throw new Response("Account not found.", { status: 404 });
      if (!order.blockedCash.eq(order.estimatedNet) || account.blockedCash.lt(order.blockedCash)) {
        throw new Response("The validated cash reservation is missing or inconsistent. Cancel and resubmit the order.", { status: 409 });
      }
    } else {
      await lockHolding(tx, order.accountId, order.instrumentId);
      const holding = await tx.holding.findUnique({
        where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
      });
      if (!holding) throw new Response("The account has no holding for this instrument.", { status: 409 });
      if (!order.blockedQuantity.eq(order.quantity) || holding.blockedQuantity.lt(order.blockedQuantity)) {
        throw new Response("The validated securities reservation is missing or inconsistent. Cancel and resubmit the order.", { status: 409 });
      }
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "approved", approvedAt: new Date(), approvedBy: actor.id, version: { increment: 1 } },
    });
    await writeOrderEvent(tx, {
      orderId,
      fromStatus: order.status,
      toStatus: "approved",
      actorId: actor.id,
      reason: `Order approved; validated ${order.side === "buy" ? "cash" : "securities"} reservation confirmed`,
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_APPROVED",
      entityType: "order",
      entityId: orderId,
      summary: `Order ${orderId} approved`,
      previousValue: { status: order.status },
      newValue: { status: "approved" },
    });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: actor.brokerId,
      roles: TRADERS,
      category: "order",
      severity: "info",
      title: `Order approved · ${order.instrument.symbol}`,
      body: `${order.side.toUpperCase()} ${toNum(order.quantity)} ${order.instrument.symbol} for ${order.account.client.fullName} is approved and ready to execute.`,
      entityType: "order",
      entityId: orderId,
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: order.account.clientId,
      category: "order",
      severity: "success",
      title: "Order approved",
      body: `Your ${order.side} order for ${toNum(order.quantity)} ${order.instrument.symbol} was approved by your broker.`,
      entityType: "order",
      entityId: orderId,
    });
    return { status: "approved" as const };
  }, transactionOptions);
}

export async function rejectOrder(actor: Actor, orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { account: { include: { client: true } }, instrument: true } });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    assertTransition(order.status, "rejected");
    await releaseOrderReservation(tx, actor, order, reason);
    await tx.order.update({
      where: { id: orderId },
      data: { status: "rejected", rejectionReason: reason, blockedCash: ZERO, blockedQuantity: ZERO, version: { increment: 1 } },
    });
    await writeOrderEvent(tx, { orderId, fromStatus: order.status, toStatus: "rejected", actorId: actor.id, reason });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_REJECTED",
      entityType: "order",
      entityId: orderId,
      summary: `Order ${orderId} rejected`,
      previousValue: { status: order.status, blockedCash: toNum(order.blockedCash), blockedQuantity: toNum(order.blockedQuantity) },
      newValue: { status: "rejected", blockedCash: 0, blockedQuantity: 0 },
      reason,
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: order.account.clientId,
      category: "order",
      severity: "warning",
      title: "Order rejected",
      body: `Your ${order.side} order for ${order.instrument.symbol} was not approved: ${reason}`,
      entityType: "order",
      entityId: orderId,
    });
    return { status: "rejected" as const };
  }, transactionOptions);
}

async function releaseOrderReservation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  order: {
    id: string;
    accountId: string;
    instrumentId: string;
    side: string;
    blockedCash: Prisma.Decimal;
    blockedQuantity: Prisma.Decimal;
  },
  reason: string,
) {
  const valueDate = dateOnly();
  if (order.side === "buy" && order.blockedCash.gt(0)) {
    await lockAccount(tx, order.accountId);
    const account = await tx.account.findUnique({ where: { id: order.accountId } });
    if (!account) throw new Response("Account not found.", { status: 404 });
    const mutation = releaseBuyCash(cashSnapshot(account), order.blockedCash, "Remaining order cash released");
    await persistCashMutation(tx, { accountId: order.accountId, orderId: order.id, actorId: actor.id, valueDate, reason, mutation });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CASH_RELEASED",
      entityType: "order",
      entityId: order.id,
      summary: `${toNum(order.blockedCash)} ETB released`,
      previousValue: { blockedCash: toNum(order.blockedCash) },
      newValue: { blockedCash: 0 },
      reason,
    });
  }
  if (order.side === "sell" && order.blockedQuantity.gt(0)) {
    await lockHolding(tx, order.accountId, order.instrumentId);
    const holding = await tx.holding.findUnique({
      where: { accountId_instrumentId: { accountId: order.accountId, instrumentId: order.instrumentId } },
    });
    if (!holding) throw new Response("Holding not found.", { status: 404 });
    const mutation = releaseSellSecurities(securitySnapshot(holding), order.blockedQuantity, "Remaining order securities released");
    await persistSecuritiesMutation(tx, {
      holdingId: holding.id,
      accountId: order.accountId,
      instrumentId: order.instrumentId,
      orderId: order.id,
      actorId: actor.id,
      valueDate,
      reason,
      mutation,
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "SECURITIES_RELEASED",
      entityType: "order",
      entityId: order.id,
      summary: `${toNum(order.blockedQuantity)} units released`,
      previousValue: { blockedQuantity: toNum(order.blockedQuantity) },
      newValue: { blockedQuantity: 0 },
      reason,
    });
  }
}

export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    assertTransition(order.status, "cancelled");
    await releaseOrderReservation(tx, actor, order, reason);
    await tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled", rejectionReason: reason, blockedCash: ZERO, blockedQuantity: ZERO, version: { increment: 1 } },
    });
    await writeOrderEvent(tx, { orderId, fromStatus: order.status, toStatus: "cancelled", actorId: actor.id, reason });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_CANCELLED",
      entityType: "order",
      entityId: orderId,
      summary: `Order ${orderId} cancelled`,
      previousValue: { status: order.status, blockedCash: toNum(order.blockedCash), blockedQuantity: toNum(order.blockedQuantity) },
      newValue: { status: "cancelled", blockedCash: 0, blockedQuantity: 0 },
      reason,
    });
    return { status: "cancelled" as const };
  }, transactionOptions);
}

export async function failOrder(actor: Actor, orderId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    if (isTerminalStatus(order.status)) throw new Response("A terminal order cannot be failed or edited.", { status: 409 });
    assertTransition(order.status, "failed");
    await releaseOrderReservation(tx, actor, order, reason);
    await tx.order.update({
      where: { id: orderId },
      data: { status: "failed", rejectionReason: reason, blockedCash: ZERO, blockedQuantity: ZERO, version: { increment: 1 } },
    });
    await writeOrderEvent(tx, { orderId, fromStatus: order.status, toStatus: "failed", actorId: actor.id, reason });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "ORDER_FAILED",
      entityType: "order",
      entityId: orderId,
      summary: `Order ${orderId} marked failed`,
      previousValue: { status: order.status },
      newValue: { status: "failed" },
      reason,
    });
    return { status: "failed" as const };
  }, transactionOptions);
}

export async function generateContractNote(actor: Actor, orderId: string) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { trades: true } });
    if (!order || order.brokerId !== actor.brokerId) throw new Response("Order not found for this tenant.", { status: 404 });
    if (!order.trades.length) throw new Response("A contract note cannot be generated before a trade is captured.", { status: 409 });
    if (order.remainingQuantity.gt(0) && !["cancelled", "failed"].includes(order.status)) {
      throw new Response("Finalize or cancel the remaining order quantity before generating the final contract note.", { status: 409 });
    }
    const noteNumber = order.contractNoteNumber ?? `CN-${order.id}`;
    const generatedAt = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        contractNoteNumber: noteNumber,
        contractNoteGeneratedAt: generatedAt,
        contractNoteGeneratedBy: actor.id,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CONTRACT_NOTE_GENERATED",
      entityType: "order",
      entityId: orderId,
      summary: `${noteNumber} generated for ${orderId}`,
      previousValue: { generatedAt: order.contractNoteGeneratedAt?.toISOString() ?? null },
      newValue: { noteNumber, generatedAt: generatedAt.toISOString() },
    });
    return { status: order.status, contractNoteNumber: noteNumber, generatedAt: generatedAt.toISOString() };
  }, transactionOptions);
}

export type { ValidationCheck };
