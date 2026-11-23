import { describe, expect, it } from "vitest";
import { estimateRoom } from "@/lib/calc/estimate";
import { normalizeModelOutput, toCalcRect, validateModelOutput, type ModelOutput } from "@/lib/ai/schema";
import { product, room, settings } from "../fixtures";
import { r, sec, validOutput } from "../helpers/images";

function errorsFor(raw: unknown) {
  const v = validateModelOutput(raw);
  return v.success ? [] : v.errors;
}

const closet = sec(r(4, 5, 6), r(2, 2, 2.5), "closet");

describe("validateModelOutput (v2): only unusable output fails", () => {
  it("accepts valid output", () => {
    expect(errorsFor(validOutput())).toEqual([]);
  });

  it("labels: closet and other sections are allowed in addition to the main room, for every shape", () => {
    const nook = sec(r(3, 4, 5), r(3, 3, 4), "other");
    const rect = validOutput({ sections: [sec(r(11, 12, 13), r(9, 10, 11)), closet, nook] });
    const l = validOutput({
      shape: "l_shape",
      sections: [sec(r(14, 15, 16), r(11, 12, 13)), closet, sec(r(7, 8, 9), r(5, 6, 7))],
    });
    const irregular = validOutput({ shape: "irregular", sections: [sec(r(9, 10, 12), r(8, 9, 10)), closet, closet] });
    for (const o of [rect, l, irregular]) expect(errorsFor(o)).toEqual([]);
  });

  it("main-section count must match the shape (closets don't count)", () => {
    expect(errorsFor(validOutput({ sections: [sec(r(11, 12, 13), r(9, 10, 11)), sec(r(5, 6, 7), r(4, 5, 6))] }))[0]).toMatch(
      /rectangle.*exactly 1 "main".*got 2/,
    );
    expect(errorsFor(validOutput({ shape: "l_shape", sections: [sec(r(11, 12, 13), r(9, 10, 11)), closet] }))[0]).toMatch(
      /l_shape.*exactly 2.*got 1/,
    );
    expect(errorsFor(validOutput({ sections: [closet] }))[0]).toMatch(/rectangle.*got 0/);
    expect(errorsFor(validOutput({ shape: "irregular", sections: [closet] }))[0]).toMatch(/at least 1/);
  });

  it("rejects low > high and likely outside the range, on any section or obstacle", () => {
    expect(errorsFor(validOutput({ sections: [sec(r(13, 12, 11), r(9, 10, 11))] }))).toEqual([
      "sections.0.lengthFt: must satisfy low ≤ likely ≤ high (got 13, 12, 11)",
    ]);
    expect(errorsFor(validOutput({ sections: [sec(r(11, 12, 13), r(9, 10, 11)), sec(r(4, 7, 6), r(2, 2, 2), "closet")] }))).toHaveLength(1);
    expect(errorsFor(validOutput({ obstacles: [{ label: "island", lengthFt: r(-1, 6, 7), widthFt: r(3, 3, 3) }] }))[0]).toMatch(
      /^obstacles\.0\.lengthFt/,
    );
  });

  it("knownMeasurementAppliedTo is structural only: a missing or misplaced value is NOT an error", () => {
    expect(errorsFor(validOutput({ sections: [sec(r(12.47, 12.47, 12.47), r(8.5, 9, 9.5), "main", "length")] }))).toEqual([]);
    expect(errorsFor(validOutput({ sections: [sec(r(11, 12, 13), r(9, 10, 11), "main", null)] }))).toEqual([]);
    expect(errorsFor(validOutput({ sections: [sec(r(11, 12, 13), r(9, 10, 11)), { ...closet, knownMeasurementAppliedTo: "width" }] }))).toEqual([]);
    expect(errorsFor({ ...validOutput(), sections: [{ ...sec(r(11, 12, 13), r(9, 10, 11)), knownMeasurementAppliedTo: "diagonal" }] }).length).toBeGreaterThan(0);
  });

  it("questions in notes, too many notes, bad photo indexes are NOT errors (code normalizes them)", () => {
    expect(
      errorsFor(
        validOutput({
          notes: ["Is there a closet?", "a", "b", "c", "d"],
          issues: [{ code: "blurry", message: "x", photoIndex: 9 }],
          scaleReferences: [{ object: "door", assumedSize: "80 in", photoIndex: 0 }],
        }),
      ),
    ).toEqual([]);
  });

  it("rejects wrong structure (bad enum, bad label, missing field, wrong type, app-only issue code)", () => {
    expect(errorsFor({ ...validOutput(), shape: "circle" }).length).toBeGreaterThan(0);
    expect(errorsFor({ ...validOutput(), sections: [{ ...sec(r(11, 12, 13), r(9, 10, 11)), label: "garage" }] }).length).toBeGreaterThan(0);
    const missing: Partial<ModelOutput> = validOutput();
    delete missing.roomType;
    expect(errorsFor(missing).length).toBeGreaterThan(0);
    expect(errorsFor({ ...validOutput(), usable: "yes" }).length).toBeGreaterThan(0);
    expect(errorsFor({ ...validOutput(), issues: [{ code: "ultra_wide_lens", message: "x", photoIndex: 1 }] }).length).toBeGreaterThan(0);
  });
});

