import { type Decimal, type DecimalValue, D, money, ZERO } from "../money";

export type CashSnapshot = {
  total: Decimal;
  available: Decimal;
  blocked: Decimal;
  unsettled: Decimal;
};

export type SecuritySnapshot = {
  total: Decimal;
  available: Decimal;
  blocked: Decimal;
  unsettled: Decimal;
};

export type CashLedgerImpact = {
  entryType: "deposit" | "withdrawal" | "block" | "release" | "trade_debit" | "trade_credit" | "fee" | "adjustment";
  amount: Decimal;
  totalImpact: Decimal;
  availableImpact: Decimal;
  blockedImpact: Decimal;
  unsettledImpact: Decimal;
  runningBalance: Decimal;
  description: string;
};

export type SecuritiesLedgerImpact = {
  entryType: "block" | "release" | "buy_credit" | "sell_debit" | "adjustment";
  quantity: Decimal;
  totalImpact: Decimal;
  availableImpact: Decimal;
  blockedImpact: Decimal;
  unsettledImpact: Decimal;
  runningQuantity: Decimal;
  description: string;
};

export type CashMutation = { next: CashSnapshot; entries: CashLedgerImpact[] };
export type SecuritiesMutation = { next: SecuritySnapshot; entries: SecuritiesLedgerImpact[] };

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

const cash = (value: CashSnapshot): CashSnapshot => ({
  total: money(value.total),
  available: money(value.available),
  blocked: money(value.blocked),
  unsettled: money(value.unsettled),
});

const security = (value: SecuritySnapshot): SecuritySnapshot => ({
  total: D(value.total),
  available: D(value.available),
  blocked: D(value.blocked),
  unsettled: D(value.unsettled),
});

function assertNonnegative(label: string, values: Decimal[]) {
  if (values.some((value) => value.lt(0))) {
    throw new LedgerIntegrityError(`${label} cannot become negative.`);
  }
}

export function assertCashInvariant(snapshot: CashSnapshot) {
  const value = cash(snapshot);
  assertNonnegative("Cash balance", [value.total, value.available, value.blocked, value.unsettled]);
  if (!value.total.eq(value.available.plus(value.blocked).plus(value.unsettled))) {
    throw new LedgerIntegrityError("Cash balance invariant failed: total must equal available + blocked + unsettled.");
  }
}

export function assertSecurityInvariant(snapshot: SecuritySnapshot) {
  const value = security(snapshot);
  assertNonnegative("Securities balance", [value.total, value.available, value.blocked, value.unsettled]);
  if (!value.total.eq(value.available.plus(value.blocked).plus(value.unsettled))) {
    throw new LedgerIntegrityError("Securities balance invariant failed: total must equal available + blocked + unsettled.");
  }
}

function appendCash(
  snapshot: CashSnapshot,
  entry: Omit<CashLedgerImpact, "runningBalance">,
): { next: CashSnapshot; entry: CashLedgerImpact } {
  const next = cash({
    total: snapshot.total.plus(entry.totalImpact),
    available: snapshot.available.plus(entry.availableImpact),
    blocked: snapshot.blocked.plus(entry.blockedImpact),
    unsettled: snapshot.unsettled.plus(entry.unsettledImpact),
  });
  assertCashInvariant(next);
  return { next, entry: { ...entry, runningBalance: next.total } };
}

function appendSecurity(
  snapshot: SecuritySnapshot,
  entry: Omit<SecuritiesLedgerImpact, "runningQuantity">,
): { next: SecuritySnapshot; entry: SecuritiesLedgerImpact } {
  const next = security({
    total: snapshot.total.plus(entry.totalImpact),
    available: snapshot.available.plus(entry.availableImpact),
    blocked: snapshot.blocked.plus(entry.blockedImpact),
    unsettled: snapshot.unsettled.plus(entry.unsettledImpact),
  });
  assertSecurityInvariant(next);
  return { next, entry: { ...entry, runningQuantity: next.total } };
}

export function blockBuyCash(snapshot: CashSnapshot, amount: DecimalValue): CashMutation {
  assertCashInvariant(snapshot);
  const required = money(amount);
  if (required.lte(0)) throw new LedgerIntegrityError("Cash block must be positive.");
  if (snapshot.available.lt(required)) throw new LedgerIntegrityError("Insufficient available cash.");
  const result = appendCash(snapshot, {
    entryType: "block",
    amount: required,
    totalImpact: ZERO,
    availableImpact: required.negated(),
    blockedImpact: required,
    unsettledImpact: ZERO,
    description: "Cash blocked for approved buy order",
  });
  return { next: result.next, entries: [result.entry] };
}

