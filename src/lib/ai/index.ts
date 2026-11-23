// Server-side entry point for room analysis: preprocessing + the configured provider.
// Used by the API route and the CLI (scripts/analyze.ts). Never import from a client component.

import { preprocessImages, type InputImage } from "@/lib/images/preprocess";
import { createAnthropicAnalyzer } from "./anthropic";
import type { AnalyzeOptions, RoomAnalyzer } from "./provider";
import type { RoomAnalysis } from "./schema";

export type { AnalyzeOptions, RoomAnalyzer } from "./provider";
export { AnalysisError } from "./provider";
export type { RoomAnalysis } from "./schema";

let analyzer: RoomAnalyzer | undefined;

/** The configured provider (Anthropic today). Swap the implementation here. */
export function getAnalyzer(): RoomAnalyzer {
  analyzer ??= createAnthropicAnalyzer();
  return analyzer;
}

/** Photos in, validated room analysis out. */
export async function analyzeRoomPhotos(
  files: InputImage[],
  options: AnalyzeOptions = {},
  provider: RoomAnalyzer = getAnalyzer(),
): Promise<RoomAnalysis> {
  const images = await preprocessImages(files);
  return provider.analyzeRoom(images, options);
}
