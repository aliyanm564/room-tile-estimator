import { describe, expect, it } from "vitest";
import {
  feetAndInchesToFeet,
  feetToMeters,
  metersToFeet,
  pricePerSqftToPerSqm,
  pricePerSqmToPerSqft,
  sqftToSqm,
  sqmToSqft,
  toFeet,
} from "@/lib/calc/units";

describe("units", () => {
  it("converts feet, inches and metres", () => {
    expect(toFeet(24, "in")).toBe(2);
    expect(toFeet(3, "ft")).toBe(3);
    expect(feetToMeters(10)).toBeCloseTo(3.048, 12);
    expect(metersToFeet(3.048)).toBeCloseTo(10, 12);
    expect(feetAndInchesToFeet(12, 6)).toBe(12.5);
  });

  it("converts sq ft ↔ m² round trip", () => {
    expect(sqftToSqm(100)).toBeCloseTo(9.290304, 12);
    expect(sqmToSqft(sqftToSqm(123.45))).toBeCloseTo(123.45, 10);
  });

  it("converts prices per area", () => {
    expect(pricePerSqftToPerSqm(pricePerSqmToPerSqft(50))).toBeCloseTo(50, 10);
    // $1/sq ft ≈ $10.76/m²
    expect(pricePerSqftToPerSqm(1)).toBeCloseTo(10.7639, 4);
  });
});