export function releaseBuyCash(snapshot: CashSnapshot, amount: DecimalValue, description = "Unused buy-order cash released"): CashMutation {
  assertCashInvariant(snapshot);
  const released = money(amount);
  if (released.lt(0) || snapshot.blocked.lt(released)) throw new LedgerIntegrityError("Cash release exceeds the blocked balance.");
  if (released.isZero()) return { next: cash(snapshot), entries: [] };
  const result = appendCash(snapshot, {
    entryType: "release",
    amount: released,
    totalImpact: ZERO,
    availableImpact: released,
    blockedImpact: released.negated(),
    unsettledImpact: ZERO,
    description,
  });
  return { next: result.next, entries: [result.entry] };
}

/** Credit client cash only after the broker has matched the deposit to bank evidence. */
export function creditVerifiedDeposit(snapshot: CashSnapshot, amount: DecimalValue): CashMutation {
  assertCashInvariant(snapshot);
  const credited = money(amount);
  if (credited.lte(0)) throw new LedgerIntegrityError("Deposit must be positive.");
  const result = appendCash(snapshot, {
    entryType: "deposit",
    amount: credited,
    totalImpact: credited,
    availableImpact: credited,
    blockedImpact: ZERO,
    unsettledImpact: ZERO,
    description: "Verified client deposit credited",
  });
  return { next: result.next, entries: [result.entry] };
}

export function creditCorporateActionCash(snapshot: CashSnapshot, amount: DecimalValue, description: string): CashMutation {
  assertCashInvariant(snapshot);
  const credited = money(amount);
  if (credited.lte(0)) throw new LedgerIntegrityError("Corporate-action cash must be positive.");
  const result = appendCash(snapshot, { entryType: "adjustment", amount: credited, totalImpact: credited, availableImpact: credited, blockedImpact: ZERO, unsettledImpact: ZERO, description });
  return { next: result.next, entries: [result.entry] };
}

export function creditCorporateActionSecurities(snapshot: SecuritySnapshot, quantity: DecimalValue, description: string): SecuritiesMutation {
  assertSecurityInvariant(snapshot);
  const credited = D(quantity);
  if (credited.lte(0)) throw new LedgerIntegrityError("Corporate-action security quantity must be positive.");
  const result = appendSecurity(snapshot, { entryType: "adjustment", quantity: credited, totalImpact: credited, availableImpact: credited, blockedImpact: ZERO, unsettledImpact: ZERO, description });
  return { next: result.next, entries: [result.entry] };
}

export function debitRedeemedSecurities(snapshot: SecuritySnapshot, quantity: DecimalValue, description: string): SecuritiesMutation {
  assertSecurityInvariant(snapshot);
  const debited = D(quantity);
  if (debited.lte(0)) throw new LedgerIntegrityError("Redemption quantity must be positive.");
  if (snapshot.available.lt(debited)) throw new LedgerIntegrityError("Redemption exceeds available securities.");
  const result = appendSecurity(snapshot, { entryType: "adjustment", quantity: debited.negated(), totalImpact: debited.negated(), availableImpact: debited.negated(), blockedImpact: ZERO, unsettledImpact: ZERO, description });
  return { next: result.next, entries: [result.entry] };
}

/** Reserve withdrawable cash while a payment instruction is reviewed and paid. */
export function reserveWithdrawalCash(snapshot: CashSnapshot, amount: DecimalValue): CashMutation {
  assertCashInvariant(snapshot);
  const reserved = money(amount);
  if (reserved.lte(0)) throw new LedgerIntegrityError("Withdrawal must be positive.");
  if (snapshot.available.lt(reserved)) throw new LedgerIntegrityError("Insufficient available cash for withdrawal.");
  const result = appendCash(snapshot, {
    entryType: "block",
    amount: reserved,
    totalImpact: ZERO,
    availableImpact: reserved.negated(),
    blockedImpact: reserved,
    unsettledImpact: ZERO,
    description: "Cash reserved for withdrawal instruction",
  });
  return { next: result.next, entries: [result.entry] };
}

/** Remove a paid withdrawal from the client's cash after bank payment evidence exists. */
export function completeWithdrawalCash(snapshot: CashSnapshot, amount: DecimalValue): CashMutation {
  assertCashInvariant(snapshot);
  const paid = money(amount);
  if (paid.lte(0)) throw new LedgerIntegrityError("Withdrawal must be positive.");
  if (snapshot.blocked.lt(paid)) throw new LedgerIntegrityError("Withdrawal exceeds reserved cash.");
  const result = appendCash(snapshot, {
    entryType: "withdrawal",
    amount: paid.negated(),
    totalImpact: paid.negated(),
    availableImpact: ZERO,
    blockedImpact: paid.negated(),
    unsettledImpact: ZERO,
    description: "Confirmed client withdrawal paid",
  });
  return { next: result.next, entries: [result.entry] };
}

