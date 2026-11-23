import { describe, expect, it } from "vitest";
import { estimateRoom } from "@/lib/calc/estimate";
import {
  blurLength,
  blurPrice,
  editLength,
  editPrice,
  emptyLength,
  emptyPrice,
  lengthDisplayText,
  parseNumberText,
  switchLengthUnits,
  switchPriceUnits,
  type LengthField,
  type PriceField,
} from "@/lib/measurement-input";
import type { UnitSystem } from "@/types";
import { product, room, settings } from "./fixtures";

/** Type a string one character at a time, as a user would. */
function typeLength(field: LengthField, units: UnitSystem, part: "ft" | "in" | "m", s: string) {
  let f = field;
  for (let i = 1; i <= s.length; i++) {
    f = editLength(f, units, part, s.slice(0, i));
    expect(f.text[part]).toBe(s.slice(0, i)); // never reformatted mid-typing
  }
  return f;
}

function costFor(length: LengthField, width: LengthField, price: PriceField) {
  return estimateRoom(
    room({
      sections: [{ length: length.feet!, width: width.feet! }],
      priceOverridePerSqft: price.perSqft,
    }),
    product,
    settings,
  ).cost.low;
}

describe("parseNumberText", () => {
  it("handles empty, partial and invalid input", () => {
    expect(parseNumberText("")).toBeNull();
    expect(parseNumberText("  ")).toBeNull();
    expect(parseNumberText("3.")).toBe(3);
    expect(parseNumberText(".5")).toBe(0.5);
    expect(parseNumberText("3,5")).toBe(3.5);
    expect(parseNumberText("abc")).toBeNaN();
  });
});

describe("typing keeps the text exactly as typed", () => {
  it("does not round or reformat while typing, and updates the canonical value", () => {
    let f = typeLength(emptyLength(), "metric", "m", "3.6576");
    expect(f.text.m).toBe("3.6576");
    expect(f.feet).toBeCloseTo(12, 10);

    f = typeLength(emptyLength(), "imperial", "ft", "12.50");
    expect(f.text.ft).toBe("12.50");
    expect(f.feet).toBe(12.5);

    // trailing dot / zeros survive mid-typing
    f = editLength(emptyLength(), "metric", "m", "3.");
    expect(f.text.m).toBe("3.");
    f = editLength(f, "metric", "m", "3.0");
    expect(f.text.m).toBe("3.0");
    expect(f.feet).toBeCloseTo(3 / 0.3048, 10);
  });

  it("feet and inches combine into one canonical value", () => {
    let f = editLength(emptyLength(), "imperial", "ft", "12");
    f = editLength(f, "imperial", "in", "6");
    expect(f.feet).toBe(12.5);
    expect(f.text).toMatchObject({ ft: "12", in: "6" });
  });

  it("price text is kept as typed; canonical is per sq ft", () => {
    expect(editPrice("imperial", "6.")).toEqual({ perSqft: 6, text: "6." });
    const m = editPrice("metric", "64.5");
    expect(m.text).toBe("64.5");
    expect(m.perSqft).toBeCloseTo(64.5 * 0.09290304, 12);
  });
});

describe("reformatting on blur / unit switch", () => {
  it("blur tidies the display but keeps the canonical value", () => {
    const typed = editLength(emptyLength(), "imperial", "ft", "12.5");
    const blurred = blurLength(typed, "imperial");
    expect(blurred.text).toMatchObject({ ft: "12", in: "6" });
    expect(blurred.feet).toBe(typed.feet);

    const m = blurLength(editLength(emptyLength(), "metric", "m", "3.6576"), "metric");
    expect(m.text.m).toBe("3.66"); // rounded for display
    expect(m.feet).toBeCloseTo(12, 10); // full precision kept

    expect(blurPrice(editPrice("imperial", "6.499"), "imperial").text).toBe("6.5");
    expect(blurPrice(editPrice("imperial", "6.499"), "imperial").perSqft).toBe(6.499);
  });

  it("blur leaves empty and invalid text alone", () => {
    const bad = editLength(emptyLength(), "metric", "m", "3..5");
    expect(blurLength(bad, "metric")).toEqual(bad);
    expect(blurLength(emptyLength(), "metric")).toEqual(emptyLength());
  });

  it("display carries rounded inches into feet", () => {
    expect(lengthDisplayText(11.999, "imperial")).toMatchObject({ ft: "12", in: "" });
    expect(lengthDisplayText(10 + 11.96 / 12, "imperial")).toMatchObject({ ft: "11", in: "" });
  });

  it("switching units clears unparseable input", () => {
    const bad = editLength(emptyLength(), "imperial", "ft", "twelve");
    expect(switchLengthUnits(bad, "metric")).toEqual(emptyLength());
  });
});

describe("toggling units never changes results", () => {
  it("12 × 10 ft at $6/sq ft stays exactly $840.00 after many toggles", () => {
    let units: UnitSystem = "imperial";
    let length = editLength(emptyLength(), units, "ft", "12");
    let width = editLength(emptyLength(), units, "ft", "10");
    let price = editPrice(units, "6");
    const original = { length: length.feet, width: width.feet, price: price.perSqft };
    expect(costFor(length, width, price)).toBe(840);

    for (let i = 0; i < 7; i++) {
      units = units === "imperial" ? "metric" : "imperial";
      length = switchLengthUnits(length, units);
      width = switchLengthUnits(width, units);
      price = switchPriceUnits(price, units);
      // canonical values are bit-for-bit identical, not just close
      expect(length.feet).toBe(original.length);
      expect(width.feet).toBe(original.width);
      expect(price.perSqft).toBe(original.price);
      expect(costFor(length, width, price)).toBe(840);
    }
    expect(units).toBe("metric"); // odd number of toggles: ends on metric, display rounded
    expect(length.text.m).toBe("3.66");
    expect(price.text).toBe("64.58");
  });

  it("a value typed in metric survives toggles and blurs at full precision", () => {
    let units: UnitSystem = "metric";
    let length = editLength(emptyLength(), units, "m", "3.6576"); // exactly 12 ft
    let width = editLength(emptyLength(), units, "m", "3.048"); // exactly 10 ft
    let price: PriceField = emptyPrice();
    const before = costFor(length, width, price);
    for (let i = 0; i < 6; i++) {
      units = units === "imperial" ? "metric" : "imperial";
      length = blurLength(switchLengthUnits(length, units), units);
      width = blurLength(switchLengthUnits(width, units), units);
      price = switchPriceUnits(price, units);
    }
    expect(costFor(length, width, price)).toBe(before);
    expect(price).toEqual(emptyPrice());
  });
});
