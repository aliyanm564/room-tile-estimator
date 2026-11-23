import type { Dimension, Range } from "@/types";
import { CalcError } from "./errors";

/** Normalise an exact value or {low, high} into a Range, rejecting non-positive / invalid values. */
export function toRange(d: Dimension, label = "Measurement"): Range {
  const r = typeof d === "number" ? { low: d, high: d } : { low: d.low, high: d.high };
  if (!Number.isFinite(r.low) || !Number.isFinite(r.high)) {
    throw new CalcError(`${label} must be a number.`);
  }
  if (r.low <= 0 || r.high <= 0) {
    throw new CalcError(`${label} must be greater than zero.`);
  }
  if (r.low > r.high) {
    throw new CalcError(`${label}: the low value can't be bigger than the high value.`);
  }
  return r;
}

export const exact = (n: number): Range => ({ low: n, high: n });

export const isExact = (r: Range): boolean => r.low === r.high;

export const addRanges = (a: Range, b: Range): Range => ({
  low: a.low + b.low,
  high: a.high + b.high,
});

/** Worst/best case subtraction: low = a.low − b.high, high = a.high − b.low. */
export const subtractRanges = (a: Range, b: Range): Range => ({
  low: a.low - b.high,
  high: a.high - b.low,
});

/** Multiply two positive ranges. */
export const multiplyRanges = (a: Range, b: Range): Range => ({
  low: a.low * b.low,
  high: a.high * b.high,
});

/** Apply a non-decreasing function to both ends. */
export const mapRange = (r: Range, f: (n: number) => number): Range => ({
  low: f(r.low),
  high: f(r.high),
});

export const sumRanges = (rs: Range[]): Range => rs.reduce(addRanges, exact(0));
