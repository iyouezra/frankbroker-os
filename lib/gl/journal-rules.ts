import { type Decimal, type DecimalValue, D, money, ZERO } from "../money";

/**
 * The brokerage general ledger, expressed as pure functions.
 *
 * Nothing in this file touches the database. Every money event in the platform
 * is translated here into a balanced set of debit and credit lines, which
 * `lib/gl/posting-service.ts` then writes. Keeping the translation pure is what
 * makes it testable with plain Decimal literals, exactly as the sub-ledger
 * arithmetic in `lib/oms/ledger-service.ts` is.
 *
 * Two rules govern everything below.
 *
 * 1. Builders emit **roles**, never account codes. A role is an immutable
 *    semantic key; the numeric code attached to it belongs to the broker and
 *    may be renumbered at any time. This is what lets many brokerages share one
 *    engine while keeping their own chart presentation.
 * 2. The ledger moves only when the firm's economic position changes. Blocking
 *    cash for an order, or reserving it for a withdrawal, reclassifies money
 *    inside one client's sub-ledger; the total owed to clients is unchanged, so
 *    no journal entry is posted.
 */

export type LedgerAccountClass = "asset" | "liability" | "equity" | "income" | "expense" | "memorandum";

export type LedgerSourceType =
  | "gateway_deposit"
  | "manual_deposit"
  | "unidentified_receipt"
  | "receipt_allocation"
  | "withdrawal"
  | "trade_capture"
  | "settlement"
  | "fee_remittance"
  | "fee_sweep"
  | "client_money_funding"
  | "opening_balance"
  | "manual_correction"
  | "reversal";

/** The engine's entire account vocabulary. Codes never appear in posting logic. */
export const LEDGER_ROLES = {
  clientMoneyPooledBank: "client_money_pooled_bank",
  clientMoneyGateway: "client_money_gateway",
  settlementReceivable: "settlement_receivable",
  brokerOperatingBank: "broker_operating_bank",
  clientMoneyPayableSettled: "client_money_payable_settled",
  clientMoneyPayableUnsettled: "client_money_payable_unsettled",
  unidentifiedReceipts: "unidentified_receipts",
  ecmaLevyPayable: "ecma_levy_payable",
  esxFeePayable: "esx_fee_payable",
  csdFeePayable: "csd_fee_payable",
  brokerageTaxPayable: "brokerage_tax_payable",
  settlementPayable: "settlement_payable",
  corporateBooksBridge: "corporate_books_bridge",
  brokerageIncome: "brokerage_income",
  bankAndGatewayCharges: "bank_and_gateway_charges",
  clientMoneyShortfall: "client_money_shortfall",
  roundingDifferences: "rounding_differences",
  custodyMemoAsset: "custody_memo_asset",
  custodyMemoOwners: "custody_memo_owners",
} as const;

export type LedgerRole = (typeof LEDGER_ROLES)[keyof typeof LEDGER_ROLES];

export type LedgerRoleTemplate = {
  role: LedgerRole;
  defaultCode: string;
  name: string;
  accountClass: LedgerAccountClass;
  normalBalance: "debit" | "credit";
  /** IFRS presentation caption, used by the statutory journal export. */
  statementCaption: string;
  /** Which sub-ledger this control account must reconcile against, if any. */
  subLedger: string | null;
  /** Instantiated and enabled for every broker. Optional roles start disabled. */
  required: boolean;
};

/**
 * The chart, frozen. It is intentionally small and fixed: per-client balances
 * live in the sub-ledgers, so no amount of client growth adds an account here.
 * Nothing in this list is per-client, per-bank, or per-instrument.
 */
