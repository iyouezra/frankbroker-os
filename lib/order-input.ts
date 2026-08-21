import { addisBusinessDate } from "./addis-date";

export type OrderSide = "buy" | "sell";
export type OrderValidity = "day" | "gtc" | "gtd";

export const ORDER_VALIDITIES: OrderValidity[] = ["day", "gtc", "gtd"];

export function parseOrderSide(value: unknown): OrderSide | null {
  return value === "buy" || value === "sell" ? value : null;
}

export function parsePositiveFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeOrderType(value: unknown, fallback = "limit") {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function normalizeOrderValidity(value: unknown, fallback: OrderValidity = "day"): OrderValidity | null {
  const normalized = String(value ?? fallback).trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "day") return "day";
  if (["gtc", "good_till_cancelled", "good_till_canceled"].includes(normalized)) return "gtc";
  if (["gtd", "good_till_date"].includes(normalized)) return "gtd";
  return null;
}

export function parseOrderValidity(input: { validity?: unknown; goodTillDate?: unknown; orderType?: unknown; businessDate?: string }) {
  const validity = normalizeOrderValidity(input.validity);
  if (!validity) throw new Response("Validity must be Day, GTC, or GTD.", { status: 400 });
  const orderType = normalizeOrderType(input.orderType);
  if (orderType === "market" && validity !== "day") {
    throw new Response("Market orders must use Day validity. Use a Limit or Stop-loss order for GTC or GTD.", { status: 400 });
  }
  const suppliedDate = input.goodTillDate === undefined || input.goodTillDate === null || input.goodTillDate === ""
    ? null
    : parseDateOnly(input.goodTillDate);
  if (input.goodTillDate && !suppliedDate) throw new Response("GTD requires a valid calendar date.", { status: 400 });
  if (validity !== "gtd" && suppliedDate) throw new Response("A good-till date can only be supplied for GTD orders.", { status: 400 });
  if (validity === "gtd" && !suppliedDate) throw new Response("Choose an expiry date for the GTD order.", { status: 400 });
  const businessDate = input.businessDate ?? addisBusinessDate();
  if (suppliedDate && suppliedDate <= businessDate) throw new Response("The GTD expiry date must be after the current business date.", { status: 400 });
  if (suppliedDate) {
    const maximum = new Date(`${businessDate}T00:00:00.000Z`);
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    if (suppliedDate > maximum.toISOString().slice(0, 10)) throw new Response("The GTD expiry date cannot be more than one year ahead.", { status: 400 });
  }
  return { validity, goodTillDate: suppliedDate ? new Date(`${suppliedDate}T00:00:00.000Z`) : null };
}

export function orderValidityExpired(input: { validity: unknown; goodTillDate?: Date | null; submittedAt?: Date | null; now?: Date }) {
  const validity = normalizeOrderValidity(input.validity);
  const currentDate = addisBusinessDate(input.now ?? new Date());
  if (validity === "gtc") return false;
  if (validity === "gtd") return !input.goodTillDate || currentDate > input.goodTillDate.toISOString().slice(0, 10);
  return Boolean(input.submittedAt && currentDate > addisBusinessDate(input.submittedAt));
}

export function orderValidityLabel(validity: unknown, goodTillDate?: string | Date | null) {
  const normalized = normalizeOrderValidity(validity) ?? "day";
  if (normalized === "day") return "Day";
  if (normalized === "gtc") return "GTC";
  const date = goodTillDate instanceof Date ? goodTillDate.toISOString().slice(0, 10) : goodTillDate;
  return date ? `GTD · ${date}` : "GTD";
}

export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}
