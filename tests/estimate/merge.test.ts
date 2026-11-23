// Merge decision table (see CLAUDE.md). One describe per row.
import { describe, expect, it } from "vitest";
import type { AnalysisIssue, KnownMeasurement, RoomAnalysis } from "@/lib/ai/schema";
import { buildEstimate, type EstimateOutcome, type Walls } from "@/lib/estimate/merge";
import { product, settings } from "../fixtures";
import { r, sec, validOutput } from "../helpers/images";

const NO_WALLS: Walls = { longerFt: null, shorterFt: null };

/** A usable analysis: main 11–13 × 9–11 (likely 12.5 × 9.5) unless overridden. */
function analysis(
  over: Partial<RoomAnalysis> = {},
  knownMeasurement: KnownMeasurement | null = null,
  issues: AnalysisIssue[] = [],
): RoomAnalysis {
  const base = validOutput({ sections: [sec(r(11, 12.5, 13), r(9, 9.5, 11))] });
  return {
    ...base,
    issues,
    photos: [],
    meta: {
      model: "claude-sonnet-5-5",
      promptVersion: "test",
      knownMeasurement,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      attempts: 1,
    },
    ...over,
  };
}

function est(a: RoomAnalysis | null, walls: Walls = NO_WALLS, price: number | null = null) {
  return buildEstimate({ analysis: a, walls, layout: "straight", priceOverridePerSqft: price }, product, settings);
}

function ok(o: EstimateOutcome) {
  if (o.status !== "ok") throw new Error(`expected ok, got ${o.status}`);
  return o.estimate;
}

const ordered = (x: { low: number; likely: number; high: number }) => x.low <= x.likely && x.likely <= x.high;

describe("row 1: no walls, no analysis", () => {
  it("→ empty", () => expect(est(null)).toEqual({ status: "empty" }));
});

describe("row 2: no walls + usable analysis → AI ranges", () => {
  it("uses the AI's main section, larger likely = longer side, both estimated", () => {
    const e = ok(est(analysis()));
    expect(e.main?.longer).toEqual({ ft: { low: 11, likely: 12.5, high: 13 }, source: "estimated" });
    expect(e.main?.shorter).toEqual({ ft: { low: 9, likely: 9.5, high: 11 }, source: "estimated" });
    expect(e.result.areaSqft).toEqual({ low: 99, likely: 118.75, high: 143 });
    expect(e.confidence).toBe("medium");
    expect(e.scaleFrom).toEqual(["interior door"]);
    expect(e.reanalyzeWith).toBeNull();
  });

  it("if the AI's 'width' is the bigger side, it still becomes the longer side", () => {
    const e = ok(est(analysis({ sections: [sec(r(8, 9, 10), r(11, 12, 13))] })));
    expect(e.main?.longer.ft.likely).toBe(12);
    expect(e.main?.shorter.ft.likely).toBe(9);
  });
});

describe("row 3: one wall, no analysis", () => {
  it("→ needs_photos (either wall)", () => {
    expect(est(null, { longerFt: 12.47, shorterFt: null })).toEqual({ status: "needs_photos" });
    expect(est(null, { longerFt: null, shorterFt: 9.02 })).toEqual({ status: "needs_photos" });
  });
});

