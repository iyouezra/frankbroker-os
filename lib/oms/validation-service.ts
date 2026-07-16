import { type Decimal, D } from "../money";

export type ValidationCheck = {
  code: string;
  label: string;
  passed: boolean;
  message: string;
};

export type PreTradeValidationInput = {
  tenantMatches: boolean;
  kycApproved: boolean;
  accountActive: boolean;
  clientActive: boolean;
  instrumentTradable: boolean;
  instrumentEnabled: boolean;
  orderTypeAllowed: boolean;
  quantity: Decimal;
  lotSize: number;
  allowFractional: boolean;
  price: Decimal;
  tickSize: Decimal;
  side: "buy" | "sell";
  requiredCash: Decimal;
  availableCash: Decimal;
  availableHoldings: Decimal;
  projectedDailyGross: Decimal;
  dailyLimit?: Decimal | null;
  sellNet: Decimal;
};

export function validatePreTrade(input: PreTradeValidationInput): ValidationCheck[] {
  const quantityAligned = input.allowFractional || input.quantity.mod(input.lotSize).isZero();
  const priceAligned = input.price.div(input.tickSize).isInteger();
  return [
    { code: "TENANT_OWNERSHIP", label: "Tenant ownership", passed: input.tenantMatches, message: input.tenantMatches ? "Account belongs to this broker" : "Account belongs to another broker" },
    { code: "KYC_APPROVED", label: "KYC approved", passed: input.kycApproved, message: input.kycApproved ? "KYC is current" : "KYC approval is required" },
    { code: "ACCOUNT_ACTIVE", label: "Account active", passed: input.accountActive && input.clientActive, message: input.accountActive && input.clientActive ? "Client and account are active" : "Client or account is not active" },
    { code: "INSTRUMENT_TRADABLE", label: "Instrument tradable", passed: input.instrumentTradable && input.instrumentEnabled, message: input.instrumentTradable && input.instrumentEnabled ? "Instrument is enabled for this tenant" : "Instrument is not tradable for this tenant" },
    { code: "ORDER_TYPE_ALLOWED", label: "Order type enabled", passed: input.orderTypeAllowed, message: input.orderTypeAllowed ? "Order type is enabled" : "Order type is disabled by tenant policy" },
    { code: "QUANTITY_VALID", label: "Quantity valid", passed: input.quantity.gt(0) && quantityAligned, message: input.allowFractional ? "Positive fractional quantities are enabled" : `Must be a positive multiple of ${input.lotSize}` },
    { code: "PRICE_VALID", label: "Price valid", passed: input.price.gt(0) && priceAligned, message: `Must align to the ${input.tickSize.toString()} tick size` },
    input.side === "buy"
      ? { code: "SUFFICIENT_CASH", label: "Sufficient available cash", passed: input.availableCash.gte(input.requiredCash), message: `${input.availableCash.toString()} ETB available including estimated fees` }
      : { code: "SUFFICIENT_HOLDINGS", label: "Sufficient available holdings", passed: input.availableHoldings.gte(input.quantity), message: `${input.availableHoldings.toString()} units available and unblocked` },
    { code: "POSITIVE_SELL_PROCEEDS", label: "Positive net proceeds", passed: input.side === "buy" || input.sellNet.gt(0), message: input.side === "buy" || input.sellNet.gt(0) ? "Estimated proceeds remain positive after fees" : "Fees exceed the estimated sell consideration" },
    { code: "DAILY_LIMIT", label: "Within daily trading limit", passed: !input.dailyLimit || input.projectedDailyGross.lte(input.dailyLimit), message: input.dailyLimit ? `${input.projectedDailyGross.toString()} / ${input.dailyLimit.toString()} ETB used today` : "No daily limit configured" },
  ];
}

export function validationPassed(checks: ValidationCheck[]) {
  return checks.every((check) => check.passed);
}

export function validateExecution(quantity: Decimal, price: Decimal, remaining: Decimal) {
  if (quantity.lte(0)) return "Execution quantity must be positive.";
  if (quantity.gt(remaining)) return `Execution quantity exceeds the remaining ${remaining.toString()} units.`;
  if (price.lte(0)) return "Execution price must be positive.";
  return null;
}

export function weightedAveragePrice(priorQuantity: Decimal, priorAverage: Decimal | null, fillQuantity: Decimal, fillPrice: Decimal) {
  const combined = priorQuantity.plus(fillQuantity);
  if (combined.isZero()) return null;
  return D(priorAverage ?? 0).times(priorQuantity).plus(fillPrice.times(fillQuantity)).div(combined);
}
