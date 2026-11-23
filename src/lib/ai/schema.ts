// Room-analysis schema (v2). Three layers:
//  1. ModelOutputSchema: STRUCTURE only. Sent to the API as the structured-output format, so the
//     model's JSON always has this shape.
//  2. validateModelOutput(): rules that make output UNUSABLE (non-positive or unordered ranges,
//     wrong main-section count). Only these trigger the single retry.
//  3. normalizeModelOutput(): everything code can fix itself (notes that are questions, too many
//     notes, out-of-range photo indexes, misplaced knownMeasurementAppliedTo, …). Never retried.
// Rule: retry the AI only when output is unusable; anything code can normalize, code normalizes.
// All lengths are in FEET.

import * as z from "zod/v4";
import type { Range as CalcRange, Rect } from "@/types";
import type { LensClass } from "@/lib/images/lens";
import type { ModelId } from "./models";

/** Issue codes the MODEL may report. */
export const MODEL_ISSUE_CODES = [
  "floor_not_visible",
  "too_dark",
  "blurry",
  "different_rooms",
  "no_scale_reference",
  "not_a_room",
  "other",
] as const;

/** All issue codes in a result: the model's plus ones OUR code adds deterministically. */
export const ISSUE_CODES = [...MODEL_ISSUE_CODES, "ultra_wide_lens"] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export const SECTION_LABELS = ["main", "closet", "other"] as const;
export type SectionLabel = (typeof SECTION_LABELS)[number];

/** A wall the user measured, sent to the model as a ruler for the main room. */
export interface KnownMeasurement {
  valueFt: number;
  /** "longest"/"shortest" = the main room's longer/shorter floor dimension, wall to wall, no closets. */
  which: "longest" | "shortest" | "unknown";
}

const RangeShape = z.object({
  low: z.number(),
  likely: z.number(),
  high: z.number(),
});

const Dimensions = { lengthFt: RangeShape, widthFt: RangeShape };

