import { describe, expect, it } from "vitest";
import { CalcError } from "@/lib/calc/errors";
import { approxPlanks, boxesNeeded, purchasedSqft, sqftNeeded } from "@/lib/calc/flooring";
import { exact } from "@/lib/calc/range";

describe("flooring quantities", () => {
  it("applies waste", () => {
    expect(sqftNeeded(exact(100), 0.1).low).toBeCloseTo(110, 10);
    expect(sqftNeeded(exact(100), 0.15).low).toBeCloseTo(115, 10);
    expect(sqftNeeded(exact(100), 0).low).toBe(100);
  });

  it("boxes round up", () => {
    expect(boxesNeeded(exact(101), 20)).toEqual({ low: 6, high: 6 });
    expect(boxesNeeded(exact(100.01), 20).low).toBe(6);
  });

  it("an exact box multiple doesn't over-buy (even with float noise)", () => {
    expect(boxesNeeded(exact(100), 20).low).toBe(5);
    // 100 × 1.1 = 110.00000000000001 in floating point
    const needed = sqftNeeded(exact(100), 0.1);
    expect(boxesNeeded(needed, 22).low).toBe(5);
  });

  it("purchased sq ft = boxes × sqftPerBox", () => {
    expect(purchasedSqft({ low: 5, high: 7 }, 20)).toEqual({ low: 100, high: 140 });
  });

  it("approximate planks for fixed lengths, null for random lengths", () => {
    // 5" × 48" = 1.6667 sq ft/plank → 110 / 1.6667 = 66
    expect(approxPlanks(exact(110), 5, 48, false)).toEqual({ low: 66, high: 66 });
    expect(approxPlanks(exact(110), 3.25, null, true)).toBeNull();
    expect(approxPlanks(exact(110), 3.25, 84, true)).toBeNull();
  });

  it("rejects bad box size and waste", () => {
    expect(() => boxesNeeded(exact(100), 0)).toThrow(CalcError);
    expect(() => sqftNeeded(exact(100), -0.1)).toThrow(CalcError);
  });
});
