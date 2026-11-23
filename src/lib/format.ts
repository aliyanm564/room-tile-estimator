// Display formatting. The ONLY place numbers get rounded — calc keeps full precision.
import type { PriceSource, Range, UnitSystem } from "@/types";
import { sqftToSqm } from "./calc/units";

export function formatNumber(n: number, maxDecimals = 0): string {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatCurrency(n: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n);
}

/** "120" for an exact value, "110 – 130" for a range (compared after rounding). */
export function formatRange(r: Range, fmt: (n: number) => string = (n) => formatNumber(n)): string {
  const lo = fmt(r.low);
  const hi = fmt(r.high);
  return lo === hi ? lo : `${lo} – ${hi}`;
}

export function formatArea(sqft: Range, units: UnitSystem): string {
  return units === "metric"
    ? `${formatRange({ low: sqftToSqm(sqft.low), high: sqftToSqm(sqft.high) }, (n) => formatNumber(n, 1))} m²`
    : `${formatRange(sqft, (n) => formatNumber(n, 1))} sq ft`;
}

export function formatPercent(fraction: number): string {
  return `${formatNumber(fraction * 100, 1)}%`;
}

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  user: "Your price",
  catalog: "Catalog price",
  placeholder: "Placeholder price — not a real quote, enter your own",
};
