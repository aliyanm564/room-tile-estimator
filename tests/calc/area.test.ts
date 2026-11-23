import { describe, expect, it } from "vitest";
import { roomAreaSqft } from "@/lib/calc/area";
import { CalcError } from "@/lib/calc/errors";

describe("roomAreaSqft", () => {
  it("simple rectangle", () => {
    const a = roomAreaSqft([{ length: 12, width: 10 }], [], "ft");
    expect(a.net).toEqual({ low: 120, likely: 120, high: 120 });
  });

  it("L-shaped room = two sections summed", () => {
    // 12×10 main + 6×4 nook
    const a = roomAreaSqft(
      [
        { length: 12, width: 10 },
        { length: 6, width: 4 },
      ],
      [],
      "ft",
    );
    expect(a.gross.low).toBe(144);
    expect(a.net.low).toBe(144);
  });

  it("subtracts obstacles", () => {
    const a = roomAreaSqft([{ length: 20, width: 15 }], [{ length: 8, width: 4 }], "ft");
    expect(a.obstacles.low).toBe(32);
    expect(a.net).toEqual({ low: 268, likely: 268, high: 268 });
  });

  it("range dimensions give low ≤ high, with obstacle ranges subtracted worst-case", () => {
    const a = roomAreaSqft(
      [{ length: { low: 11.5, high: 12.5 }, width: 10 }],
      [{ length: { low: 3, high: 4 }, width: 2 }],
      "ft",
    );
    expect(a.net.low).toBeCloseTo(115 - 8, 10);
    expect(a.net.high).toBeCloseTo(125 - 6, 10);
    expect(a.net.low).toBeLessThanOrEqual(a.net.high);
  });

  it.each([
    [{ length: 0, width: 10 }],
    [{ length: -5, width: 10 }],
    [{ length: 10, width: Number.NaN }],
    [{ length: { low: 12, high: 10 }, width: 10 }],
    [{ length: { low: 0, high: 10 }, width: 10 }],
  ])("rejects invalid dimension %o", (rect) => {
    expect(() => roomAreaSqft([rect], [], "ft")).toThrow(CalcError);
  });

  it("rejects no sections", () => {
    expect(() => roomAreaSqft([], [], "ft")).toThrow(CalcError);
  });

  it("rejects obstacles as large as or larger than the room", () => {
    expect(() => roomAreaSqft([{ length: 10, width: 10 }], [{ length: 10, width: 10 }], "ft")).toThrow(
      /obstacles/i,
    );
    expect(() => roomAreaSqft([{ length: 10, width: 10 }], [{ length: 11, width: 10 }], "ft")).toThrow(
      CalcError,
    );
  });

  it("rejects invalid obstacle dimensions", () => {
    expect(() => roomAreaSqft([{ length: 10, width: 10 }], [{ length: 0, width: 2 }], "ft")).toThrow(
      CalcError,
    );
  });
});
