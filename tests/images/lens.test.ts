import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { classifyLens, describeLens, readLensInfo } from "@/lib/images/lens";
import { makeImage } from "../helpers/images";

const info = (focalLength35mm: number | null, lensModel: string | null = null) => ({
  focalLength35mm,
  focalLengthMm: null,
  lensModel,
});

describe("classifyLens", () => {
  it.each([
    [13, "ultra_wide"], // iPhone 0.5x
    [19.9, "ultra_wide"],
    [20, "standard"],
    [24, "standard"], // iPhone 1x (older)
    [26, "standard"], // iPhone 1x
    [40, "standard"],
    [52, "telephoto"], // iPhone 2x
    [77, "telephoto"], // iPhone 3x
  ] as const)("%dmm equivalent → %s", (mm, expected) => {
    expect(classifyLens(info(mm))).toBe(expected);
  });

  it("falls back to explicit LensModel wording when focal length is missing", () => {
    expect(classifyLens(info(null, "Galaxy S24 ultra-wide camera"))).toBe("ultra_wide");
    expect(classifyLens(info(null, "Pixel 9 Pro telephoto"))).toBe("telephoto");
  });

  it('does NOT treat "dual wide camera" (iPhone main lens name) as ultra-wide', () => {
    expect(classifyLens(info(null, "iPhone 16 back dual wide camera 5.96mm f/1.6"))).toBe("unknown");
  });

  it("no metadata → unknown", () => {
    expect(classifyLens(info(null))).toBe("unknown");
  });

  it("describes each class for the prompt label", () => {
    expect(describeLens("ultra_wide", 13)).toMatch(/ultra-wide.*0\.5x.*13mm.*distortion/);
    expect(describeLens("standard", 26)).toBe("standard lens (1x, 26mm equivalent)");
    expect(describeLens("telephoto", 77)).toMatch(/telephoto.*77mm/);
    expect(describeLens("unknown", null)).toMatch(/unknown/);
  });
});

describe("readLensInfo", () => {
  it("reads only the lens fields from real EXIF", async () => {
    const buf = await makeImage({ focal35: 13, focalMm: 1.54, lensModel: "Test ultra wide camera", gps: true });
    const lens = readLensInfo((await sharp(buf).metadata()).exif);
    expect(lens).toEqual({ focalLength35mm: 13, focalLengthMm: 1.54, lensModel: "Test ultra wide camera" });
    expect(Object.keys(lens).sort()).toEqual(["focalLength35mm", "focalLengthMm", "lensModel"]); // no GPS
  });

  it("handles missing or malformed EXIF gracefully", () => {
    expect(readLensInfo(undefined).focalLength35mm).toBeNull();
    expect(readLensInfo(Buffer.from("not exif at all")).focalLength35mm).toBeNull();
  });
});
