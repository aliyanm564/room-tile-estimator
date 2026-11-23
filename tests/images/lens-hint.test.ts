// Browser-side lens hints: read before shrinking (which drops EXIF), used by the server only when the
// uploaded file has no lens data of its own.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readJpegLensHint } from "@/lib/images/exif-lite";
import { preprocessImages } from "@/lib/images/preprocess";
import { targetSize } from "@/lib/images/shrink-client";
import { asInput, makeImage } from "../helpers/images";

describe("readJpegLensHint (browser-safe EXIF reader)", () => {
  it("reads 35mm focal length and lens model, nothing else", async () => {
    const jpg = await makeImage({ focal35: 13, lensModel: "iPhone 16 back ultra wide camera 1.54mm f/2.2", gps: true });
    expect(readJpegLensHint(jpg)).toEqual({ focalLength35mm: 13, lensModel: "iPhone 16 back ultra wide camera 1.54mm f/2.2" });
    expect(readJpegLensHint(new Uint8Array(jpg).buffer)).toMatchObject({ focalLength35mm: 13 });
  });

  it("missing EXIF, other formats and garbage → nulls, never throws", async () => {
    const none = { focalLength35mm: null, lensModel: null };
    expect(readJpegLensHint(await makeImage({}))).toEqual(none);
    expect(readJpegLensHint(await makeImage({ format: "png" }))).toEqual(none);
    expect(readJpegLensHint(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toEqual(none);
    expect(readJpegLensHint(new Uint8Array(0))).toEqual(none);
  });
});

describe("server uses the hint only when the file has no lens EXIF", () => {
  it("shrunk photo (no EXIF) + ultra-wide hint → classified ultra_wide; GPS still stripped", async () => {
    const shrunk = await sharp(await makeImage({ width: 800, height: 600 })).jpeg().toBuffer(); // no EXIF, like a canvas re-encode
    const [out] = await preprocessImages([{ ...asInput("a.jpg", shrunk), lensHint: { focalLength35mm: 13, lensModel: null } }]);
    expect(out.lens).toBe("ultra_wide");
    expect(out.focalLength35mm).toBe(13);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });

  it("the file's own EXIF wins over a hint", async () => {
    const withExif = await makeImage({ focal35: 26 });
    const [out] = await preprocessImages([{ ...asInput("a.jpg", withExif), lensHint: { focalLength35mm: 13, lensModel: null } }]);
    expect(out.lens).toBe("standard");
  });

  it("no EXIF and no hint → unknown (no warning)", async () => {
    const [out] = await preprocessImages([asInput("a.jpg", await sharp(await makeImage({})).jpeg().toBuffer())]);
    expect(out.lens).toBe("unknown");
  });
});

describe("client shrink target size", () => {
  it("fits inside 1568px, keeps aspect, never enlarges", () => {
    expect(targetSize(4284, 5712)).toEqual({ width: 1176, height: 1568, scaled: true });
    expect(targetSize(4032, 3024)).toEqual({ width: 1568, height: 1176, scaled: true });
    expect(targetSize(1200, 900)).toEqual({ width: 1200, height: 900, scaled: false });
  });
});
