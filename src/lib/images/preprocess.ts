// Photo preprocessing: validate → (HEIC → pixels) → apply EXIF orientation → strip ALL metadata
// → resize → JPEG. Lens info is the only metadata read, and it's read before anything is stripped.
// Customers' GPS location must never leave the server: nothing from the original EXIF is written out.

import decodeHeic from "heic-decode";
import sharp, { type Metadata, type Sharp } from "sharp";
import { UserFacingError } from "@/lib/errors";
import { classifyLens, readLensInfo, type LensClass } from "./lens";

export const MAX_IMAGES = 6;
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_LONG_EDGE_PX = 1568;
export const JPEG_QUALITY = 85;

export interface InputImage {
  /** Original file name, used in error messages. */
  name: string;
  bytes: Uint8Array;
  /**
   * Lens info read by the browser BEFORE it shrank the photo (shrinking drops EXIF). Used only if the
   * uploaded file has no lens data of its own.
   */
  lensHint?: { focalLength35mm: number | null; lensModel: string | null } | null;
}

export interface ProcessedImage {
  name: string;
  mediaType: "image/jpeg";
  /** Re-encoded JPEG. Contains no EXIF, GPS, ICC or XMP data. */
  data: Buffer;
  width: number;
  height: number;
  sourceFormat: "jpeg" | "png" | "webp" | "heic";
  lens: LensClass;
  focalLength35mm: number | null;
}

export class ImageError extends UserFacingError {}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/** Count and size checks. Run BEFORE any decoding (and before buffering, in the API route). */
export function checkImageLimits(files: { name: string; size: number }[]): void {
  if (files.length === 0) {
    throw new ImageError("no_images", "Add at least one photo of the room.", 400);
  }
  if (files.length > MAX_IMAGES) {
    throw new ImageError(
      "too_many_images",
      `You can send up to ${MAX_IMAGES} photos per room. You sent ${files.length}.`,
      413,
    );
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new ImageError(
        "file_too_large",
        `"${f.name}" is ${mb(f.size)}. Each photo must be ${mb(MAX_FILE_BYTES)} or smaller.`,
        413,
      );
    }
    if (f.size === 0) {
      throw new ImageError("unreadable_image", `"${f.name}" is empty. Try choosing the photo again.`, 400);
    }
  }
}

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/** Sniff an ISO-BMFF `ftyp` box for HEIC/HEIF brands (major or compatible). AVIF is excluded. */
export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(4, 8) !== "ftyp") return false;
  const boxSize = Math.min((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3], bytes.length);
  const brands = [ascii(8, 12)];
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(i, i + 4));
  if (brands.includes("avif") || brands.includes("avis")) return false;
  return brands.some((b) => HEIF_BRANDS.has(b));
}

const unsupported = (name: string) =>
  new ImageError(
    "unsupported_format",
    `"${name}" isn't a supported photo type. Use JPEG, PNG, WebP, or HEIC (iPhone) photos.`,
    415,
  );

const unreadable = (name: string, detail?: unknown) =>
  new ImageError(
    "unreadable_image",
    `We couldn't read "${name}". The file may be damaged. Try taking or exporting the photo again.`,
    400,
    detail instanceof Error ? `${name}: ${detail.message}` : undefined,
  );

const heicFailed = (name: string, detail?: unknown) =>
  new ImageError(
    "heic_conversion_failed",
    `We couldn't convert "${name}" (an iPhone HEIC photo). Try sharing it as a JPEG instead, or set ` +
      `your iPhone to Settings → Camera → Formats → Most Compatible.`,
    422,
    detail instanceof Error ? `${name}: ${detail.message}` : undefined,
  );

async function processOne(file: InputImage): Promise<ProcessedImage> {
  const isHeic = looksLikeHeic(file.bytes);

  // 1. Read header (+ raw EXIF block) without decoding pixels. sharp can parse a HEIC container
  //    even though its prebuilt binaries can't decode HEVC pixels.
  let meta: Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch (e) {
    throw isHeic ? heicFailed(file.name, e) : unreadable(file.name, e);
  }

  // 2. Lens info — the ONLY metadata we keep — read before anything is stripped.
  const fromExif = readLensInfo(meta.exif);
  const noExifLens = fromExif.focalLength35mm === null && fromExif.lensModel === null;
  const lensInfo = noExifLens && file.lensHint ? { ...file.lensHint, focalLengthMm: null } : fromExif;
  const lens = classifyLens(lensInfo);

  // 3. Get a pipeline sharp can decode.
  let pipeline: Sharp;
  let sourceFormat: ProcessedImage["sourceFormat"];
  if (isHeic) {
    try {
      // libheif applies the HEIF rotation/mirror transforms while decoding.
      const img = await decodeHeic({ buffer: file.bytes });
      pipeline = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
        raw: { width: img.width, height: img.height, channels: 4 },
      });
    } catch (e) {
      throw heicFailed(file.name, e);
    }
    sourceFormat = "heic";
  } else if (meta.format === "jpeg" || meta.format === "png" || meta.format === "webp") {
    // .rotate() with no argument applies the EXIF Orientation tag.
    pipeline = sharp(file.bytes).rotate();
    sourceFormat = meta.format;
  } else {
    throw unsupported(file.name);
  }

  // 4. Resize + re-encode. sharp writes NO metadata unless asked (no withMetadata/keepExif here),
  //    so EXIF, GPS, XMP and ICC are all dropped; pixels are converted to sRGB.
  try {
    const { data, info } = await pipeline
      .flatten({ background: "#ffffff" }) // PNG/WebP transparency → white, since JPEG has no alpha
      .resize({
        width: MAX_LONG_EDGE_PX,
        height: MAX_LONG_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      name: file.name,
      mediaType: "image/jpeg",
      data,
      width: info.width,
      height: info.height,
      sourceFormat,
      lens,
      focalLength35mm: lensInfo.focalLength35mm,
    };
  } catch (e) {
    throw isHeic ? heicFailed(file.name, e) : unreadable(file.name, e);
  }
}

/** Validate limits, then preprocess each photo (in order). */
export async function preprocessImages(files: InputImage[]): Promise<ProcessedImage[]> {
  checkImageLimits(files.map((f) => ({ name: f.name, size: f.bytes.byteLength })));
  // Sequential on purpose: a 24MP HEIC decodes to ~100MB of raw pixels.
  const out: ProcessedImage[] = [];
  for (const f of files) out.push(await processOne(f));
  return out;
}