describe("row 4: one wall + analysis made WITH that measurement", () => {
  it("longer wall locks the dimension the AI applied it to, exactly; other side from the AI", () => {
    const a = analysis(
      { sections: [sec(r(12.47, 12.47, 12.47), r(8.5, 9, 9.5), "main", "length")] },
      { valueFt: 12.47, which: "longest" },
    );
    const e = ok(est(a, { longerFt: 12.47, shorterFt: null }));
    expect(e.main?.longer).toEqual({ ft: { low: 12.47, likely: 12.47, high: 12.47 }, source: "measured" });
    expect(e.main?.shorter).toEqual({ ft: { low: 8.5, likely: 9, high: 9.5 }, source: "estimated" });
    expect(e.scaleFrom).toContain("your measurement");
    expect(e.reanalyzeWith).toBeNull();
    expect(e.warnings).toEqual([]);
  });

  it("shorter wall locks the applied dimension; the AI's range on it is overridden exactly", () => {
    // AI applied it to width but returned a slightly-off value: code overwrites it with the user's.
    const a = analysis(
      { sections: [sec(r(11.5, 12, 12.5), r(8.9, 9.0, 9.1), "main", "width")] },
      { valueFt: 9.02, which: "shortest" },
    );
    const e = ok(est(a, { longerFt: null, shorterFt: 9.02 }));
    expect(e.main?.shorter.ft).toEqual({ low: 9.02, likely: 9.02, high: 9.02 });
    expect(e.main?.longer).toEqual({ ft: { low: 11.5, likely: 12, high: 12.5 }, source: "estimated" });
  });

  it("appliedTo missing → falls back to larger/smaller (no retry needed)", () => {
    const a = analysis({ sections: [sec(r(12, 12.47, 13), r(8.5, 9, 9.5))] }, { valueFt: 12.47, which: "longest" });
    const e = ok(est(a, { longerFt: 12.47, shorterFt: null }));
    expect(e.main?.longer.ft.likely).toBe(12.47);
    expect(e.main?.shorter.ft.likely).toBe(9);
  });

  it("appliedTo on the wrong dimension (value isn't there) → falls back to larger/smaller", () => {
    const a = analysis(
      { sections: [sec(r(12, 12.47, 13), r(8.5, 9, 9.5), "main", "width")] },
      { valueFt: 12.47, which: "longest" },
    );
    const e = ok(est(a, { longerFt: 12.47, shorterFt: null }));
    expect(e.main?.longer).toEqual({ ft: { low: 12.47, likely: 12.47, high: 12.47 }, source: "measured" });
    expect(e.main?.shorter.ft.likely).toBe(9);
  });
});

describe("row 5: one wall entered AFTER an analysis made without it", () => {
  it("locks immediately (free) and offers re-analysis with that measurement", () => {
    const e = ok(est(analysis(), { longerFt: 12.47, shorterFt: null }));
    expect(e.main?.longer).toEqual({ ft: { low: 12.47, likely: 12.47, high: 12.47 }, source: "measured" });
    expect(e.main?.shorter.ft).toEqual({ low: 9, likely: 9.5, high: 11 }); // AI's, untouched: no proportional rescaling
    expect(e.reanalyzeWith).toEqual({ valueFt: 12.47, which: "longest" });
  });

  it("a different value than the analysis used also offers re-analysis", () => {
    const a = analysis({}, { valueFt: 12, which: "longest" });
    expect(ok(est(a, { longerFt: 12.47, shorterFt: null })).reanalyzeWith).toEqual({ valueFt: 12.47, which: "longest" });
  });

  it("the other dimension is NEVER rescaled proportionally", () => {
    const before = ok(est(analysis()));
    const after = ok(est(analysis(), { longerFt: 15, shorterFt: null }));
    expect(after.main?.shorter.ft).toEqual(before.main?.shorter.ft);
  });

  it("inconsistent lock → warning, no silent swap", () => {
    // AI: 12.5 × 9.5. "Shorter wall = 13" locks the smaller dimension (9.5 → 13); the other side
    // (12.5) is now shorter than the "shorter" wall. Keep both as they are and warn.
    const e = ok(est(analysis(), { longerFt: null, shorterFt: 13 }));
    expect(e.main?.shorter.ft).toEqual({ low: 13, likely: 13, high: 13 }); // kept as entered
    expect(e.main?.longer.ft.likely).toBe(12.5); // AI's other side, not swapped
    expect(e.warnings.map((w) => w.code)).toEqual(["measurement_inconsistent"]);
    expect(e.warnings[0].message).toMatch(/looks shorter \(about 12\.5 ft\).*shorter wall \(13 ft\)/);

    const e2 = ok(est(analysis(), { longerFt: 8, shorterFt: null }));
    expect(e2.warnings[0]).toMatchObject({ code: "measurement_inconsistent", source: "merge" });
  });
});

