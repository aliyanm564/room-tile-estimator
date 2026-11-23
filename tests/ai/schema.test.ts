import { describe, expect, it } from "vitest";
import { estimateRoom } from "@/lib/calc/estimate";
import { toCalcRect, validateModelOutput } from "@/lib/ai/schema";
import { product, room, settings } from "../fixtures";
import { validOutput } from "../helpers/images";

const r = (low: number, likely: number, high: number) => ({ low, likely, high });

function errorsFor(raw: unknown, photos = 2) {
  const v = validateModelOutput(raw, photos);
  return v.success ? [] : v.errors;
}

describe("validateModelOutput", () => {
  it("accepts valid output", () => {
    const v = validateModelOutput(validOutput(), 2);
    expect(v.success).toBe(true);
  });

  it("accepts an L-shape with 2 sections and an unusable result with issues", () => {
    const l = validOutput({
      shape: "l_shape",
      sections: [
        { lengthFt: r(14, 15, 16), widthFt: r(11, 12, 13) },
        { lengthFt: r(7, 8, 9), widthFt: r(5, 6, 7) },
      ],
    });
    expect(errorsFor(l)).toEqual([]);
    const unusable = validOutput({
      usable: false,
      sections: [],
      confidence: "low",
      issues: [{ code: "too_dark", message: "Too dark to see the floor.", photoIndex: 1 }],
    });
    expect(errorsFor(unusable)).toEqual([]);
  });

  it("rejects low > high and likely outside the range", () => {
    expect(errorsFor(validOutput({ sections: [{ lengthFt: r(13, 12, 11), widthFt: r(9, 10, 11) }] }))).toEqual([
      "sections.0.lengthFt: must satisfy low ≤ likely ≤ high (got 13, 12, 11)",
    ]);
    expect(errorsFor(validOutput({ sections: [{ lengthFt: r(11, 14, 13), widthFt: r(9, 10, 11) }] }))).toHaveLength(1);
  });

  it("rejects zero / negative dimensions, including obstacles", () => {
    const e = errorsFor(
      validOutput({
        sections: [{ lengthFt: r(0, 12, 13), widthFt: r(9, 10, 11) }],
        obstacles: [{ label: "island", lengthFt: r(-1, 6, 7), widthFt: r(3, 3, 3) }],
      }),
    );
    expect(e).toHaveLength(2);
    expect(e[1]).toMatch(/^obstacles\.0\.lengthFt/);
  });

  it("rejects section counts that don't match the shape", () => {
    expect(errorsFor(validOutput({ shape: "l_shape" }))[0]).toMatch(/l_shape.*exactly 2/);
    expect(errorsFor(validOutput({ shape: "rectangle", sections: [] }))[0]).toMatch(/rectangle.*exactly 1/);
  });

  it("rejects unusable results without an explanation", () => {
    expect(errorsFor(validOutput({ usable: false, sections: [], issues: [] }))[0]).toMatch(/at least one issue/);
  });

  it("rejects more than 3 notes and photo indexes out of range", () => {
    expect(errorsFor(validOutput({ notes: ["a", "b", "c", "d"] }))[0]).toMatch(/at most 3 notes/);
    const e = errorsFor(
      validOutput({
        issues: [{ code: "blurry", message: "x", photoIndex: 3 }],
        scaleReferences: [{ object: "door", assumedSize: "80 in", photoIndex: 0 }],
      }),
      2,
    );
    expect(e).toHaveLength(2);
    expect(e.join()).toMatch(/1 to 2/);
  });

  it("rejects wrong structure (bad enum, missing field, wrong type)", () => {
    expect(errorsFor({ ...validOutput(), shape: "circle" }).length).toBeGreaterThan(0);
    const missing: Partial<ReturnType<typeof validOutput>> = validOutput();
    delete missing.roomType;
    expect(errorsFor(missing).length).toBeGreaterThan(0);
    expect(errorsFor({ ...validOutput(), usable: "yes" }).length).toBeGreaterThan(0);
    expect(errorsFor({ ...validOutput(), issues: [{ code: "ultra_wide_lens", message: "x", photoIndex: 1 }] }).length).toBeGreaterThan(0); // app-only code
  });
});

describe("mapping onto the calculator", () => {
  it("sections and obstacles map onto calc Rects and feed estimateRoom", () => {
    const out = validOutput({
      obstacles: [{ label: "built-in desk", lengthFt: r(4, 5, 6), widthFt: r(2, 2, 2) }],
    });
    const result = estimateRoom(
      room({ sections: out.sections.map(toCalcRect), obstacles: out.obstacles.map(toCalcRect) }),
      product,
      settings,
    );
    expect(result.isRange).toBe(true);
    expect(result.areaSqft.low).toBeCloseTo(11 * 9.5 - 6 * 2, 10);
    expect(result.areaSqft.high).toBeCloseTo(13 * 10.5 - 4 * 2, 10);
  });
});
