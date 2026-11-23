// Minimal, browser-safe EXIF reader for JPEG: reads ONLY the lens fields (35mm-equivalent focal
// length and lens model), nothing else. Used before the browser shrinks a photo (re-encoding drops
// EXIF), so the server can still flag ultra-wide (0.5x) photos. Never throws.

export interface LensHint {
  focalLength35mm: number | null;
  lensModel: string | null;
}

const NONE: LensHint = { focalLength35mm: null, lensModel: null };

const TAG_EXIF_IFD = 0x8769;
const TAG_FOCAL_35 = 0xa405; // FocalLengthIn35mmFilm, SHORT
const TAG_LENS_MODEL = 0xa434; // LensModel, ASCII

export function readJpegLensHint(input: ArrayBuffer | Uint8Array): LensHint {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(0) !== 0xffd8) return NONE; // not a JPEG

    let off = 2;
    while (off + 4 <= view.byteLength) {
      const marker = view.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return NONE; // start of image data: no EXIF
      const size = view.getUint16(off + 2);
      if (marker === 0xffe1 && size >= 8 && String.fromCharCode(...bytes.subarray(off + 4, off + 10)) === "Exif\0\0") {
        return readTiff(view, bytes, off + 10, off + 2 + size);
      }
      off += 2 + size;
    }
    return NONE;
  } catch {
    return NONE;
  }
}

function readTiff(view: DataView, bytes: Uint8Array, tiff: number, end: number): LensHint {
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return NONE;
  const le = order === 0x4949;
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);

  const ifdEntries = (ifdOffset: number) => {
    const start = tiff + ifdOffset;
    if (start + 2 > end) return [];
    const n = u16(start);
    return Array.from({ length: n }, (_, i) => start + 2 + i * 12).filter((e) => e + 12 <= end);
  };

  const exifPtr = ifdEntries(u32(tiff + 4)).find((e) => u16(e) === TAG_EXIF_IFD);
  if (exifPtr === undefined) return NONE;

  let focalLength35mm: number | null = null;
  let lensModel: string | null = null;
  for (const e of ifdEntries(u32(exifPtr + 8))) {
    const tag = u16(e);
    if (tag === TAG_FOCAL_35) {
      const v = u16(e + 8);
      focalLength35mm = v > 0 ? v : null;
    } else if (tag === TAG_LENS_MODEL) {
      const count = u32(e + 4);
      const at = count <= 4 ? e + 8 : tiff + u32(e + 8);
      if (at + count <= end) {
        const text = String.fromCharCode(...bytes.subarray(at, at + count)).replace(/\0+$/, "").trim();
        lensModel = text || null;
      }
    }
  }
  return { focalLength35mm, lensModel };
}