describe("row 6: both walls measured", () => {
  it("no analysis → exact rectangle, confidence 'measured', nothing estimated", () => {
    const e = ok(est(null, { longerFt: 12.47, shorterFt: 9.02 }));
    expect(e.main?.longer).toEqual({ ft: { low: 12.47, likely: 12.47, high: 12.47 }, source: "measured" });
    expect(e.main?.shorter.source).toBe("measured");
    expect(e.result.areaSqft.likely).toBeCloseTo(12.47 * 9.02, 10);
    expect(e.result.isRange).toBe(false);
    expect(e.confidence).toBe("measured");
    expect(e.closetAreaSqft).toBeNull();
    expect(e.scaleFrom).toEqual(["your measurements"]);
  });

  it("with an analysis → walls win; AI closets and built-ins are kept (estimated)", () => {
    const a = analysis({
      sections: [sec(r(11, 12, 13), r(9, 10, 11)), sec(r(4, 5, 6), r(2, 2, 2.5), "closet")],
      obstacles: [{ label: "built-in desk", lengthFt: r(3, 4, 5), widthFt: r(2, 2, 2) }],
    });
    const e = ok(est(a, { longerFt: 12.47, shorterFt: 9.02 }));
    expect(e.main?.longer.ft.likely).toBe(12.47);
    expect(e.closetCount).toBe(1);
    expect(e.closetAreaSqft).toEqual({ low: 8, likely: 10, high: 15 });
    expect(e.result.areaSqft.likely).toBeCloseTo(12.47 * 9.02 + 10 - 8, 10);
    expect(e.confidence).toBe("measured");
    expect(e.confidenceReason).toMatch(/Closets and built-ins are estimated/);
    expect(e.reanalyzeWith).toBeNull();
  });

  it("an unusable analysis is ignored when both walls are measured", () => {
    const bad = analysis({ usable: false, sections: [] }, null, [{ code: "too_dark", message: "Too dark", photoIndex: 1, source: "model" }]);
    const e = ok(est(bad, { longerFt: 12, shorterFt: 9 }));
    expect(e.result.areaSqft.likely).toBe(108);
    expect(e.warnings).toEqual([]);
  });

  it("walls entered the wrong way round → warning, kept as entered", () => {
    const e = ok(est(null, { longerFt: 9, shorterFt: 12 }));
    expect(e.warnings[0].code).toBe("walls_reversed");
    expect(e.result.areaSqft.likely).toBe(108);
  });
});

describe("row 7: unusable analysis, at most one wall", () => {
  it("→ no estimate; issues returned so the UI can say what to fix", () => {
    const issues: AnalysisIssue[] = [
      { code: "ultra_wide_lens", message: "Photo 1 was taken with the 0.5x…", photoIndex: 1, source: "app" },
      { code: "floor_not_visible", message: "The floor isn't visible.", photoIndex: null, source: "model" },
    ];
    const bad = analysis({ usable: false, sections: [] }, null, issues);
    expect(est(bad)).toEqual({ status: "unusable", issues });
    expect(est(bad, { longerFt: 12, shorterFt: null })).toEqual({ status: "unusable", issues });
  });
});