/** Restore reserved cash when a withdrawal is rejected or its payment fails. */
export function releaseWithdrawalCash(snapshot: CashSnapshot, amount: DecimalValue, description = "Withdrawal reservation released"): CashMutation {
  assertCashInvariant(snapshot);
  const released = money(amount);
  if (released.lte(0)) throw new LedgerIntegrityError("Withdrawal release must be positive.");
  if (snapshot.blocked.lt(released)) throw new LedgerIntegrityError("Withdrawal release exceeds reserved cash.");
  const result = appendCash(snapshot, {
    entryType: "release",
    amount: released,
    totalImpact: ZERO,
    availableImpact: released,
    blockedImpact: released.negated(),
    unsettledImpact: ZERO,
    description,
  });
  return { next: result.next, entries: [result.entry] };
}

export function captureBuyFill(
  cashSnapshot: CashSnapshot,
  securitySnapshot: SecuritySnapshot,
  currentOrderBlock: DecimalValue,
  targetRemainingBlock: DecimalValue,
  quantity: DecimalValue,
  grossAmount: DecimalValue,
  fees: DecimalValue,
): { cash: CashMutation; securities: SecuritiesMutation; releasedCash: Decimal } {
  assertCashInvariant(cashSnapshot);
  assertSecurityInvariant(securitySnapshot);
  const currentBlock = money(currentOrderBlock);
  const remainingBlock = money(targetRemainingBlock);
  const quantityFilled = D(quantity);
  const gross = money(grossAmount);
  const feeAmount = money(fees);
  if (quantityFilled.lte(0) || gross.lte(0) || feeAmount.lt(0)) throw new LedgerIntegrityError("Trade values must be positive.");
  if (remainingBlock.lt(0) || remainingBlock.gt(currentBlock)) throw new LedgerIntegrityError("Remaining cash reservation is inconsistent.");

  const releasedCash = currentBlock.minus(remainingBlock);
  let currentCash = cash(cashSnapshot);
  const cashEntries: CashLedgerImpact[] = [];
  if (releasedCash.gt(0)) {
    const release = appendCash(currentCash, {
      entryType: "release",
      amount: releasedCash,
      totalImpact: ZERO,
      availableImpact: releasedCash,
      blockedImpact: releasedCash.negated(),
      unsettledImpact: ZERO,
      description: "Cash reservation allocated to captured fill",
    });
    currentCash = release.next;
    cashEntries.push(release.entry);
  }
  if (currentCash.available.lt(gross.plus(feeAmount))) {
    throw new LedgerIntegrityError("Execution exceeds blocked and available cash.");
  }
  const debit = appendCash(currentCash, {
    entryType: "trade_debit",
    amount: gross.negated(),
    totalImpact: gross.negated(),
    availableImpact: gross.negated(),
    blockedImpact: ZERO,
    unsettledImpact: ZERO,
    description: "Buy trade consideration debited",
  });
  currentCash = debit.next;
  cashEntries.push(debit.entry);
  if (feeAmount.gt(0)) {
    const fee = appendCash(currentCash, {
      entryType: "fee",
      amount: feeAmount.negated(),
      totalImpact: feeAmount.negated(),
      availableImpact: feeAmount.negated(),
      blockedImpact: ZERO,
      unsettledImpact: ZERO,
      description: "Buy trade fees debited",
    });
    currentCash = fee.next;
    cashEntries.push(fee.entry);
  }

  const credit = appendSecurity(securitySnapshot, {
    entryType: "buy_credit",
    quantity: quantityFilled,
    totalImpact: quantityFilled,
    availableImpact: ZERO,
    blockedImpact: ZERO,
    unsettledImpact: quantityFilled,
    description: "Purchased securities recorded as unsettled",
  });
  return {
    cash: { next: currentCash, entries: cashEntries },
    securities: { next: credit.next, entries: [credit.entry] },
    releasedCash,
  };
}

export function blockSellSecurities(snapshot: SecuritySnapshot, quantity: DecimalValue): SecuritiesMutation {
  assertSecurityInvariant(snapshot);
  const blocked = D(quantity);
  if (blocked.lte(0)) throw new LedgerIntegrityError("Securities block must be positive.");
  if (snapshot.available.lt(blocked)) throw new LedgerIntegrityError("Insufficient available holdings.");
  const result = appendSecurity(snapshot, {
    entryType: "block",
    quantity: blocked,
    totalImpact: ZERO,
    availableImpact: blocked.negated(),
    blockedImpact: blocked,
    unsettledImpact: ZERO,
    description: "Securities blocked for approved sell order",
  });
  return { next: result.next, entries: [result.entry] };
}