export const LEDGER_ROLE_TEMPLATE: readonly LedgerRoleTemplate[] = [
  {
    role: LEDGER_ROLES.clientMoneyPooledBank,
    defaultCode: "1010",
    name: "Client Money — Pooled Bank Accounts",
    accountClass: "asset",
    normalBalance: "debit",
    statementCaption: "Cash and cash equivalents held for clients",
    subLedger: "pooled_bank_statement",
    required: true,
  },
  {
    role: LEDGER_ROLES.clientMoneyGateway,
    defaultCode: "1015",
    name: "Client Money — Payment Gateway Settlement",
    accountClass: "asset",
    normalBalance: "debit",
    statementCaption: "Cash and cash equivalents held for clients",
    subLedger: null,
    required: false,
  },
  {
    role: LEDGER_ROLES.settlementReceivable,
    defaultCode: "1050",
    name: "Trade Receivable — Exchange/CSD Settlement",
    accountClass: "asset",
    normalBalance: "debit",
    statementCaption: "Trade and other receivables",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.brokerOperatingBank,
    defaultCode: "1090",
    name: "Broker Operating Bank Account",
    accountClass: "asset",
    normalBalance: "debit",
    statementCaption: "Cash and cash equivalents",
    subLedger: null,
    required: false,
  },
  {
    role: LEDGER_ROLES.clientMoneyPayableSettled,
    defaultCode: "2010",
    name: "Client Money Payable — Settled Funds",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Payables to clients",
    subLedger: "client_cash_settled",
    required: true,
  },
  {
    role: LEDGER_ROLES.clientMoneyPayableUnsettled,
    defaultCode: "2020",
    name: "Client Money Payable — Unsettled Trade Proceeds",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Payables to clients",
    subLedger: "client_cash_unsettled",
    required: true,
  },
  {
    role: LEDGER_ROLES.unidentifiedReceipts,
    defaultCode: "2040",
    name: "Unidentified Client Receipts",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Payables to clients",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.ecmaLevyPayable,
    defaultCode: "2050",
    name: "Regulatory Levy Payable — ECMA",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Trade and other payables",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.esxFeePayable,
    defaultCode: "2060",
    name: "Exchange Fee Payable — ESX",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Trade and other payables",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.csdFeePayable,
    defaultCode: "2070",
    name: "Central Securities Depository Fee Payable",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Trade and other payables",
    subLedger: null,
    required: true,
  },
  {
    // Disabled until it is confirmed whether brokerage commission is a
    // VAT-exempt financial service in Ethiopia. Present so that turning it on
    // is a configuration change rather than a migration.
    role: LEDGER_ROLES.brokerageTaxPayable,
    defaultCode: "2085",
    name: "Indirect Tax Payable on Brokerage Commission",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Current tax liabilities",
    subLedger: null,
    required: false,
  },
  {
    role: LEDGER_ROLES.settlementPayable,
    defaultCode: "2090",
    name: "Settlement Payable — Exchange/CSD",
    accountClass: "liability",
    normalBalance: "credit",
    statementCaption: "Trade and other payables",
    subLedger: null,
    required: true,
  },
  {
    // Brokerage-scoped books only. Revenue and expense net here, and the firm's
    // statutory accountant reads this one account rather than our whole ledger.
    role: LEDGER_ROLES.corporateBooksBridge,
    defaultCode: "3010",
    name: "Due to/from Corporate Books",
    accountClass: "equity",
    normalBalance: "credit",
    statementCaption: "Retained earnings",
    subLedger: null,
    required: true,
  },
  {
    // IFRS 15: recognised at a point in time, on trade date, when the
    // performance obligation of executing the trade is satisfied.
    role: LEDGER_ROLES.brokerageIncome,
    defaultCode: "4010",
    name: "Brokerage Commission Income",
    accountClass: "income",
    normalBalance: "credit",
    statementCaption: "Fee and commission income",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.bankAndGatewayCharges,
    defaultCode: "5010",
    name: "Bank and Payment Gateway Charges",
    accountClass: "expense",
    normalBalance: "debit",
    statementCaption: "Fee and commission expense",
    subLedger: null,
    required: true,
  },
  {
    // Named rather than netted so a segregation breach is visible on its own
    // line instead of buried inside another balance.
    role: LEDGER_ROLES.clientMoneyShortfall,
    defaultCode: "5080",
    name: "Client Money Shortfall",
    accountClass: "expense",
    normalBalance: "debit",
    statementCaption: "Other operating expenses",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.roundingDifferences,
    defaultCode: "5090",
    name: "Rounding and Immaterial Differences",
    accountClass: "expense",
    normalBalance: "debit",
    statementCaption: "Other operating expenses",
    subLedger: null,
    required: true,
  },
  {
    role: LEDGER_ROLES.custodyMemoAsset,
    defaultCode: "9010",
    name: "Client Securities Held in Custody — memorandum",
    accountClass: "memorandum",
    normalBalance: "debit",
    statementCaption: "Off-balance-sheet — client securities",
    subLedger: null,
    required: false,
  },
  {
    role: LEDGER_ROLES.custodyMemoOwners,
    defaultCode: "9020",
    name: "Client Securities — Beneficial Owners — memorandum",
    accountClass: "memorandum",
    normalBalance: "credit",
    statementCaption: "Off-balance-sheet — client securities",
    subLedger: null,
    required: false,
  },
];

