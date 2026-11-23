// Display formatting. The ONLY place numbers get rounded — calc keeps full precision.
import type { PriceSource, Range, UnitSystem } from "@/types";
import { feetToMeters, sqftToSqm } from "./calc/units";

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

/** A single area value (e.g. the likely headline). */
export function formatAreaValue(sqft: number, units: UnitSystem): string {
  return units === "metric" ? `${formatNumber(sqftToSqm(sqft), 1)} m²` : `${formatNumber(sqft, 0)} sq ft`;
}

/**
 * Cost range for display in $10 steps, rounded OUTWARD (low down, high up) so the headline cost
 * (to the cent) always sits inside the range shown under it.
 */
export function formatCostRange(r: Range, currency = "CAD"): string {
  const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const low = Math.floor(r.low / 10 + 1e-9) * 10;
  const high = Math.ceil(r.high / 10 - 1e-9) * 10;
  return low === high ? fmt(low) : `${fmt(low)} – ${fmt(high)}`;
}

/** One length: imperial as feet + inches (nearest inch, 12" carried), metric in metres. */
export function formatLength(ft: number, units: UnitSystem): string {
  if (units === "metric") return `${formatNumber(feetToMeters(ft), 2)} m`;
  const totalIn = Math.round(ft * 12);
  const f = Math.floor(totalIn / 12);
  const i = totalIn - f * 12;
  return i === 0 ? `${f} ft` : `${f} ft ${i} in`;
}

export function formatLengthRange(r: Range, units: UnitSystem): string {
  return formatRange(r, (n) => formatLength(n, units));
}

/** Feet to the nearest half foot, with a ½ glyph: 12.47 → "12½", 9.02 → "9", 0.3 → "½". */
export function formatHalfFeet(ft: number): string {
  const halves = Math.round(ft * 2);
  const whole = Math.floor(halves / 2);
  if (halves % 2 === 0) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

/** Headline "About 12½ × 9 ft" (nearest half foot) or "About 3.8 × 2.7 m" (nearest 0.1 m). */
export function formatHeadlineDims(longerFt: number, shorterFt: number, units: UnitSystem): string {
  return units === "metric"
    ? `About ${formatNumber(feetToMeters(longerFt), 1)} × ${formatNumber(feetToMeters(shorterFt), 1)} m`
    : `About ${formatHalfFeet(longerFt)} × ${formatHalfFeet(shorterFt)} ft`;
}

export function formatPercent(fraction: number): string {
  return `${formatNumber(fraction * 100, 1)}%`;
}

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  user: "Your price",
  catalog: "Catalog price",
  placeholder: "Placeholder price — not a real quote, enter your own",
};
