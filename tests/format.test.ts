import { describe, expect, it } from "vitest";
import { formatArea, formatCurrency, formatNumber, formatRange } from "@/lib/format";

describe("format", () => {
  it("hides floating-point artifacts", () => {
    expect(formatNumber(0.1 + 0.2, 2)).toBe("0.3");
    expect(formatNumber(110.00000000000001, 1)).toBe("110");
    expect(formatCurrency(699.9999999)).toBe("$700.00");
  });

  it("collapses ranges that round to the same value", () => {
    expect(formatRange({ low: 110, high: 110.2 })).toBe("110");
    expect(formatRange({ low: 6, high: 8 })).toBe("6 – 8");
  });

  it("formats area in either unit system", () => {
    expect(formatArea({ low: 100, high: 100 }, "imperial")).toBe("100 sq ft");
    expect(formatArea({ low: 100, high: 100 }, "metric")).toBe("9.3 m²");
  });
});