const TEMPLATE_BY_ROLE = new Map<string, LedgerRoleTemplate>(LEDGER_ROLE_TEMPLATE.map((item) => [item.role, item]));

export function ledgerRoleTemplate(role: string): LedgerRoleTemplate | undefined {
  return TEMPLATE_BY_ROLE.get(role);
}

/** The roles enabled for every broker the moment their chart is created. */
export const REQUIRED_LEDGER_ROLES: readonly LedgerRole[] = LEDGER_ROLE_TEMPLATE.filter((item) => item.required).map((item) => item.role);

/**
 * The largest plug permitted on a single entry, in ETB. Applies only to
 * statement imports and manual corrections; the trade path asserts its fee
 * breakdown instead of plugging, because a plug account is where errors hide.
 */
export const MAX_ROUNDING_PLUG = D("0.05");

export type DraftLine = {
  role: LedgerRole;
  side: "debit" | "credit";
  amount: Decimal;
  memo: string;
  /** Provenance only. Never a balance dimension. */
  clientAccountId?: string | null;
  pooledBankAccountId?: string | null;
  instrumentId?: string | null;
};

export type DraftEntry = {
  sourceType: LedgerSourceType;
  sourceId: string;
  eventKey: string;
  description: string;
  valueDate: Date;
  lines: DraftLine[];
};

/**
 * Structurally compatible with `FeeBreakdown` in `lib/oms/fee-service.ts`,
 * restated here so this module stays free of database imports.
 */
export type JournalFeeBreakdown = {
  brokerage: Decimal;
  regulator: Decimal;
  exchange: Decimal;
  csd: Decimal;
  total: Decimal;
};

export class JournalBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalBalanceError";
  }
}

/** Debit-positive signed value, used for balance arithmetic only. */
export function signedAmount(line: Pick<DraftLine, "side" | "amount">): Decimal {
  const amount = money(line.amount);
  return line.side === "debit" ? amount : amount.negated();
}

/** Drop lines that round to nothing, so a zero fee leg never occupies a row. */
export function pruneZeroLines(lines: DraftLine[]): DraftLine[] {
  return lines.filter((line) => !money(line.amount).isZero());
}

/**
 * The invariant a regulator checks: total debits equal total credits. Expressed
 * directly, which a signed-amounts-sum-to-zero model cannot do — there, a sign
 * error on a contra posting is invisible.
 */