describe("normalizeModelOutput", () => {
  it("drops notes phrased as questions and keeps at most 3 tips", () => {
    const { output, changes } = normalizeModelOutput(
      validOutput({
        notes: [
          "The closet is included as a separate section.",
          "Should the closet be included?",
          "  ",
          "A photo from the doorway would help.",
          "Tell me if the hallway counts?",
          "Measuring one wall narrows the range.",
          "A fourth tip.",
        ],
      }),
      2,
    );
    expect(output.notes).toEqual([
      "The closet is included as a separate section.",
      "A photo from the doorway would help.",
      "Measuring one wall narrows the range.",
    ]);
    expect(changes.join()).toMatch(/dropped 2 note\(s\) phrased as questions/);
  });

  it("nulls out-of-range photo indexes instead of failing", () => {
    const { output } = normalizeModelOutput(
      validOutput({
        issues: [{ code: "blurry", message: "x", photoIndex: 3 }],
        scaleReferences: [{ object: "door", assumedSize: "80 in", photoIndex: 0 }],
      }),
      2,
    );
    expect(output.issues[0].photoIndex).toBeNull();
    expect(output.scaleReferences[0].photoIndex).toBeNull();
  });

  it("clears knownMeasurementAppliedTo on closet/other sections; keeps it on main", () => {
    const { output } = normalizeModelOutput(
      validOutput({ sections: [sec(r(12.47, 12.47, 12.47), r(8.5, 9, 9.5), "main", "length"), { ...closet, knownMeasurementAppliedTo: "width" }] }),
      2,
    );
    expect(output.sections.map((s) => s.knownMeasurementAppliedTo)).toEqual(["length", null]);
  });

  it("unusable output gets an explanation if the model gave none, and no sections", () => {
    const { output } = normalizeModelOutput(validOutput({ usable: false, issues: [] }), 2);
    expect(output.issues).toHaveLength(1);
    expect(output.sections).toEqual([]);
  });

  it("leaves clean output unchanged", () => {
    const { output, changes } = normalizeModelOutput(validOutput(), 1);
    expect(changes).toEqual([]);
    expect(output).toEqual(validOutput());
  });
});

describe("mapping onto the calculator", () => {
  it("sections (incl. closets) and obstacles map onto calc Rects and feed estimateRoom, keeping likely", () => {
    const out = validOutput({
      sections: [sec(r(11, 12, 13), r(9.5, 10, 10.5)), closet],
      obstacles: [{ label: "built-in desk", lengthFt: r(4, 5, 6), widthFt: r(2, 2, 2) }],
    });
    const result = estimateRoom(
      room({ sections: out.sections.map(toCalcRect), obstacles: out.obstacles.map(toCalcRect) }),
      product,
      settings,
    );
    expect(result.isRange).toBe(true);
    expect(result.areaSqft.likely).toBeCloseTo(12 * 10 + 5 * 2 - 5 * 2, 10);
    expect(result.areaSqft.low).toBeCloseTo(11 * 9.5 + 4 * 2 - 6 * 2, 10);
    expect(result.areaSqft.high).toBeCloseTo(13 * 10.5 + 6 * 2.5 - 4 * 2, 10);
  });
});
