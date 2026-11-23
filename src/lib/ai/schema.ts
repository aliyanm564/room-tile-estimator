// Room-analysis schema. Two layers:
//  1. ModelOutputSchema — STRUCTURE only. Sent to the API as the structured-output format, so the
//     model's JSON always has this shape. (JSON Schema can't express low ≤ likely ≤ high etc.)
//  2. validateModelOutput() — the strict rules, checked in our code. Failures trigger one retry.
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
  shape: z.enum(["rectangle", "l_shape", "irregular"]),
  sections: z.array(z.object(Dimensions)),
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

export const MAX_NOTES = 3;

/** Strict rules on top of the structure. `photoCount` bounds the 1-based photo indexes. */
export function strictSchema(photoCount: number) {
  return ModelOutputSchema.superRefine((o, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const checkRange = (r: DimensionRange, path: (string | number)[]) => {
      if (![r.low, r.likely, r.high].every((n) => Number.isFinite(n) && n > 0)) {
        add(path, "low, likely and high must all be positive numbers of feet");
      } else if (!(r.low <= r.likely && r.likely <= r.high)) {
        add(path, `must satisfy low ≤ likely ≤ high (got ${r.low}, ${r.likely}, ${r.high})`);
      }
    };
    const checkPhoto = (i: number | null, path: (string | number)[]) => {
      if (i !== null && !(Number.isInteger(i) && i >= 1 && i <= photoCount)) {
        add(path, `photoIndex must be a whole number from 1 to ${photoCount}, or null`);
      }
    };

    o.sections.forEach((s, i) => {
      checkRange(s.lengthFt, ["sections", i, "lengthFt"]);
      checkRange(s.widthFt, ["sections", i, "widthFt"]);
    });
    o.obstacles.forEach((s, i) => {
      checkRange(s.lengthFt, ["obstacles", i, "lengthFt"]);
      checkRange(s.widthFt, ["obstacles", i, "widthFt"]);
      if (!s.label.trim()) add(["obstacles", i, "label"], "label must not be empty");
    });
    o.issues.forEach((s, i) => checkPhoto(s.photoIndex, ["issues", i, "photoIndex"]));
    o.scaleReferences.forEach((s, i) => checkPhoto(s.photoIndex, ["scaleReferences", i, "photoIndex"]));

    if (o.usable) {
      const n = o.sections.length;
      if (o.shape === "rectangle" && n !== 1) add(["sections"], `shape "rectangle" needs exactly 1 section (got ${n})`);
      if (o.shape === "l_shape" && n !== 2) add(["sections"], `shape "l_shape" needs exactly 2 sections (got ${n})`);
      if (o.shape === "irregular" && n < 1) add(["sections"], `shape "irregular" needs at least 1 section`);
    } else if (o.issues.length === 0) {
      add(["issues"], "usable is false, so at least one issue must explain why");
    }

    if (o.notes.length > MAX_NOTES) add(["notes"], `at most ${MAX_NOTES} notes (got ${o.notes.length})`);
    if (!o.confidenceReason.trim()) add(["confidenceReason"], "must not be empty");
  });
}

export type ValidationResult =
  | { success: true; data: ModelOutput }
  | { success: false; errors: string[] };

/** Validate raw parsed JSON from the model. Errors are short, path-prefixed, and fed back on retry. */
export function validateModelOutput(raw: unknown, photoCount: number): ValidationResult {
  const result = strictSchema(photoCount).safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
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
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  /** 1 normally; 2 if the first output failed validation and was retried. */
  attempts: number;
}

export type RoomAnalysis = Omit<ModelOutput, "issues"> & {
  issues: AnalysisIssue[];
  photos: PhotoInfo[];
  meta: AnalysisMeta;
};

// ---------- mapping onto the calculator (used in Phase 3) ----------

/** {low, likely, high} → the calculator's {low, high}. */
export const toCalcRange = (r: DimensionRange): CalcRange => ({ low: r.low, high: r.high });

/** A section or obstacle → the calculator's Rect (lengths in feet). */
export const toCalcRect = (s: { lengthFt: DimensionRange; widthFt: DimensionRange }): Rect => ({
  length: toCalcRange(s.lengthFt),
  width: toCalcRange(s.widthFt),
});