export function assertBalanced(
  lines: DraftLine[],
  options?: { postableRoles?: ReadonlySet<string> },
): { totalDebit: Decimal; totalCredit: Decimal } {
  if (lines.length < 2) {
    throw new JournalBalanceError("A journal entry needs at least one debit and one credit line.");
  }
  let totalDebit = ZERO;
  let totalCredit = ZERO;
  for (const line of lines) {
    const template = TEMPLATE_BY_ROLE.get(line.role);
    if (!template) throw new JournalBalanceError(`Unknown ledger role "${line.role}".`);
    if (options?.postableRoles && !options.postableRoles.has(line.role)) {
      throw new JournalBalanceError(`Ledger role "${line.role}" is not enabled for posting.`);
    }
    if (line.side !== "debit" && line.side !== "credit") {
      throw new JournalBalanceError(`Journal line side must be debit or credit, received "${line.side}".`);
    }
    const amount = money(line.amount);
    if (amount.lte(0)) {
      throw new JournalBalanceError("Journal line amounts must be positive; direction is carried by the side.");
    }
    if (line.role === LEDGER_ROLES.roundingDifferences && amount.gt(MAX_ROUNDING_PLUG)) {
      throw new JournalBalanceError(`A rounding difference may not exceed ${MAX_ROUNDING_PLUG.toFixed(2)} ETB.`);
    }
    if (line.side === "debit") totalDebit = money(totalDebit.plus(amount));
    else totalCredit = money(totalCredit.plus(amount));
  }
  if (!totalDebit.eq(totalCredit)) {
    throw new JournalBalanceError(
      `Journal entry does not balance: debits ${totalDebit.toFixed(2)} versus credits ${totalCredit.toFixed(2)}.`,
    );
  }
  return { totalDebit, totalCredit };
}

/**
 * Replaying an event must be a no-op, not a double posting. The key is unique
 * per broker, so a redelivered webhook or a retried trade capture collides with
 * the entry already written.
 */
export function idempotencyKeyFor(draft: Pick<DraftEntry, "sourceType" | "sourceId" | "eventKey">): string {
  return `${draft.sourceType}:${draft.sourceId}:${draft.eventKey}`;
}

/** Mirror an entry, so posting both leaves every account exactly where it was. */
export function reverseLines(lines: DraftLine[]): DraftLine[] {
  return lines.map((line) => ({ ...line, side: line.side === "debit" ? "credit" : "debit" }));
}

function assertFeeBreakdownSums(breakdown: JournalFeeBreakdown) {
  const parts = money(
    money(breakdown.brokerage).plus(money(breakdown.regulator)).plus(money(breakdown.exchange)).plus(money(breakdown.csd)),
  );
  if (!parts.eq(money(breakdown.total))) {
    throw new JournalBalanceError(
      `Fee breakdown does not sum to its total: parts ${parts.toFixed(2)} versus total ${money(breakdown.total).toFixed(2)}.`,
    );
  }
}

function feeCreditLines(breakdown: JournalFeeBreakdown, memoSuffix: string): DraftLine[] {
  return [
    { role: LEDGER_ROLES.brokerageIncome, side: "credit", amount: money(breakdown.brokerage), memo: `Brokerage commission ${memoSuffix}` },
    { role: LEDGER_ROLES.ecmaLevyPayable, side: "credit", amount: money(breakdown.regulator), memo: `ECMA levy collected ${memoSuffix}` },
    { role: LEDGER_ROLES.esxFeePayable, side: "credit", amount: money(breakdown.exchange), memo: `ESX fee collected ${memoSuffix}` },
    { role: LEDGER_ROLES.csdFeePayable, side: "credit", amount: money(breakdown.csd), memo: `CSD fee collected ${memoSuffix}` },
  ];
}

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

/**
 * E1. Funds confirmed by the payment provider. The client is credited gross
 * while only the net reaches segregated money, so the provider's cut shows up
 * immediately as an expense — and, if it is not funded, as a client-money
 * shortfall the adequacy check will surface.
 */
