// Node-only helper: analyze photos from local file paths. Used by scripts/analyze.ts and,
// later, the Phase 4 eval runner. No HTTP involved.

import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { checkImageLimits, ImageError } from "@/lib/images/preprocess";
import { analyzeRoomPhotos, type AnalyzeOptions, type RoomAnalysis, type RoomAnalyzer } from "./index";

export async function analyzeFiles(
  paths: string[],
  options: AnalyzeOptions = {},
  provider?: RoomAnalyzer,
): Promise<RoomAnalysis> {
  const sizes = await Promise.all(
    paths.map(async (p) => {
      try {
        return { name: basename(p), size: (await stat(p)).size };
      } catch {
        throw new ImageError("file_not_found", `Can't open "${p}". Check the path.`, 400);
      }
    }),
  );
  checkImageLimits(sizes); // before reading anything into memory
  const files = await Promise.all(
    paths.map(async (p) => ({ name: basename(p), bytes: new Uint8Array(await readFile(p)) })),
  );
  return analyzeRoomPhotos(files, options, provider);
}
