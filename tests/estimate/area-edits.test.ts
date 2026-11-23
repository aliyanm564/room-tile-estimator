// Closets & built-ins: AI-detected items can be edited (exact) or removed; closets can be added by hand.
import { describe, expect, it, vi } from "vitest";
import type { RoomAnalysis } from "@/lib/ai/schema";
import { buildEstimate, type AreaEdits, type Walls } from "@/lib/estimate/merge";
import { createEstimateRunner, type AnalyzeFn } from "@/lib/estimate/run";
import { product, settings } from "../fixtures";
import { r, sec, validOutput } from "../helpers/images";

/** Main 12 × 10 (likely), AI closet 5 × 2 (range 4–6 × 2–2.5), AI island 6 × 3. */
function analysis(): RoomAnalysis {
  return {
    ...validOutput({
      sections: [sec(r(11, 12, 13), r(9, 10, 11)), sec(r(4, 5, 6), r(2, 2, 2.5), "closet")],
      obstacles: [{ label: "kitchen island", lengthFt: r(5, 6, 7), widthFt: r(3, 3, 3) }],
    }),
    photos: [],
    meta: { model: "claude-sonnet-5-5", promptId: "v3", promptVersion: "x", knownMeasurement: null, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, durationMs: 0, attempts: 1 },
  } as unknown as RoomAnalysis;
}

function ok(a: RoomAnalysis | null, walls: Walls, areaEdits?: AreaEdits) {
  const o = buildEstimate({ analysis: a, walls, layout: "straight", priceOverridePerSqft: null, areaEdits }, product, settings);
  if (o.status !== "ok") throw new Error(`expected ok, got ${o.status}`);
  return o.estimate;
}

const NO_WALLS: Walls = { longerFt: null, shorterFt: null };

describe("AI-detected closets and built-ins", () => {
  it("are listed as estimated items with their ranges", () => {
    const e = ok(analysis(), NO_WALLS);
    expect(e.items.map((i) => [i.key, i.kind, i.label, i.origin, i.source, i.removed])).toEqual([
      ["section:1", "closet", "Closet 1", "ai", "estimated", false],
      ["obstacle:0", "obstacle", "Kitchen island", "ai", "estimated", false],
    ]);
    expect(e.items[0].widthFt).toEqual({ low: 4, likely: 5, high: 6 });
    expect(e.items[0].depthFt).toEqual({ low: 2, likely: 2, high: 2.5 });
    expect(e.result.areaSqft.likely).toBe(120 + 10 - 18);
  });

  it("an edit overrides the AI range EXACTLY and marks the item measured", () => {
    const e = ok(analysis(), NO_WALLS, { ai: { "section:1": { widthFt: 6.5, depthFt: 2.25 } }, manualClosets: [] });
    const closet = e.items.find((i) => i.key === "section:1")!;
    expect(closet.source).toBe("measured");
    expect(closet.widthFt).toEqual({ low: 6.5, likely: 6.5, high: 6.5 });
    expect(closet.depthFt).toEqual({ low: 2.25, likely: 2.25, high: 2.25 });
    expect(e.closetAreaSqft).toEqual({ low: 14.625, likely: 14.625, high: 14.625 });
    expect(e.result.areaSqft.likely).toBeCloseTo(120 + 14.625 - 18, 10);
  });

  it("removing an item excludes it from totals but keeps it listed (for undo)", () => {
    const e = ok(analysis(), NO_WALLS, { ai: { "obstacle:0": { removed: true }, "section:1": { removed: true } }, manualClosets: [] });
    expect(e.items.every((i) => i.removed)).toBe(true);
    expect(e.closetAreaSqft).toBeNull();
    expect(e.closetCount).toBe(0);
    expect(e.obstacleAreaSqft).toBeNull();
    expect(e.result.areaSqft.likely).toBe(120);
  });

  it("manual closets add exact area, alongside AI closets", () => {
    const e = ok(analysis(), NO_WALLS, { ai: {}, manualClosets: [{ id: "a", label: "Hall closet", widthFt: 3, depthFt: 2 }] });
    expect(e.items.find((i) => i.key === "manual:a")).toMatchObject({ label: "Hall closet", origin: "manual", source: "measured" });
    expect(e.closetCount).toBe(2);
    expect(e.closetAreaSqft?.likely).toBe(10 + 6);
  });

  it("edits for keys that don't exist are ignored; a zero size is rejected plainly", () => {
    expect(ok(analysis(), NO_WALLS, { ai: { "section:9": { widthFt: 3, depthFt: 2 } }, manualClosets: [] }).items).toHaveLength(2);
    const bad = buildEstimate(
      { analysis: analysis(), walls: NO_WALLS, layout: "straight", priceOverridePerSqft: null, areaEdits: { ai: { "section:1": { widthFt: 0, depthFt: 2 } }, manualClosets: [] } },
      product,
      settings,
    );
    expect(bad).toEqual({ status: "invalid", message: "Closet 1 width must be greater than zero." });
  });
});

describe("both walls + manual closets: full estimate, no AI (closes the Phase 3 gap)", () => {
  const walls: Walls = { longerFt: 12, shorterFt: 9 };
  const edits: AreaEdits = { ai: {}, manualClosets: [{ id: "c1", label: "Closet", widthFt: 5, depthFt: 2 }] };

  it("counts the manual closet with no analysis at all; everything measured", () => {
    const e = ok(null, walls, edits);
    expect(e.result.areaSqft).toEqual({ low: 118, likely: 118, high: 118 });
    expect(e.result.isRange).toBe(false);
    expect(e.confidence).toBe("measured");
    expect(e.confidenceReason).toBe("Both walls and all closets were measured.");
  });

  it("the provider is never called", async () => {
    const analyze = vi.fn<AnalyzeFn<string>>();
    const res = await createEstimateRunner(analyze)({ walls, photos: ["a.jpg"] });
    expect(res.action).toBe("calculate");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("with an analysis: AI items stay estimated unless edited", () => {
    const e = ok(analysis(), walls);
    expect(e.confidenceReason).toMatch(/marked estimated come from the photos/);
    const allEdited = ok(analysis(), walls, { ai: { "section:1": { widthFt: 5, depthFt: 2 }, "obstacle:0": { widthFt: 6, depthFt: 3 } }, manualClosets: [] });
    expect(allEdited.confidenceReason).toBe("Both walls and all closets were measured.");
    expect(allEdited.result.isRange).toBe(false);
  });

  it("an unusable analysis contributes no AI items, but manual closets still count", () => {
    const bad = { ...analysis(), usable: false, sections: [] } as RoomAnalysis;
    const e = ok(bad, walls, edits);
    expect(e.items.map((i) => i.origin)).toEqual(["manual"]);
    expect(e.result.areaSqft.likely).toBe(118);
  });
});
