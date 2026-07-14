import { Prisma } from "../app/generated/prisma/client";
import { FEE_RATE } from "./frank";

/**
 * Server-only monetary helpers. All authoritative cash/price/quantity math and
 * the ledger invariant (`totalCash = availableCash + blockedCash + unsettledCash`)
 * run on `Prisma.Decimal`, never on JavaScript floats. Values are converted back
 * to `number` only at the API boundary via {@link toNum} so the client contract
 * is unchanged. Do not import this file into browser code — use `lib/frank.ts`
 * for the display-only estimate instead.
 */
export type Decimal = Prisma.Decimal;
/** Anything the `Prisma.Decimal` constructor accepts. */
export type DecimalValue = Prisma.Decimal | number | string;

export const D = (value: DecimalValue): Prisma.Decimal => new Prisma.Decimal(value);

export const ZERO = D(0);

/** Serialize a Decimal (or nullable Decimal) to a plain number for JSON responses. */
export function toNum(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

/** Round a monetary amount to 2 decimal places (santim) for storage/comparison. */
export function money(value: DecimalValue): Prisma.Decimal {
  return D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Authoritative consideration for an order or fill. Mirrors the display-only
 * {@link import("./frank").calculateOrderAmounts} but returns exact Decimals and
 * shares the same {@link FEE_RATE} so the two never drift.
 */
export function computeAmounts(side: "buy" | "sell", quantity: DecimalValue, price: DecimalValue, feeRate: DecimalValue = FEE_RATE, minimumFee: DecimalValue = 0) {
  const gross = money(D(quantity).times(price));
  const percentageFee = money(gross.times(feeRate));
  const floor = money(minimumFee);
  const fees = percentageFee.gte(floor) ? percentageFee : floor;
  const net = side === "buy" ? money(gross.plus(fees)) : money(gross.minus(fees));
  return { gross, fees, net };
}