export const ModelOutputSchema = z.object({
  usable: z.boolean(),
  issues: z.array(
    z.object({
      code: z.enum(MODEL_ISSUE_CODES),
      message: z.string(),
      photoIndex: z.number().nullable(),
    }),
  ),
  roomType: z.string(),
  /** Shape of the MAIN room. Closet / other sections come in addition. */
  shape: z.enum(["rectangle", "l_shape", "irregular"]),
  sections: z.array(
    z.object({
      label: z.enum(SECTION_LABELS),
      ...Dimensions,
      /** Which dimension of this main section the user's known measurement matched; else null. */
      knownMeasurementAppliedTo: z.enum(["length", "width"]).nullable(),
    }),
  ),
  obstacles: z.array(z.object({ label: z.string(), ...Dimensions })),
  scaleReferences: z.array(
    z.object({ object: z.string(), assumedSize: z.string(), photoIndex: z.number() }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  confidenceReason: z.string(),
  existingFloor: z.string(),
  notes: z.array(z.string()),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;
export type DimensionRange = z.infer<typeof RangeShape>;
export type ModelSection = ModelOutput["sections"][number];

export const MAX_NOTES = 3;

/** Expected number of MAIN sections per shape. */
const MAIN_COUNT: Record<ModelOutput["shape"], (n: number) => boolean> = {
  rectangle: (n) => n === 1,
  l_shape: (n) => n === 2,
  irregular: (n) => n >= 1,
};
const MAIN_COUNT_TEXT = { rectangle: "exactly 1", l_shape: "exactly 2", irregular: "at least 1" };

/** Rules whose violation makes output unusable (→ one retry). */
export const strictSchema = ModelOutputSchema.superRefine((o, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const checkRange = (r: DimensionRange, path: (string | number)[]) => {
    if (![r.low, r.likely, r.high].every((n) => Number.isFinite(n) && n > 0)) {
      add(path, "low, likely and high must all be positive numbers of feet");
    } else if (!(r.low <= r.likely && r.likely <= r.high)) {
      add(path, `must satisfy low ≤ likely ≤ high (got ${r.low}, ${r.likely}, ${r.high})`);
    }
  };
  o.sections.forEach((s, i) => {
    checkRange(s.lengthFt, ["sections", i, "lengthFt"]);
    checkRange(s.widthFt, ["sections", i, "widthFt"]);
  });
  o.obstacles.forEach((s, i) => {
    checkRange(s.lengthFt, ["obstacles", i, "lengthFt"]);
    checkRange(s.widthFt, ["obstacles", i, "widthFt"]);
  });
  if (o.usable) {
    const mains = o.sections.filter((s) => s.label === "main").length;
    if (!MAIN_COUNT[o.shape](mains)) {
      add(["sections"], `shape "${o.shape}" needs ${MAIN_COUNT_TEXT[o.shape]} "main" section(s) (got ${mains}); closets are extra "closet" sections`);
    }
  }
});

export type ValidationResult =
  | { success: true; data: ModelOutput }
  | { success: false; errors: string[] };

/** Validate raw parsed JSON from the model. Errors are short, path-prefixed, and fed back on retry. */
export function validateModelOutput(raw: unknown): ValidationResult {
  const result = strictSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

// ---------- normalization (code fixes; never a second API call) ----------

export interface NormalizedOutput extends Omit<ModelOutput, "scaleReferences"> {
  scaleReferences: { object: string; assumedSize: string; photoIndex: number | null }[];
}

export interface NormalizeResult {
  output: NormalizedOutput;
  /** What was changed, for the server log. */
  changes: string[];
}

/** Fix what code can fix. `photoCount` bounds the 1-based photo indexes. */
export function normalizeModelOutput(o: ModelOutput, photoCount: number): NormalizeResult {
  const changes: string[] = [];
  const validPhoto = (i: number | null) => (i !== null && Number.isInteger(i) && i >= 1 && i <= photoCount ? i : null);

  // Notes: tips only. The user can't reply, so questions are dropped. Max 3, no blanks.
  const notes = o.notes.map((n) => n.trim()).filter((n) => n.length > 0);
  const tips = notes.filter((n) => !n.endsWith("?"));
  if (tips.length < notes.length) changes.push(`dropped ${notes.length - tips.length} note(s) phrased as questions`);
  if (tips.length > MAX_NOTES) changes.push(`kept the first ${MAX_NOTES} of ${tips.length} notes`);

  const issues = o.issues.map((i) => {
    const photoIndex = validPhoto(i.photoIndex);
    if (photoIndex !== i.photoIndex) changes.push(`issue photoIndex ${i.photoIndex} → null`);
    return { ...i, photoIndex };
  });
  if (!o.usable && issues.length === 0) {
    issues.push({ code: "other", message: "These photos couldn't be used for an estimate.", photoIndex: null });
    changes.push("added a generic issue to an unusable result");
  }

  const sections = o.sections.map((s) => {
    if (s.label !== "main" && s.knownMeasurementAppliedTo !== null) {
      changes.push(`cleared knownMeasurementAppliedTo on a ${s.label} section`);
      return { ...s, knownMeasurementAppliedTo: null };
    }
    return s;
  });

  const scaleReferences = o.scaleReferences.map((r) => {
    const photoIndex = validPhoto(r.photoIndex);
    if (photoIndex !== r.photoIndex) changes.push(`scale reference photoIndex ${r.photoIndex} → null`);
    return { ...r, photoIndex };
  });

  const confidenceReason = o.confidenceReason.trim() || "No reason given.";

  return {
    output: {
      ...o,
      notes: tips.slice(0, MAX_NOTES),
      issues,
      sections: o.usable ? sections : [],
      scaleReferences,
      confidenceReason,
    },
    changes,
  };
}

// ---------- the full result returned by the API / CLI ----------

export interface PhotoInfo {
  /** 1-based, matching "Photo N" in the prompt and photoIndex in issues. */
  index: number;
  name: string;
  lens: LensClass;
  focalLength35mm: number | null;
  /** Size actually sent to the model, after resizing. */
  width: number;
  height: number;
}

export interface AnalysisIssue {
  code: IssueCode;
  message: string;
  photoIndex: number | null;
  /** "app" = added deterministically by our code (e.g. lens check); "model" = reported by the AI. */
  source: "model" | "app";
}

export interface AnalysisMeta {
  /** The model that produced the result (always the requested one; no fallbacks). */
  model: ModelId;
  /** Registered prompt ID ("v2", "v3", …) and its version string. */
  promptId: string;
  promptVersion: string;
  /** The known measurement this analysis was made with (from our code), or null. */
  knownMeasurement: KnownMeasurement | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  /** 1 normally; 2 if the first output was unusable and was retried. */
  attempts: number;
}

export type RoomAnalysis = Omit<NormalizedOutput, "issues"> & {
  issues: AnalysisIssue[];
  photos: PhotoInfo[];
  meta: AnalysisMeta;
};

// ---------- mapping onto the calculator ----------

/** {low, likely, high} → the calculator's range (likely is kept). */
export const toCalcRange = (r: DimensionRange): CalcRange => ({ low: r.low, likely: r.likely, high: r.high });

/** A section or obstacle → the calculator's Rect (lengths in feet). */
export const toCalcRect = (s: { lengthFt: DimensionRange; widthFt: DimensionRange }): Rect => ({
  length: toCalcRange(s.lengthFt),
  width: toCalcRange(s.widthFt),
});
