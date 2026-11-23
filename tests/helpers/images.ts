// Synthetic test images, generated in memory. No real homes, no real GPS.
import sharp from "sharp";
import type { ModelOutput } from "@/lib/ai/schema";
import type { ProcessedImage } from "@/lib/images/preprocess";

export const RED = { r: 220, g: 20, b: 20 };
export const BLUE = { r: 20, g: 20, b: 220 };

/** A fake GPS position (Toronto-ish). Used to prove GPS is stripped. */
export const FAKE_GPS = { GPSLatitudeRef: "N", GPSLatitude: "43/1 39/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "79/1 23/1 0/1" };

interface Opts {
  width?: number;
  height?: number;
  format?: "jpeg" | "png" | "webp" | "gif";
  /** EXIF Orientation (e.g. 6 = rotate 90° clockwise to display). */
  orientation?: number;
  focal35?: number;
  focalMm?: number;
  lensModel?: string;
  gps?: boolean;
}

/** Left half red, right half blue, with optional EXIF. */
export async function makeImage(o: Opts = {}): Promise<Buffer> {
  const width = o.width ?? 200;
  const height = o.height ?? 100;
  const left = await sharp({ create: { width: Math.floor(width / 2), height, channels: 3, background: RED } })
    .png()
    .toBuffer();
  let img = sharp({ create: { width, height, channels: 3, background: BLUE } }).composite([
    { input: left, left: 0, top: 0 },
  ]);
  img = o.format === "png" ? img.png() : o.format === "webp" ? img.webp() : o.format === "gif" ? img.gif() : img.jpeg();

  const ifd2: Record<string, string> = {};
  if (o.focal35 !== undefined) ifd2.FocalLengthIn35mmFilm = String(o.focal35);
  if (o.focalMm !== undefined) ifd2.FocalLength = `${Math.round(o.focalMm * 100)}/100`;
  if (o.lensModel !== undefined) ifd2.LensModel = o.lensModel;
  const exif: Record<string, Record<string, string>> = { IFD0: { Make: "TestCam", Model: "Test 1" } };
  if (Object.keys(ifd2).length) exif.IFD2 = ifd2;
  if (o.gps) exif.IFD3 = FAKE_GPS;
  if (o.format !== "gif") img = img.withExif(exif);
  if (o.orientation !== undefined) img = img.withMetadata({ orientation: o.orientation });
  return img.toBuffer();
}

export const asInput = (name: string, buf: Buffer) => ({ name, bytes: new Uint8Array(buf) });

/** Read an RGB pixel from an encoded image. */
export async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

export const isRed = (p: { r: number; g: number; b: number }) => p.r > 150 && p.b < 100;
export const isBlue = (p: { r: number; g: number; b: number }) => p.b > 150 && p.r < 100;

/** A tiny already-processed image, for provider tests (skips sharp). */
export function fakeProcessed(lens: ProcessedImage["lens"] = "standard", name = "photo.jpg"): ProcessedImage {
  return {
    name,
    mediaType: "image/jpeg",
    data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    width: 1568,
    height: 1176,
    sourceFormat: "jpeg",
    lens,
    focalLength35mm: lens === "ultra_wide" ? 13 : lens === "standard" ? 26 : null,
  };
}

export const r = (low: number, likely: number, high: number) => ({ low, likely, high });

type R = ReturnType<typeof r>;

/** A model section. Defaults: label "main", no known measurement applied. */
export const sec = (
  lengthFt: R,
  widthFt: R,
  label: "main" | "closet" | "other" = "main",
  knownMeasurementAppliedTo: "length" | "width" | null = null,
) => ({ label, lengthFt, widthFt, knownMeasurementAppliedTo });

/** A valid model output for a 12×10 ft bedroom. */
export function validOutput(overrides: Partial<ModelOutput> = {}): ModelOutput {
  return {
    usable: true,
    issues: [],
    roomType: "bedroom",
    shape: "rectangle",
    sections: [sec(r(11, 12, 13), r(9.5, 10, 10.5))],
    obstacles: [],
    scaleReferences: [{ object: "interior door", assumedSize: "80 in tall", photoIndex: 1 }],
    confidence: "medium",
    confidenceReason: "A standard door gives a clear scale, but one corner is hidden.",
    existingFloor: "beige carpet",
    notes: ["A photo from the opposite corner would narrow the range."],
    ...overrides,
  };
}