describe("rows 8 & 9: L-shaped / irregular main room", () => {
  const lShape = analysis({
    shape: "l_shape",
    sections: [sec(r(14, 15, 16), r(9, 10, 11)), sec(r(5, 6, 7), r(4, 5, 6))],
  });

  it("no walls → both main parts summed; no single longer × shorter", () => {
    const e = ok(est(lShape));
    expect(e.main).toBeNull();
    expect(e.mainAreaSqft.likely).toBe(180);
    expect(e.shape).toBe("l_shape");
  });

  it("row 8: one wall can't be locked → AI estimate + warning (+ re-analyze if not used yet)", () => {
    const e = ok(est(lShape, { longerFt: 15.5, shorterFt: null }));
    expect(e.main).toBeNull();
    expect(e.mainAreaSqft.likely).toBe(180);
    expect(e.warnings.map((w) => w.code)).toEqual(["measurement_not_applied"]);
    expect(e.reanalyzeWith).toEqual({ valueFt: 15.5, which: "longest" });
  });

  it("row 9: both walls → treated as a rectangle, with a shape warning", () => {
    const e = ok(est(lShape, { longerFt: 15, shorterFt: 10 }));
    expect(e.main?.longer.ft.likely).toBe(15);
    expect(e.result.areaSqft.likely).toBe(150);
    expect(e.warnings.map((w) => w.code)).toEqual(["shape_conflict"]);
  });
});

describe("areas, warnings and ranges", () => {
  it("closet and 'other' sections add area; obstacles subtract", () => {
    const a = analysis({
      sections: [
        sec(r(11, 12, 13), r(9, 10, 11)),
        sec(r(4, 5, 6), r(2, 2, 2), "closet"),
        sec(r(5, 6, 7), r(5, 6, 7), "closet"),
        sec(r(3, 3, 3), r(3, 3, 3), "other"),
      ],
      obstacles: [{ label: "island", lengthFt: r(5, 6, 7), widthFt: r(3, 3, 3) }],
    });
    const e = ok(est(a));
    expect(e.closetCount).toBe(2);
    expect(e.closetAreaSqft?.likely).toBe(10 + 36);
    expect(e.otherAreaSqft?.likely).toBe(9);
    expect(e.obstacleAreaSqft?.likely).toBe(18);
    expect(e.obstacleLabels).toEqual(["island"]);
    expect(e.result.areaSqft.likely).toBe(120 + 46 + 9 - 18);
  });

  it("lens and AI issues pass through as warnings, in order, before merge warnings", () => {
    const issues: AnalysisIssue[] = [
      { code: "ultra_wide_lens", message: "Photo 2 was taken with the 0.5x…", photoIndex: 2, source: "app" },
      { code: "blurry", message: "Photo 1 is blurry.", photoIndex: 1, source: "model" },
    ];
    const e = ok(est(analysis({}, null, issues), { longerFt: null, shorterFt: 13 }));
    expect(e.warnings.map((w) => [w.code, w.source])).toEqual([
      ["ultra_wide_lens", "app"],
      ["blurry", "model"],
      ["measurement_inconsistent", "merge"],
    ]);
  });

  it("low ≤ likely ≤ high is preserved through the whole calculator", () => {
    const a = analysis({
      sections: [sec(r(10, 13.9, 14), r(8, 8.1, 12)), sec(r(2, 5, 6), r(2, 2, 3), "closet")],
      obstacles: [{ label: "vanity", lengthFt: r(2, 3, 4), widthFt: r(1.5, 2, 2) }],
    });
    for (const walls of [NO_WALLS, { longerFt: 13, shorterFt: null }, { longerFt: null, shorterFt: 9 }]) {
      const res = ok(est(a, walls)).result;
      for (const k of ["areaSqft", "sqftNeeded", "boxes", "purchasedSqft", "cost"] as const) {
        expect(ordered(res[k]), `${k} with ${JSON.stringify(walls)}`).toBe(true);
      }
    }
  });

  it("price override flows through", () => {
    const e = ok(est(null, { longerFt: 12, shorterFt: 10 }, 6));
    expect(e.result.priceSource).toBe("user");
    expect(e.result.cost.likely).toBe(840);
  });

  it("invalid wall values → invalid, with a plain message", () => {
    expect(est(null, { longerFt: 0, shorterFt: 9 })).toEqual({ status: "invalid", message: "Longer wall must be greater than zero." });
    expect(est(analysis(), { longerFt: Number.NaN, shorterFt: null })).toEqual({ status: "invalid", message: "Longer wall must be a number." });
  });
});