export function gatewayDepositConfirmed(input: {
  movementId: string;
  clientAccountId: string;
  gross: DecimalValue;
  providerFee: DecimalValue;
  valueDate: Date;
  provider: string;
}): DraftEntry {
  const gross = money(input.gross);
  const providerFee = money(input.providerFee);
  const netToSegregated = money(gross.minus(providerFee));
  if (netToSegregated.lt(0)) {
    throw new JournalBalanceError("A payment gateway fee cannot exceed the deposit itself.");
  }
  return {
    sourceType: "gateway_deposit",
    sourceId: input.movementId,
    eventKey: "confirm",
    description: `Deposit confirmed by ${input.provider}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyGateway, side: "debit", amount: netToSegregated, memo: `${input.provider} settlement receivable`, clientAccountId: input.clientAccountId },
      { role: LEDGER_ROLES.bankAndGatewayCharges, side: "debit", amount: providerFee, memo: `${input.provider} transaction charge` },
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: gross, memo: "Client deposit credited", clientAccountId: input.clientAccountId },
    ],
  };
}

/** E1b. Gateway balance swept into the segregated pooled bank account. */
export function gatewaySweptToPool(input: {
  sweepReference: string;
  amount: DecimalValue;
  pooledBankAccountId: string;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "gateway_deposit",
    sourceId: input.sweepReference,
    eventKey: "sweep",
    description: "Payment gateway balance swept to the pooled client account",
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount, memo: "Gateway sweep received", pooledBankAccountId: input.pooledBankAccountId },
      { role: LEDGER_ROLES.clientMoneyGateway, side: "credit", amount, memo: "Gateway settlement cleared" },
    ],
  };
}

/**
 * E2. Money that arrived outside the gateway — a direct bank transfer, a mobile
 * wallet, or cash at a branch — verified by an officer against evidence. This
 * is the narrow manual path, not the normal one.
 */
export function manualDepositRecorded(input: {
  movementId: string;
  clientAccountId: string;
  pooledBankAccountId: string;
  amount: DecimalValue;
  bankReference: string;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "manual_deposit",
    sourceId: input.movementId,
    eventKey: "verify",
    description: `Off-gateway deposit verified against ${input.bankReference}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount, memo: `Deposit received, reference ${input.bankReference}`, pooledBankAccountId: input.pooledBankAccountId },
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount, memo: "Client deposit credited", clientAccountId: input.clientAccountId },
    ],
  };
}

/**
 * E2b. A bank credit we hold but cannot yet attribute to a client. Recording it
 * as a liability is how money stops going missing: an unmatched payment is
 * never dropped, it lands here and raises a break.
 */
export function unidentifiedReceiptRecorded(input: {
  receiptId: string;
  pooledBankAccountId: string;
  amount: DecimalValue;
  bankReference: string;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "unidentified_receipt",
    sourceId: input.receiptId,
    eventKey: "record",
    description: `Unidentified receipt ${input.bankReference}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount, memo: `Unattributed credit, reference ${input.bankReference}`, pooledBankAccountId: input.pooledBankAccountId },
      { role: LEDGER_ROLES.unidentifiedReceipts, side: "credit", amount, memo: "Awaiting client identification" },
    ],
  };
}

/** E2c. An unidentified receipt matched to its client, under maker-checker. */
export function unidentifiedReceiptAllocated(input: {
  receiptId: string;
  clientAccountId: string;
  amount: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "receipt_allocation",
    sourceId: input.receiptId,
    eventKey: "allocate",
    description: "Unidentified receipt allocated to a client",
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.unidentifiedReceipts, side: "debit", amount, memo: "Receipt identified" },
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount, memo: "Client account credited", clientAccountId: input.clientAccountId },
    ],
  };
}

/**
 * E3. Withdrawal actually paid. Note there is no entry when a withdrawal is
 * submitted or approved: reserving cash reclassifies it within the client's own
 * balance, and an instruction is not yet a change in what the firm owes.
 */
export function withdrawalPaid(input: {
  movementId: string;
  clientAccountId: string;
  pooledBankAccountId: string;
  amount: DecimalValue;
  bankReference: string;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "withdrawal",
    sourceId: input.movementId,
    eventKey: "paid",
    description: `Withdrawal paid under ${input.bankReference}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "debit", amount, memo: "Client obligation discharged", clientAccountId: input.clientAccountId },
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "credit", amount, memo: `Payment sent, reference ${input.bankReference}`, pooledBankAccountId: input.pooledBankAccountId },
    ],
  };
}

