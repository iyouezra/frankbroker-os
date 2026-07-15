export type OrderSide = "buy" | "sell";

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

export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}
