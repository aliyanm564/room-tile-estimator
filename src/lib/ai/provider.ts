// The provider interface. Everything outside src/lib/ai/ talks to THIS, never to a specific SDK,
// so the AI provider can be swapped. Server-side only: never import from a client component.

import { UserFacingError } from "@/lib/errors";
import type { ProcessedImage } from "@/lib/images/preprocess";
import type { ModelId } from "./models";
import type { KnownMeasurement } from "./schema";
import type { AnalysisIssue, AnalysisMeta, NormalizedOutput, PhotoInfo, RoomAnalysis } from "./schema";

export interface AnalyzeOptions {
  roomName?: string;
  knownMeasurement?: KnownMeasurement;
  /** Override the model (e.g. Haiku for Phase 4 comparisons). Defaults to env / config. */
  model?: ModelId;
}

export interface RoomAnalyzer {
  analyzeRoom(images: ProcessedImage[], options?: AnalyzeOptions): Promise<RoomAnalysis>;
}

/** AI failures. `userMessage` is safe for the client; `message` holds log detail. */
export class AnalysisError extends UserFacingError {}

/** Deterministic issues from OUR code (not the model): photos taken with the ultra-wide lens. */
export function lensIssues(images: ProcessedImage[]): AnalysisIssue[] {
  return images.flatMap((img, i) =>
    img.lens === "ultra_wide"
      ? [
          {
            code: "ultra_wide_lens" as const,
            message: `Photo ${i + 1} was taken with the 0.5x (ultra-wide) lens, which makes rooms look bigger. For best accuracy, retake it at 1x.`,
            photoIndex: i + 1,
            source: "app" as const,
          },
        ]
      : [],
  );
}

export function photoInfo(images: ProcessedImage[]): PhotoInfo[] {
  return images.map((img, i) => ({
    index: i + 1,
    name: img.name,
    lens: img.lens,
    focalLength35mm: img.focalLength35mm,
    width: img.width,
    height: img.height,
  }));
}

/** Combine validated model output with our deterministic data. Shared by every provider. */
export function buildRoomAnalysis(
  images: ProcessedImage[],
  output: NormalizedOutput,
  meta: AnalysisMeta,
): RoomAnalysis {
  return {
    ...output,
    issues: [
      ...lensIssues(images),
      ...output.issues.map((i) => ({ ...i, source: "model" as const })),
    ],
    photos: photoInfo(images),
    meta,
  };
}
