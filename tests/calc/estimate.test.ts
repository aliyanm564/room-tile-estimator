import { describe, expect, it } from "vitest";
import { CalcError } from "@/lib/calc/errors";
import { estimateRoom } from "@/lib/calc/estimate";
import { feetToMeters } from "@/lib/calc/units";
import { product, room, settings, verifiedProduct } from "../fixtures";

describe("estimateRoom", () => {
  it("simple 12×10 rectangle, straight layout", () => {
    const r = estimateRoom(room({ sections: [{ length: 12, width: 10 }] }), product, settings);
    expect(r.areaSqft.low).toBe(120);
    expect(r.sqftNeeded.low).toBeCloseTo(132, 10);
    expect(r.boxes.low).toBe(7); // 132 / 20 = 6.6 → 7
    expect(r.purchasedSqft.low).toBe(140);
    expect(r.cost.low).toBe(700); // pay for whole boxes: 140 × $5
    expect(r.isRange).toBe(false);
  });

  it.each([
    ["straight", 0.1, 110],
    ["diagonal", 0.15, 115],
    ["herringbone", 0.15, 115],
  ] as const)("waste for %s layout is %d", (layout, waste, needed) => {
    const r = estimateRoom(room({ layout }), product, settings);
    expect(r.wasteFactor).toBe(waste);
    expect(r.sqftNeeded.low).toBeCloseTo(needed, 10);
  });

  it("L-shaped room with an island", () => {
    const r = estimateRoom(
      room({
        sections: [
          { length: 15, width: 12 },
          { length: 8, width: 6 },
        ],
        obstacles: [{ length: 6, width: 3 }],
      }),
      product,
      settings,
    );
    expect(r.grossAreaSqft.low).toBe(228);
    expect(r.areaSqft.low).toBe(210);
    expect(r.boxes.low).toBe(12); // 231 / 20 = 11.55 → 12
  });

  it("metric input matches the equivalent imperial result", () => {
    const imperial = estimateRoom(room({ sections: [{ length: 12, width: 10 }] }), product, settings);
    const metric = estimateRoom(
      room({ unit: "m", sections: [{ length: feetToMeters(12), width: feetToMeters(10) }] }),
      product,
      settings,
    );
    expect(metric.areaSqft.low).toBeCloseTo(imperial.areaSqft.low, 9);
    expect(metric.boxes).toEqual(imperial.boxes);
    expect(metric.cost.low).toBeCloseTo(imperial.cost.low, 9);
  });

  it("inch input matches feet", () => {
    const r = estimateRoom(room({ unit: "in", sections: [{ length: 144, width: 120 }] }), product, settings);
    expect(r.areaSqft.low).toBeCloseTo(120, 10);
  });

  it("range input gives low ≤ high on every output", () => {
    const r = estimateRoom(
      room({ sections: [{ length: { low: 11, high: 13 }, width: { low: 9.5, high: 10.5 } }] }),
      product,
      settings,
    );
    expect(r.isRange).toBe(true);
    for (const key of ["areaSqft", "sqftNeeded", "boxes", "purchasedSqft", "cost"] as const) {
      expect(r[key].low).toBeLessThanOrEqual(r[key].high);
    }
    expect(r.boxes.low).toBeLessThan(r.boxes.high);
    expect(r.approxPlanks!.low).toBeLessThanOrEqual(r.approxPlanks!.high);
  });

  it("price override replaces the catalog price", () => {
    const r = estimateRoom(room({ priceOverridePerSqft: 7.25 }), product, settings);
    expect(r.pricePerSqft).toBe(7.25);
    expect(r.priceSource).toBe("user");
    expect(r.cost.low).toBeCloseTo(r.purchasedSqft.low * 7.25, 10);
  });

  it("flags placeholder vs verified catalog prices", () => {
    expect(estimateRoom(room(), product, settings).priceSource).toBe("placeholder");
    const v = estimateRoom(room({ productId: verifiedProduct.id }), verifiedProduct, settings);
    expect(v.priceSource).toBe("catalog");
    // an unverified price from a real store is still flagged
    const unverified = { ...verifiedProduct, verified: false };
    expect(estimateRoom(room({ productId: unverified.id }), unverified, settings).priceSource).toBe(
      "placeholder",
    );
  });

  it("rejects invalid inputs", () => {
    expect(() => estimateRoom(room({ sections: [{ length: 0, width: 10 }] }), product, settings)).toThrow(
      CalcError,
    );
    expect(() => estimateRoom(room({ priceOverridePerSqft: 0 }), product, settings)).toThrow(CalcError);
    expect(() => estimateRoom(room({ priceOverridePerSqft: -3 }), product, settings)).toThrow(CalcError);
    expect(() => estimateRoom(room({ productId: "other" }), product, settings)).toThrow(CalcError);
    expect(() =>
      estimateRoom(room({ obstacles: [{ length: 20, width: 20 }] }), product, settings),
    ).toThrow(CalcError);
  });

  it("keeps full precision internally (no premature rounding)", () => {
    const r = estimateRoom(room({ sections: [{ length: 10.1, width: 10.1 }] }), product, settings);
    expect(r.areaSqft.low).toBeCloseTo(102.01, 10);
  });
});
