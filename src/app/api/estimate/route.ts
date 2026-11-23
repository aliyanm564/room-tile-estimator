// POST /api/estimate — multipart/form-data:
//   images            1–6 files (JPEG, PNG, WebP, HEIC/HEIF)
//   roomName          optional text
//   knownMeasurement  optional JSON: {"valueFt": 14, "which": "longest" | "shortest" | "unknown"}
//   lensHints         optional JSON array, one per image: {"focalLength35mm": 13, "lensModel": "…"} | null
// Returns RoomAnalysis JSON, or { error: { code, message } } with a plain-language message.

import * as z from "zod/v4";
import { AnalysisError, analyzeRoomPhotos, getAnalyzer } from "@/lib/ai";
import { UserFacingError } from "@/lib/errors";
import { checkImageLimits, type InputImage } from "@/lib/images/preprocess";

const KnownMeasurementSchema = z.object({
  valueFt: z.number().positive().max(500),
  which: z.enum(["longest", "shortest", "unknown"]),
});

/** Optional per-photo lens info read by the browser before shrinking (aligned with `images`). */
const LensHintsSchema = z.array(
  z
    .object({
      focalLength35mm: z.number().positive().max(2000).nullable(),
      lensModel: z.string().max(200).nullable(),
    })
    .nullable(),
);

function parseLensHints(value: FormDataEntryValue | null, count: number) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const r = LensHintsSchema.safeParse(JSON.parse(value));
    // Hints are optional extras: if they don't line up with the photos, ignore them rather than fail.
    return r.success && r.data.length === count ? r.data : [];
  } catch {
    return [];
  }
}

const errorResponse = (code: string, message: string, status: number) =>
  Response.json({ error: { code, message } }, { status });

function parseKnownMeasurement(value: FormDataEntryValue | null) {
  if (value === null || (typeof value === "string" && value.trim() === "")) return undefined;
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : undefined;
  } catch {
    parsed = undefined;
  }
  const result = KnownMeasurementSchema.safeParse(parsed);
  if (!result.success) {
    throw new UserFacingError(
      "invalid_known_measurement",
      'The known measurement must look like {"valueFt": 14, "which": "longest"}, with a length in feet ' +
        'and "longest", "shortest" or "unknown".',
      400,
    );
  }
  return result.data;
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("invalid_request", "Send the photos as a form upload (multipart/form-data).", 400);
  }

  try {
    const files = form.getAll("images").filter((v): v is File => v instanceof File);
    // Count + size checks BEFORE reading any file into memory.
    checkImageLimits(files.map((f) => ({ name: f.name || "photo", size: f.size })));

    const roomNameRaw = form.get("roomName");
    const roomName = typeof roomNameRaw === "string" ? roomNameRaw.trim().slice(0, 100) : undefined;
    const knownMeasurement = parseKnownMeasurement(form.get("knownMeasurement"));

    const hints = parseLensHints(form.get("lensHints"), files.length);
    const inputs: InputImage[] = await Promise.all(
      files.map(async (f, i) => ({ name: f.name || "photo", bytes: new Uint8Array(await f.arrayBuffer()), lensHint: hints[i] ?? null })),
    );

    const analysis = await analyzeRoomPhotos(
      inputs,
      { roomName: roomName || undefined, knownMeasurement },
      getAnalyzer(),
    );
    return Response.json(analysis);
  } catch (e) {
    if (e instanceof UserFacingError) {
      if (e instanceof AnalysisError) console.error(`[api/estimate] ${e.code}: ${e.message}`);
      return errorResponse(e.code, e.userMessage, e.status);
    }
    // Never leak internals (SDK errors, stack traces) to the client.
    console.error("[api/estimate] unexpected error", e);
    return errorResponse("internal_error", "Something went wrong on our side. Please try again.", 500);
  }
}
