import type { Range, ResultRange } from "@/types";
import { CalcError } from "./errors";
import { mapRange } from "./range";

/**
 * Tolerance for rounding up. 100 × 1.1 = 110.00000000000001 in floating point;
 * without this, an exact box multiple would buy an extra box.
 */
const EPSILON = 1e-9;

export function ceilSafe(n: number): number {
  return Math.ceil(n - EPSILON);
}

function assertPositive(n: number, label: string) {
  if (!Number.isFinite(n) || n <= 0) throw new CalcError(`${label} must be greater than zero.`);
}

/** sqftNeeded = area × (1 + waste). */
export function sqftNeeded(areaSqft: Range, wasteFactor: number): ResultRange {
  if (!Number.isFinite(wasteFactor) || wasteFactor < 0) {
    throw new CalcError("Waste factor must be zero or more.");
  }
  return mapRange(areaSqft, (a) => a * (1 + wasteFactor));
}

/** Whole boxes needed to cover sqftNeeded. */
export function boxesNeeded(needed: Range, sqftPerBox: number): ResultRange {
  assertPositive(sqftPerBox, "Square feet per box");
  return mapRange(needed, (n) => ceilSafe(n / sqftPerBox));
}

/** What you actually buy: boxes × sqftPerBox. */
export function purchasedSqft(boxes: Range, sqftPerBox: number): ResultRange {
  return mapRange(boxes, (b) => b * sqftPerBox);
}

/**
 * Approximate plank count to cover sqftNeeded. Returns null for random-length products
 * (or when the length is unknown), because plank count can't be derived reliably.
 */
export function approxPlanks(
  needed: Range,
  plankWidthIn: number,
  plankLengthIn: number | null,
  randomLengths: boolean,
): ResultRange | null {
  if (randomLengths || plankLengthIn == null) return null;
  assertPositive(plankWidthIn, "Plank width");
  assertPositive(plankLengthIn, "Plank length");
  const plankSqft = (plankWidthIn * plankLengthIn) / 144;
  return mapRange(needed, (n) => ceilSafe(n / plankSqft));
}
