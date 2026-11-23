import { readFile } from "node:fs/promises";
import exifReader from "exif-reader";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ImageError,
  MAX_FILE_BYTES,
  MAX_LONG_EDGE_PX,
  looksLikeHeic,
  preprocessImages,
} from "@/lib/images/preprocess";
import { asInput, isBlue, isRed, makeImage, pixel } from "../helpers/images";

const HEIC_FIXTURE = "tests/fixtures/images/two-tone.heic";

async function expectImageError(p: Promise<unknown>, code: string, message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImageError);
  expect((err as ImageError).code).toBe(code);
  if (message) expect((err as ImageError).userMessage).toMatch(message);
}

/** Everything a stripped JPEG must NOT carry. */
async function expectNoMetadata(buf: Buffer) {
  const m = await sharp(buf).metadata();
  expect(m.exif).toBeUndefined();
  expect(m.xmp).toBeUndefined();
  expect(m.icc).toBeUndefined();
  expect(m.iptc).toBeUndefined();
  expect(m.orientation).toBeUndefined();
  expect(buf.includes(Buffer.from("Exif\0\0"))).toBe(false);
  expect(buf.includes(Buffer.from("TestCam"))).toBe(false);
}

describe("preprocessImages: output", () => {
  it("applies EXIF orientation before stripping it", async () => {
    // 200×100, red left / blue right, orientation 6 = displayed rotated 90° clockwise:
    // the red half ends up on TOP of a 100×200 portrait image.
    const [out] = await preprocessImages([asInput("rotated.jpg", await makeImage({ orientation: 6 }))]);
    expect([out.width, out.height]).toEqual([100, 200]);
    expect(isRed(await pixel(out.data, 50, 20))).toBe(true);
    expect(isBlue(await pixel(out.data, 50, 180))).toBe(true);
  });

  it("strips ALL metadata, including GPS", async () => {
    const src = await makeImage({ gps: true, focal35: 26, lensModel: "Test camera" });
    // sanity: the source really has GPS
    expect(exifReader((await sharp(src).metadata()).exif!).GPSInfo).toBeDefined();

    const [out] = await preprocessImages([asInput("gps.jpg", src)]);
    await expectNoMetadata(out.data);
  });

  it("caps the long edge and never enlarges", async () => {
    const [big, tall, small] = await preprocessImages([
      asInput("big.jpg", await makeImage({ width: 3000, height: 2000 })),
      asInput("tall.jpg", await makeImage({ width: 1000, height: 4000 })),
      asInput("small.jpg", await makeImage({ width: 400, height: 300 })),
    ]);
    expect([big.width, big.height]).toEqual([MAX_LONG_EDGE_PX, 1045]);
    expect(Math.max(tall.width, tall.height)).toBe(MAX_LONG_EDGE_PX);
    expect([small.width, small.height]).toEqual([400, 300]);
  });

  it("re-encodes PNG and WebP as JPEG", async () => {
    const out = await preprocessImages([
      asInput("a.png", await makeImage({ format: "png" })),
      asInput("b.webp", await makeImage({ format: "webp" })),
    ]);
    for (const o of out) {
      expect(o.mediaType).toBe("image/jpeg");
      expect((await sharp(o.data).metadata()).format).toBe("jpeg");
    }
    expect(out.map((o) => o.sourceFormat)).toEqual(["png", "webp"]);
  });

  it("converts HEIC (iPhone) to JPEG with correct pixels", async () => {
    const heic = await readFile(HEIC_FIXTURE);
    expect(looksLikeHeic(heic)).toBe(true);
    const [out] = await preprocessImages([asInput("IMG_0001.HEIC", heic)]);
    expect(out.sourceFormat).toBe("heic");
    expect([out.width, out.height]).toEqual([120, 80]);
    expect(isRed(await pixel(out.data, 10, 40))).toBe(true);
    expect(isBlue(await pixel(out.data, 110, 40))).toBe(true);
    await expectNoMetadata(out.data);
  });
});

describe("preprocessImages: lens detection", () => {
  it("classifies ultra-wide, standard and missing focal length; GPS still stripped", async () => {
    const out = await preprocessImages([
      asInput("ultra.jpg", await makeImage({ focal35: 13, lensModel: "back ultra wide camera", gps: true })),
      asInput("main.jpg", await makeImage({ focal35: 26, gps: true })),
      asInput("none.jpg", await makeImage({ gps: true })),
    ]);
    expect(out.map((o) => [o.lens, o.focalLength35mm])).toEqual([
      ["ultra_wide", 13],
      ["standard", 26],
      ["unknown", null],
    ]);
    for (const o of out) await expectNoMetadata(o.data);
  });
});

describe("preprocessImages: limits and errors", () => {
  it("rejects zero and more than 6 photos", async () => {
    await expectImageError(preprocessImages([]), "no_images");
    const one = asInput("x.jpg", await makeImage());
    await expectImageError(preprocessImages(Array(7).fill(one)), "too_many_images", /up to 6 photos.*sent 7/);
  });

  it("rejects files over 20MB before trying to decode them", async () => {
    // Not a valid image: if size weren't checked first this would be "unreadable_image".
    const huge = asInput("huge.jpg", Buffer.alloc(MAX_FILE_BYTES + 1));
    await expectImageError(preprocessImages([huge]), "file_too_large", /"huge\.jpg" is 20\.0MB.*20\.0MB or smaller/);
  });

  it("rejects unsupported formats, naming the file", async () => {
    await expectImageError(
      preprocessImages([asInput("anim.gif", await makeImage({ format: "gif" }))]),
      "unsupported_format",
      /"anim\.gif".*JPEG, PNG, WebP, or HEIC/,
    );
  });

  it("rejects garbage bytes, naming the file", async () => {
    await expectImageError(preprocessImages([asInput("notes.jpg", Buffer.from("hello world, not an image"))]), "unreadable_image", /"notes\.jpg"/);
  });

  it("gives a friendly HEIC error naming the file when conversion fails", async () => {
    const heic = await readFile(HEIC_FIXTURE);
    const corrupt = Buffer.concat([heic.subarray(0, 64), Buffer.alloc(400, 7)]); // valid header, junk body
    expect(looksLikeHeic(corrupt)).toBe(true);
    await expectImageError(
      preprocessImages([asInput("IMG_4242.HEIC", corrupt)]),
      "heic_conversion_failed",
      /"IMG_4242\.HEIC".*Most Compatible/,
    );
  });
});