/**
 * E4. A buy fill. The client is charged consideration plus fees; the exchange
 * obligation is recognised separately from the fees, and the fees are split so
 * that brokerage becomes income while the three market levies become payables
 * we are merely collecting as agent (IFRS 15 B34-B38).
 */
export function buyFillCaptured(input: {
  tradeId: string;
  clientAccountId: string;
  instrumentId: string;
  gross: DecimalValue;
  breakdown: JournalFeeBreakdown;
  valueDate: Date;
}): DraftEntry {
  assertFeeBreakdownSums(input.breakdown);
  const gross = money(input.gross);
  const fees = money(input.breakdown.total);
  return {
    sourceType: "trade_capture",
    sourceId: input.tradeId,
    eventKey: "capture",
    description: `Buy fill captured on trade ${input.tradeId}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "debit", amount: money(gross.plus(fees)), memo: "Client charged consideration and fees", clientAccountId: input.clientAccountId, instrumentId: input.instrumentId },
      { role: LEDGER_ROLES.settlementPayable, side: "credit", amount: gross, memo: "Consideration owed to the exchange", instrumentId: input.instrumentId },
      ...feeCreditLines(input.breakdown, `on trade ${input.tradeId}`),
    ],
  };
}

/**
 * E5. A sell fill. Gross proceeds become receivable from the exchange; the
 * client is credited net of fees, into the unsettled bucket, because the cash
 * has not arrived yet.
 */
export function sellFillCaptured(input: {
  tradeId: string;
  clientAccountId: string;
  instrumentId: string;
  gross: DecimalValue;
  breakdown: JournalFeeBreakdown;
  valueDate: Date;
}): DraftEntry {
  assertFeeBreakdownSums(input.breakdown);
  const gross = money(input.gross);
  const fees = money(input.breakdown.total);
  const netToClient = money(gross.minus(fees));
  if (netToClient.lt(0)) {
    throw new JournalBalanceError("Sell fees cannot exceed the gross proceeds of the fill.");
  }
  return {
    sourceType: "trade_capture",
    sourceId: input.tradeId,
    eventKey: "capture",
    description: `Sell fill captured on trade ${input.tradeId}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.settlementReceivable, side: "debit", amount: gross, memo: "Proceeds receivable from the exchange", instrumentId: input.instrumentId },
      { role: LEDGER_ROLES.clientMoneyPayableUnsettled, side: "credit", amount: netToClient, memo: "Net proceeds owed to the client on settlement", clientAccountId: input.clientAccountId, instrumentId: input.instrumentId },
      ...feeCreditLines(input.breakdown, `on trade ${input.tradeId}`),
    ],
  };
}

