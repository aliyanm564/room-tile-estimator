// Merge AI room analysis + the user's wall measurements into one estimate. Pure: no React, no I/O.
//
// Priority per main dimension: manual wall (exact) > AI range. See the decision table in CLAUDE.md.
// NEVER rescale the other dimension proportionally in code: a single known wall is sent to the AI as
// a ruler and the AI re-measures the other side (measured evidence: proportional rescaling was far
// worse). Code only locks the measured dimension.

import type { AnalysisIssue, KnownMeasurement, RoomAnalysis } from "@/lib/ai/schema";
import { CalcError } from "@/lib/calc/errors";
import { estimateRoom } from "@/lib/calc/estimate";
import { rectAreaSqft } from "@/lib/calc/area";
import { exact, sumRanges, toRange } from "@/lib/calc/range";
import type { FlooringProduct, Layout, Rect, ResultRange, RoomResult, Settings } from "@/types";

/** The user's wall measurements in feet (canonical). null = not entered; NaN = unparseable. */
export interface Walls {
  longerFt: number | null;
  shorterFt: number | null;
}

export type DimensionSource = "measured" | "estimated";

export interface MainDimension {
  ft: ResultRange;
  source: DimensionSource;
}

export interface EstimateWarning {
  code: string;
  message: string;
  photoIndex: number | null;
  /** app = our deterministic checks (lens); model = the AI; merge = this module. */
  source: "app" | "model" | "merge";
}

export type Confidence = "low" | "medium" | "high" | "measured";

export interface Estimate {
  roomType: string | null;
  shape: "rectangle" | "l_shape" | "irregular";
  /** Main room as longer × shorter. null when the main room isn't one rectangle (AI L-shape/irregular). */
  main: { longer: MainDimension; shorter: MainDimension } | null;
  mainAreaSqft: ResultRange;
  /** Closet floor area from the AI (always estimated), or null if none. */
  closetAreaSqft: ResultRange | null;
  closetCount: number;
  otherAreaSqft: ResultRange | null;
  obstacleAreaSqft: ResultRange | null;
  obstacleLabels: string[];
  /** The calculator's result: area, sq ft with waste, boxes, cost (each low/likely/high). */
  result: RoomResult;
  confidence: Confidence;
  confidenceReason: string;
  /** What set the scale: the AI's reference objects, plus "your measurement(s)". */
  scaleFrom: string[];
  warnings: EstimateWarning[];
  notes: string[];
  /**
   * Set when ONE wall is entered and the analysis wasn't made with it: the wall is already locked
   * (free), and re-analyzing with it as a ruler can improve the other dimension (costs a call).
   */
  reanalyzeWith: KnownMeasurement | null;
}

export type EstimateOutcome =
  | { status: "empty" } // nothing entered, no analysis
  | { status: "needs_photos" } // one wall entered, no analysis yet
  | { status: "unusable"; issues: AnalysisIssue[] } // AI couldn't estimate: show what to fix
  | { status: "invalid"; message: string } // bad input (e.g. a wall of 0)
  | { status: "ok"; estimate: Estimate };

export interface EstimateRequest {
  analysis: RoomAnalysis | null;
  walls: Walls;
  layout: Layout;
  priceOverridePerSqft: number | null;
}

/** The single known measurement to send to the AI, if exactly one wall is entered. */
export function knownMeasurementFromWalls(walls: Walls): KnownMeasurement | undefined {
  const hasL = walls.longerFt !== null;
  const hasS = walls.shorterFt !== null;
  if (hasL && !hasS) return { valueFt: walls.longerFt!, which: "longest" };
  if (hasS && !hasL) return { valueFt: walls.shorterFt!, which: "shortest" };
  return undefined;
}

type Section = RoomAnalysis["sections"][number];

const rectOf = (s: { lengthFt: Section["lengthFt"]; widthFt: Section["widthFt"] }, label: string) => ({
  length: toRange(s.lengthFt, `${label} length`),
  width: toRange(s.widthFt, `${label} width`),
});

const areaOf = (rects: Rect[]) => (rects.length ? sumRanges(rects.map((r) => rectAreaSqft(r, "ft"))) : null);

