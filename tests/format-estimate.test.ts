import { describe, expect, it } from "vitest";
import { formatCostRange, formatCurrency, formatHalfFeet, formatHeadlineDims, formatLength, formatLengthRange } from "@/lib/format";

describe("estimate display formatting", () => {
  it("cost range rounds to the nearest $10; headline cost keeps cents", () => {
    expect(formatCostRange({ low: 653.94, high: 1006.06 })).toBe("$650 – $1,010");
    // Rounded OUTWARD: a headline of $768.60 (= the low end) must not sit below "Likely $770 – …".
    expect(formatCostRange({ low: 768.6, high: 878.4 })).toBe("$760 – $880");
    expect(formatCostRange({ low: 1540, high: 1650 })).toBe("$1,540 – $1,650"); // exact multiples stay put
    expect(formatCostRange({ low: 700, high: 700 })).toBe("$700");
    expect(formatCurrency(768.6)).toBe("$768.60");
  });

  it("headline dims round to the nearest half foot / 0.1 m", () => {
    expect(formatHeadlineDims(12.47, 9.02, "imperial")).toBe("About 12½ × 9 ft");
    expect(formatHeadlineDims(12.5, 9.24, "imperial")).toBe("About 12½ × 9 ft");
    expect(formatHeadlineDims(12.75, 9.26, "imperial")).toBe("About 13 × 9½ ft"); // .75 → next whole
    expect(formatHeadlineDims(11.74, 10, "imperial")).toBe("About 11½ × 10 ft");
    expect(formatHeadlineDims(12.47, 9.02, "metric")).toBe("About 3.8 × 2.7 m");
  });

  it("half feet edge cases", () => {
    expect(formatHalfFeet(0.3)).toBe("½");
    expect(formatHalfFeet(0.2)).toBe("0");
    expect(formatHalfFeet(9.99)).toBe("10");
  });

  it("lengths in feet + inches, carrying 12 inches", () => {
    expect(formatLength(12.47, "imperial")).toBe("12 ft 6 in");
    expect(formatLength(9, "imperial")).toBe("9 ft");
    expect(formatLength(9.99, "imperial")).toBe("10 ft");
    expect(formatLength(12.47, "metric")).toBe("3.8 m");
    expect(formatLengthRange({ low: 8.5, high: 9.5 }, "imperial")).toBe("8 ft 6 in – 9 ft 6 in");
  });
});
