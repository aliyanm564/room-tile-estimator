import { describe, expect, it } from "vitest";
import { CalcError } from "@/lib/calc/errors";
import { estimateRoom } from "@/lib/calc/estimate";
import { toRange } from "@/lib/calc/range";
import { product, room, settings } from "../fixtures";

const ordered = (r: { low: number; likely: number; high: number }) => r.low <= r.likely && r.likely <= r.high;

describe("likely values", () => {
  it("exact → low = likely = high; range without likely → midpoint", () => {
    expect(toRange(12)).toEqual({ low: 12, likely: 12, high: 12 });
    expect(toRange({ low: 10, high: 14 })).toEqual({ low: 10, likely: 12, high: 14 });
    expect(toRange({ low: 10, likely: 11, high: 14 })).toEqual({ low: 10, likely: 11, high: 14 });
  });

  it("rejects likely outside low..high", () => {
    expect(() => toRange({ low: 10, likely: 15, high: 14 })).toThrow(CalcError);
    expect(() => toRange({ low: 10, likely: 9, high: 14 })).toThrow(CalcError);
  });

  it("headline (likely) numbers flow through the whole calculator, low ≤ likely ≤ high everywhere", () => {
    const r = estimateRoom(
      room({
        sections: [
          { length: { low: 11, likely: 12, high: 13 }, width: { low: 9, likely: 10, high: 11.5 } },
          { length: { low: 2, likely: 3, high: 4 }, width: { low: 2, likely: 2.5, high: 3 } }, // closet
        ],
        obstacles: [{ length: { low: 4, likely: 5, high: 6 }, width: 2 }],
      }),
      product,
      settings,
    );
    // likely area = 12×10 + 3×2.5 − 5×2 = 117.5
    expect(r.areaSqft.likely).toBeCloseTo(117.5, 10);
    expect(r.sqftNeeded.likely).toBeCloseTo(129.25, 10);
    expect(r.boxes.likely).toBe(7); // ceil(129.25 / 20)
    expect(r.purchasedSqft.likely).toBe(140);
    expect(r.cost.likely).toBe(700);
    for (const k of ["grossAreaSqft", "obstacleAreaSqft", "areaSqft", "sqftNeeded", "boxes", "purchasedSqft", "cost"] as const) {
      expect(ordered(r[k]), k).toBe(true);
    }
    expect(ordered(r.approxPlanks!)).toBe(true);
  });

  it("a likely skewed toward the low end stays there (not replaced by the midpoint)", () => {
    const r = estimateRoom(room({ sections: [{ length: { low: 10, likely: 10.5, high: 20 }, width: 10 }] }), product, settings);
    expect(r.areaSqft).toEqual({ low: 100, likely: 105, high: 200 });
  });
});