/** E6. Buy settlement: the exchange obligation is discharged out of the pool. */
export function buySettlementConfirmed(input: {
  settlementId: string;
  tradeId: string;
  pooledBankAccountId: string | null;
  gross: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const gross = money(input.gross);
  return {
    sourceType: "settlement",
    sourceId: input.settlementId,
    eventKey: "confirm",
    description: `Buy settlement confirmed for trade ${input.tradeId}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.settlementPayable, side: "debit", amount: gross, memo: "Exchange obligation settled" },
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "credit", amount: gross, memo: "Settlement paid from the pooled account", pooledBankAccountId: input.pooledBankAccountId },
    ],
  };
}

/**
 * E7. Sell settlement: cash lands in the pool, the receivable clears, and the
 * client's proceeds move from unsettled to settled and withdrawable.
 */
export function sellSettlementConfirmed(input: {
  settlementId: string;
  tradeId: string;
  clientAccountId: string;
  pooledBankAccountId: string | null;
  gross: DecimalValue;
  netToClient: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const gross = money(input.gross);
  const netToClient = money(input.netToClient);
  return {
    sourceType: "settlement",
    sourceId: input.settlementId,
    eventKey: "confirm",
    description: `Sell settlement confirmed for trade ${input.tradeId}`,
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: gross, memo: "Settlement proceeds received", pooledBankAccountId: input.pooledBankAccountId },
      { role: LEDGER_ROLES.clientMoneyPayableUnsettled, side: "debit", amount: netToClient, memo: "Unsettled proceeds released", clientAccountId: input.clientAccountId },
      { role: LEDGER_ROLES.settlementReceivable, side: "credit", amount: gross, memo: "Exchange receivable cleared" },
      { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: netToClient, memo: "Proceeds now withdrawable", clientAccountId: input.clientAccountId },
    ],
  };
}

/** E8. A collected levy paid over to ECMA, ESX, or the CSD. */
export function feeRemitted(input: {
  remittanceId: string;
  payee: "ecma" | "esx" | "csd";
  amount: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const payableRole =
    input.payee === "ecma" ? LEDGER_ROLES.ecmaLevyPayable : input.payee === "esx" ? LEDGER_ROLES.esxFeePayable : LEDGER_ROLES.csdFeePayable;
  const amount = money(input.amount);
  return {
    sourceType: "fee_remittance",
    sourceId: input.remittanceId,
    eventKey: "pay",
    description: `Levy remitted to ${input.payee.toUpperCase()}`,
    valueDate: input.valueDate,
    lines: [
      { role: payableRole, side: "debit", amount, memo: `${input.payee.toUpperCase()} liability settled` },
      { role: LEDGER_ROLES.brokerOperatingBank, side: "credit", amount, memo: `Payment to ${input.payee.toUpperCase()}` },
    ],
  };
}

/** E9. Earned commission moved out of segregated client money. */
export function brokerFeesSwept(input: {
  sweepId: string;
  pooledBankAccountId: string;
  amount: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "fee_sweep",
    sourceId: input.sweepId,
    eventKey: "sweep",
    description: "Earned brokerage swept to the operating account",
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.brokerOperatingBank, side: "debit", amount, memo: "Brokerage received" },
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "credit", amount, memo: "Earned fees removed from segregated money", pooledBankAccountId: input.pooledBankAccountId },
    ],
  };
}

/** E10. The broker funds a shortfall in the segregated pool from its own cash. */
export function clientMoneyFunded(input: {
  fundingId: string;
  pooledBankAccountId: string;
  amount: DecimalValue;
  valueDate: Date;
}): DraftEntry {
  const amount = money(input.amount);
  return {
    sourceType: "client_money_funding",
    sourceId: input.fundingId,
    eventKey: "fund",
    description: "Client money shortfall funded by the broker",
    valueDate: input.valueDate,
    lines: [
      { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount, memo: "Segregated account topped up", pooledBankAccountId: input.pooledBankAccountId },
      { role: LEDGER_ROLES.brokerOperatingBank, side: "credit", amount, memo: "Funded from broker operating cash" },
    ],
  };
}

/** E13. The single dated entry that opens a broker's books at cutover. */
export function openingBalance(input: { brokerId: string; lines: DraftLine[]; valueDate: Date }): DraftEntry {
  return {
    sourceType: "opening_balance",
    sourceId: input.brokerId,
    eventKey: "cutover",
    description: "Opening balances at general ledger cutover",
    valueDate: input.valueDate,
    lines: input.lines,
  };
}

/**
 * E12. The only free-form entry in the system. It exists for statement imports
 * and genuine corrections, is gated by maker-checker, and always carries a
 * reason. It is not a voucher desk: nothing routine reaches it.
 */
export function manualCorrection(input: {
  correctionId: string;
  lines: DraftLine[];
  description: string;
  valueDate: Date;
}): DraftEntry {
  return {
    sourceType: "manual_correction",
    sourceId: input.correctionId,
    eventKey: "correct",
    description: input.description,
    valueDate: input.valueDate,
    lines: input.lines,
  };
}
