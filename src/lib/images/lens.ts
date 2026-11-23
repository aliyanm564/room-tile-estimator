// Lens / zoom classification from EXIF. Phone ultra-wide (0.5x) photos distort the room and
// exaggerate depth, so rooms look bigger than they are. We detect them deterministically.

import exifReader from "exif-reader";

export type LensClass = "ultra_wide" | "standard" | "telephoto" | "unknown";

/** 35mm-equivalent focal length thresholds (mm). iPhone: 0.5x ≈ 13mm, 1x ≈ 24–26mm, 2x ≈ 48–52mm. */
export const ULTRA_WIDE_BELOW_MM = 20;
export const TELEPHOTO_ABOVE_MM = 40;

/** The ONLY metadata we read from a photo. Everything else (GPS included) is discarded. */
export interface LensInfo {
  focalLength35mm: number | null;
  focalLengthMm: number | null;
  lensModel: string | null;
}

const EMPTY: LensInfo = { focalLength35mm: null, focalLengthMm: null, lensModel: null };

const positiveOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Extract lens fields from a raw EXIF block (as returned by sharp's metadata().exif).
 * Copies out only the three lens fields; the parsed object (which may contain GPS) is dropped.
 */
export function readLensInfo(exif: Buffer | undefined): LensInfo {
  if (!exif || exif.length === 0) return EMPTY;
  try {
    const photo = exifReader(exif).Photo;
    if (!photo) return EMPTY;
    return {
      focalLength35mm: positiveOrNull(photo.FocalLengthIn35mmFilm),
      focalLengthMm: positiveOrNull(photo.FocalLength),
      lensModel: typeof photo.LensModel === "string" && photo.LensModel.trim() ? photo.LensModel.trim() : null,
    };
  } catch {
    return EMPTY; // malformed EXIF: treat as unknown, never fail the photo
  }
}

/**
 * Classify the lens. Primary signal: 35mm-equivalent focal length.
 * Fallback: explicit wording in LensModel. We deliberately do NOT infer from the word "wide" alone —
 * on dual-camera iPhones even the 1x main camera reports "back dual wide camera". The raw
 * FocalLength (mm) can't be classified without the sensor crop factor, so it's kept for logging only.
 */
export function classifyLens(info: LensInfo): LensClass {
  const f = info.focalLength35mm;
  if (f !== null) {
    if (f < ULTRA_WIDE_BELOW_MM) return "ultra_wide";
    if (f > TELEPHOTO_ABOVE_MM) return "telephoto";
    return "standard";
  }
  const model = info.lensModel?.toLowerCase() ?? "";
  if (/ultra[\s-]?wide/.test(model)) return "ultra_wide";
  if (/telephoto/.test(model)) return "telephoto";
  return "unknown";
}

/** Short description for the "Photo N" label sent to the model. */
export function describeLens(lens: LensClass, focalLength35mm: number | null): string {
  const mm = focalLength35mm !== null ? `, ${Math.round(focalLength35mm)}mm equivalent` : "";
  switch (lens) {
    case "ultra_wide":
      return `ultra-wide lens (0.5x${mm}): strong edge distortion and exaggerated depth`;
    case "standard":
      return `standard lens (1x${mm})`;
    case "telephoto":
      return `telephoto lens (zoomed${mm}): compressed depth, narrow view`;
    case "unknown":
      return "lens unknown (no camera data)";
  }
}
