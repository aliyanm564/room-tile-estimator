// Browser-side photo shrinking before upload: if the browser can decode the photo, resize it to
// ≤ 1568px on the long edge and re-encode as JPEG (uploads go from ~3–5MB to ~0.3MB). If it can't
// (e.g. HEIC in Chrome), the original is uploaded and the server converts it.
// Re-encoding drops EXIF (incl. GPS), so the lens fields are read first and sent as a hint.

import { readJpegLensHint, type LensHint } from "./exif-lite";

export const CLIENT_MAX_EDGE_PX = 1568;
export const CLIENT_JPEG_QUALITY = 0.85;

export interface PreparedPhoto {
  /** What gets uploaded: the shrunk JPEG, or the original file. */
  file: Blob;
  name: string;
  /** Lens info read from the original (null when the server can read it from the file itself). */
  lensHint: LensHint | null;
  shrunk: boolean;
}

/** Target size: fit inside max × max, never enlarge. */
export function targetSize(width: number, height: number, max = CLIENT_MAX_EDGE_PX): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height, scaled: false };
  const k = max / long;
  return { width: Math.round(width * k), height: Math.round(height * k), scaled: true };
}

const jpegName = (name: string) => name.replace(/\.[^.]+$/, "") + ".jpg";

async function readLens(file: Blob): Promise<LensHint | null> {
  // EXIF sits at the start of a JPEG; 256KB is plenty.
  const hint = readJpegLensHint(await file.slice(0, 256 * 1024).arrayBuffer());
  return hint.focalLength35mm !== null || hint.lensModel !== null ? hint : null;
}

/** Decode with an <img>, which applies the EXIF orientation in all current browsers. */
function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img
    .decode()
    .then(() => img)
    .finally(() => URL.revokeObjectURL(url));
}

export async function shrinkForUpload(file: File): Promise<PreparedPhoto> {
  const original: PreparedPhoto = { file, name: file.name, lensHint: null, shrunk: false };
  if (typeof document === "undefined") return original;
  try {
    const img = await decode(file);
    const size = targetSize(img.naturalWidth, img.naturalHeight);
    if (!size.scaled && file.type === "image/jpeg") return original; // already small: keep EXIF as-is
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#fff"; // transparent PNGs → white
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", CLIENT_JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return original;
    return { file: blob, name: jpegName(file.name), lensHint: await readLens(file), shrunk: true };
  } catch {
    return original; // can't decode here (e.g. HEIC in Chrome): the server handles it
  }
}