const fmtFt = (n: number) => `${Number(n.toFixed(1))} ft`;

/** Within 5%: the AI put the user's value on that dimension. */
const matches = (r: ResultRange, v: number) => Math.abs(r.likely - v) <= 0.05 * v;

function issueWarnings(issues: AnalysisIssue[]): EstimateWarning[] {
  return issues.map((i) => ({ code: i.code, message: i.message, photoIndex: i.photoIndex, source: i.source }));
}

export function buildEstimate(
  req: EstimateRequest,
  product: FlooringProduct,
  settings: Settings,
): EstimateOutcome {
  try {
    return merge(req, product, settings);
  } catch (e) {
    if (e instanceof CalcError) return { status: "invalid", message: e.message };
    throw e;
  }
}

function merge(req: EstimateRequest, product: FlooringProduct, settings: Settings): EstimateOutcome {
  const { walls, analysis } = req;
  const hasL = walls.longerFt !== null;
  const hasS = walls.shorterFt !== null;
  const usable = analysis?.usable ? analysis : null;

  // Rows 1, 3, 7: nothing to estimate from yet.
  if (!(hasL && hasS)) {
    if (!analysis) return { status: hasL || hasS ? "needs_photos" : "empty" };
    if (!usable) return { status: "unusable", issues: analysis.issues };
  }

  const warnings: EstimateWarning[] = usable ? issueWarnings(usable.issues) : [];
  const scaleFrom: string[] = usable ? usable.scaleReferences.map((r) => r.object) : [];
  const mains = usable ? usable.sections.filter((s) => s.label === "main") : [];
  const closets = usable ? usable.sections.filter((s) => s.label === "closet") : [];
  const others = usable ? usable.sections.filter((s) => s.label === "other") : [];

  let main: Estimate["main"];
  let mainRects: Rect[];
  let reanalyzeWith: KnownMeasurement | null = null;
  let confidence: Confidence;
  let confidenceReason: string;

  if (hasL && hasS) {
    // Rows 6, 9: both walls measured → main room is exactly longer × shorter. No AI needed.
    const longer = toRange(walls.longerFt!, "Longer wall");
    const shorter = toRange(walls.shorterFt!, "Shorter wall");
    if (shorter.likely > longer.likely) {
      warnings.push({
        code: "walls_reversed",
        message: `The shorter wall (${fmtFt(shorter.likely)}) is longer than the longer wall (${fmtFt(longer.likely)}). Check the two measurements.`,
        photoIndex: null,
        source: "merge",
      });
    }
    if (usable && mains.length !== 1) {
      warnings.push({
        code: "shape_conflict",
        message: "The photos suggest the room isn't a simple rectangle, but your two measurements treat it as one. Check the area if part of the room is an L or alcove.",
        photoIndex: null,
        source: "merge",
      });
    }
    main = { longer: { ft: longer, source: "measured" }, shorter: { ft: shorter, source: "measured" } };
    mainRects = [{ length: longer, width: shorter }];
    confidence = "measured";
    confidenceReason =
      closets.length || others.length || usable?.obstacles.length
        ? "Both walls were measured. Closets and built-ins are estimated from the photos."
        : "Both walls were measured.";
    scaleFrom.splice(0, scaleFrom.length, "your measurements");
  } else {
    // Rows 2, 4, 5, 8: usable AI analysis, at most one wall entered.
    const a = usable!;
    confidence = a.confidence;
    confidenceReason = a.confidenceReason;
    const wallKind: "longer" | "shorter" | null = hasL ? "longer" : hasS ? "shorter" : null;
    const wallValue = hasL ? walls.longerFt! : hasS ? walls.shorterFt! : null;
    const known = knownMeasurementFromWalls(walls) ?? null;
    const km = a.meta.knownMeasurement;
    const sameMeasurement = !!known && !!km && km.which === known.which && km.valueFt === known.valueFt;
    if (known && !sameMeasurement) reanalyzeWith = known;

    if (mains.length === 1) {
      const m = mains[0];
      const dims = { length: toRange(m.lengthFt, "Room length"), width: toRange(m.widthFt, "Room width") };
      const largerKey = dims.length.likely >= dims.width.likely ? "length" : "width";
      const smallerKey = largerKey === "length" ? "width" : "length";

      if (wallKind && wallValue !== null) {
        const locked = toRange(wallValue, wallKind === "longer" ? "Longer wall" : "Shorter wall");
        // Which dimension does the wall lock? Trust the AI's knownMeasurementAppliedTo only if this
        // analysis was made with this exact measurement AND it put the value on that dimension.
        // Otherwise: longer wall → larger dimension, shorter wall → smaller dimension.
        const applied = m.knownMeasurementAppliedTo;
        const lockKey =
          sameMeasurement && applied && matches(dims[applied], wallValue)
            ? applied
            : wallKind === "longer"
              ? largerKey
              : smallerKey;
        const otherKey = lockKey === "length" ? "width" : "length";
        const other = dims[otherKey];
        const lockedDim: MainDimension = { ft: exact(locked.likely), source: "measured" };
        const otherDim: MainDimension = { ft: other, source: "estimated" };
        main = wallKind === "longer" ? { longer: lockedDim, shorter: otherDim } : { longer: otherDim, shorter: lockedDim };

        // Don't silently swap: flag a lock that contradicts its label.
        const contradicts = wallKind === "longer" ? other.likely > locked.likely : other.likely < locked.likely;
        if (contradicts) {
          warnings.push({
            code: "measurement_inconsistent",
            message:
              wallKind === "longer"
                ? `The other side looks longer (about ${fmtFt(other.likely)}) than the wall you entered as the longer wall (${fmtFt(locked.likely)}). Check which wall you measured.`
                : `The other side looks shorter (about ${fmtFt(other.likely)}) than the wall you entered as the shorter wall (${fmtFt(locked.likely)}). Check which wall you measured.`,
            photoIndex: null,
            source: "merge",
          });
        }
        scaleFrom.push("your measurement");
      } else {
        main = {
          longer: { ft: dims[largerKey], source: "estimated" },
          shorter: { ft: dims[smallerKey], source: "estimated" },
        };
      }
      mainRects = [{ length: main.longer.ft, width: main.shorter.ft }];
    } else {
      // Row 8: L-shaped / irregular main room. A single wall can't be locked onto it.
      main = null;
      mainRects = mains.map((s, i) => rectOf(s, `Room part ${i + 1}`));
      if (wallKind) {
        warnings.push({
          code: "measurement_not_applied",
          message: sameMeasurement
            ? "The AI used your measurement as a scale, but it can't be locked onto an L-shaped or irregular room, so the sizes shown are the AI's estimates."
            : "Your measurement can't be locked onto an L-shaped or irregular room. Re-analyze to let the AI use it as a scale.",
          photoIndex: null,
          source: "merge",
        });
      }
    }
  }

  const closetRects = closets.map((s, i) => rectOf(s, `Closet ${i + 1}`));
  const otherRects = others.map((s, i) => rectOf(s, `Extra area ${i + 1}`));
  const obstacleRects = (usable?.obstacles ?? []).map((o) => rectOf(o, o.label || "Built-in"));

  const result = estimateRoom(
    {
      unit: "ft",
      sections: [...mainRects, ...closetRects, ...otherRects],
      obstacles: obstacleRects,
      layout: req.layout,
      productId: product.id,
      priceOverridePerSqft: req.priceOverridePerSqft,
    },
    product,
    settings,
  );

  return {
    status: "ok",
    estimate: {
      roomType: usable?.roomType ?? null,
      shape: usable && !(hasL && hasS) ? usable.shape : "rectangle",
      main,
      mainAreaSqft: areaOf(mainRects)!,
      closetAreaSqft: areaOf(closetRects),
      closetCount: closets.length,
      otherAreaSqft: areaOf(otherRects),
      obstacleAreaSqft: areaOf(obstacleRects),
      obstacleLabels: (usable?.obstacles ?? []).map((o) => o.label),
      result,
      confidence,
      confidenceReason,
      scaleFrom: [...new Set(scaleFrom)],
      warnings,
      notes: usable?.notes ?? [],
      reanalyzeWith,
    },
  };
}
