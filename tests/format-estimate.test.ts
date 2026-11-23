import { describe, expect, it } from "vitest";
import { formatCostRange, formatCurrency, formatHeadlineDims, formatLength, formatLengthRange } from "@/lib/format";

describe("estimate display formatting", () => {
  it("cost range rounds to the nearest $10; headline cost keeps cents", () => {
    expect(formatCostRange({ low: 653.94, high: 1006.06 })).toBe("$650 – $1,010");
    expect(formatCurrency(768.6)).toBe("$768.60");
  });

  it("headline dims round to the nearest foot / 0.1 m", () => {
    expect(formatHeadlineDims(12.47, 9.02, "imperial")).toBe("About 12 × 9 ft");
    expect(formatHeadlineDims(12.47, 9.02, "metric")).toBe("About 3.8 × 2.7 m");
  });

  it("lengths in feet + inches, carrying 12 inches", () => {
    expect(formatLength(12.47, "imperial")).toBe("12 ft 6 in");
    expect(formatLength(9, "imperial")).toBe("9 ft");
    expect(formatLength(9.99, "imperial")).toBe("10 ft");
    expect(formatLength(12.47, "metric")).toBe("3.8 m");
    expect(formatLengthRange({ low: 8.5, high: 9.5 }, "imperial")).toBe("8 ft 6 in – 9 ft 6 in");
  });
});
