import type { Dimension, Range, ResultRange } from "@/types";
import { CalcError } from "./errors";

/** The best estimate of a range: its likely value, or the midpoint if none was given. */
export const likelyOf = (r: Range): number => r.likely ?? (r.low + r.high) / 2;

/**
 * Normalise an exact value or {low, likely?, high} into a ResultRange, rejecting non-positive /
 * invalid values. Exact numbers get low = likely = high; a range without likely gets its midpoint.
 */
export function toRange(d: Dimension, label = "Measurement"): ResultRange {
  const low = typeof d === "number" ? d : d.low;
  const high = typeof d === "number" ? d : d.high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new CalcError(`${label} must be a number.`);
  }
  if (low <= 0 || high <= 0) {
    throw new CalcError(`${label} must be greater than zero.`);
  }
  if (low > high) {
    throw new CalcError(`${label}: the low value can't be bigger than the high value.`);
  }
  const likely = typeof d === "number" ? d : likelyOf(d);
  if (!Number.isFinite(likely) || likely < low || likely > high) {
    throw new CalcError(`${label}: the likely value must be between the low and high values.`);
  }
  return { low, likely, high };
}

export const exact = (n: number): ResultRange => ({ low: n, likely: n, high: n });

export const isExact = (r: Range): boolean => r.low === r.high;

export const addRanges = (a: Range, b: Range): ResultRange => ({
  low: a.low + b.low,
  likely: likelyOf(a) + likelyOf(b),
  high: a.high + b.high,
});

/** Worst/best case subtraction: low = a.low − b.high, high = a.high − b.low. */
export const subtractRanges = (a: Range, b: Range): ResultRange => ({
  low: a.low - b.high,
  likely: likelyOf(a) - likelyOf(b),
  high: a.high - b.low,
});

/** Multiply two positive ranges. */
export const multiplyRanges = (a: Range, b: Range): ResultRange => ({
  low: a.low * b.low,
  likely: likelyOf(a) * likelyOf(b),
  high: a.high * b.high,
});

/** Apply a non-decreasing function to low, likely and high. */
export const mapRange = (r: Range, f: (n: number) => number): ResultRange => ({
  low: f(r.low),
  likely: f(likelyOf(r)),
  high: f(r.high),
});

export const sumRanges = (rs: Range[]): ResultRange => rs.reduce<ResultRange>(addRanges, exact(0));