export function releaseSellSecurities(snapshot: SecuritySnapshot, quantity: DecimalValue, description = "Unused sell-order securities released"): SecuritiesMutation {
  assertSecurityInvariant(snapshot);
  const released = D(quantity);
  if (released.lt(0) || snapshot.blocked.lt(released)) throw new LedgerIntegrityError("Securities release exceeds the blocked balance.");
  if (released.isZero()) return { next: security(snapshot), entries: [] };
  const result = appendSecurity(snapshot, {
    entryType: "release",
    quantity: released,
    totalImpact: ZERO,
    availableImpact: released,
    blockedImpact: released.negated(),
    unsettledImpact: ZERO,
    description,
  });
  return { next: result.next, entries: [result.entry] };
}

export function captureSellFill(
  cashSnapshot: CashSnapshot,
  securitySnapshot: SecuritySnapshot,
  quantity: DecimalValue,
  grossAmount: DecimalValue,
  fees: DecimalValue,
): { cash: CashMutation; securities: SecuritiesMutation } {
  assertCashInvariant(cashSnapshot);
  assertSecurityInvariant(securitySnapshot);
  const quantityFilled = D(quantity);
  const gross = money(grossAmount);
  const feeAmount = money(fees);
  const net = money(gross.minus(feeAmount));
  if (quantityFilled.lte(0) || gross.lte(0) || feeAmount.lt(0) || net.lte(0)) throw new LedgerIntegrityError("Sell trade proceeds must remain positive after fees.");
  if (securitySnapshot.blocked.lt(quantityFilled) || securitySnapshot.total.lt(quantityFilled)) {
    throw new LedgerIntegrityError("Execution exceeds blocked holdings.");
  }

  const delivery = appendSecurity(securitySnapshot, {
    entryType: "sell_debit",
    quantity: quantityFilled.negated(),
    totalImpact: quantityFilled.negated(),
    availableImpact: ZERO,
    blockedImpact: quantityFilled.negated(),
    unsettledImpact: ZERO,
    description: "Sold securities debited from blocked holdings",
  });

  let currentCash = cash(cashSnapshot);
  const cashEntries: CashLedgerImpact[] = [];
  const credit = appendCash(currentCash, {
    entryType: "trade_credit",
    amount: gross,
    totalImpact: gross,
    availableImpact: ZERO,
    blockedImpact: ZERO,
    unsettledImpact: gross,
    description: "Sell trade consideration recorded as unsettled",
  });
  currentCash = credit.next;
  cashEntries.push(credit.entry);
  if (feeAmount.gt(0)) {
    const fee = appendCash(currentCash, {
      entryType: "fee",
      amount: feeAmount.negated(),
      totalImpact: feeAmount.negated(),
      availableImpact: ZERO,
      blockedImpact: ZERO,
      unsettledImpact: feeAmount.negated(),
      description: "Sell trade fees deducted from unsettled proceeds",
    });
    currentCash = fee.next;
    cashEntries.push(fee.entry);
  }

  return {
    cash: { next: currentCash, entries: cashEntries },
    securities: { next: delivery.next, entries: [delivery.entry] },
  };
}

export function settleBuySecurities(snapshot: SecuritySnapshot, quantity: DecimalValue): SecuritiesMutation {
  assertSecurityInvariant(snapshot);
  const settled = D(quantity);
  if (settled.lte(0) || snapshot.unsettled.lt(settled)) throw new LedgerIntegrityError("Settlement quantity exceeds unsettled purchased securities.");
  const result = appendSecurity(snapshot, {
    entryType: "release",
    quantity: settled,
    totalImpact: ZERO,
    availableImpact: settled,
    blockedImpact: ZERO,
    unsettledImpact: settled.negated(),
    description: "Purchased securities released into available holdings",
  });
  return { next: result.next, entries: [result.entry] };
}

export function settleSellCash(snapshot: CashSnapshot, amount: DecimalValue): CashMutation {
  assertCashInvariant(snapshot);
  const settled = money(amount);
  if (settled.lte(0) || snapshot.unsettled.lt(settled)) throw new LedgerIntegrityError("Settlement amount exceeds unsettled sell proceeds.");
  const result = appendCash(snapshot, {
    entryType: "release",
    amount: settled,
    totalImpact: ZERO,
    availableImpact: settled,
    blockedImpact: ZERO,
    unsettledImpact: settled.negated(),
    description: "Sell proceeds released into available cash",
  });
  return { next: result.next, entries: [result.entry] };
}
