// Per-run scoring. The area scored is what the APP would show: the analysis goes through the same
// merge as the UI (known wall locked, closets added, built-ins subtracted).

import type { RoomAnalysis } from "@/lib/ai/schema";
import { buildEstimate, type Walls } from "@/lib/estimate/merge";
import type { FlooringProduct, Range, ResultRange, Settings } from "@/types";
import type { EvalCondition, EvalTruth } from "./rooms";

export interface AreaScore {
  likely: number;
  low: number;
  high: number;
  /** Signed: (likely − truth) / truth × 100. Positive = overestimate. */
  errorPct: number;
  absErrorPct: number;
  /** truth inside [low, high] */
  covered: boolean;
  /** (high − low) / likely × 100 */
  rangeWidthPct: number;
}

export function scoreRange(r: Range & { likely: number }, truth: number): AreaScore {
  const errorPct = ((r.likely - truth) / truth) * 100;
  return {
    likely: r.likely,
    low: r.low,
    high: r.high,
    errorPct,
    absErrorPct: Math.abs(errorPct),
    covered: r.low <= truth && truth <= r.high,
    rangeWidthPct: ((r.high - r.low) / r.likely) * 100,
  };
}

export const wallsFor = (c: EvalCondition): Walls => ({
  longerFt: c.knownMeasurement?.which === "longest" ? c.knownMeasurement.valueFt : null,
  shorterFt: c.knownMeasurement?.which === "shortest" ? c.knownMeasurement.valueFt : null,
});

const pick = (r: ResultRange) => ({ low: r.low, likely: r.likely, high: r.high });

export interface RunScore {
  usable: boolean;
  /** Total floor area (main + closets + other − built-ins), as the app computes it. */
  area: AreaScore | null;
  main: { longer: { low: number; likely: number; high: number; source: string }; shorter: { low: number; likely: number; high: number; source: string } } | null;
  /** Only when the room's truth has main dimensions. */
  mainScore: { length: AreaScore; width: AreaScore } | null;
  closetCount: number;
  closetAreaLikely: number | null;
  shape: string | null;
  mergeWarnings: string[];
}

export function scoreAnalysis(
  analysis: RoomAnalysis,
  condition: EvalCondition,
  truth: EvalTruth,
  product: FlooringProduct,
  settings: Settings,
): RunScore {
  const outcome = buildEstimate(
    { analysis, walls: wallsFor(condition), layout: "straight", priceOverridePerSqft: null },
    product,
    settings,
  );
  if (outcome.status !== "ok") {
    return { usable: false, area: null, main: null, mainScore: null, closetCount: 0, closetAreaLikely: null, shape: analysis.shape ?? null, mergeWarnings: [] };
  }
  const e = outcome.estimate;
  const main = e.main
    ? {
        longer: { ...pick(e.main.longer.ft), source: e.main.longer.source },
        shorter: { ...pick(e.main.shorter.ft), source: e.main.shorter.source },
      }
    : null;
  return {
    usable: true,
    area: scoreRange(e.result.areaSqft, truth.totalAreaSqft),
    main,
    mainScore:
      truth.main && e.main
        ? { length: scoreRange(e.main.longer.ft, truth.main.lengthFt), width: scoreRange(e.main.shorter.ft, truth.main.widthFt) }
        : null,
    closetCount: e.closetCount,
    closetAreaLikely: e.closetAreaSqft?.likely ?? null,
    shape: e.shape,
    mergeWarnings: e.warnings.filter((w) => w.source === "merge").map((w) => w.code),
  };
}

// ---------- small stats ----------

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Sample standard deviation (n − 1). null for fewer than 2 values. */
export function stdDev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
