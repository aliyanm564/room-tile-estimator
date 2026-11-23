"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/**
 * Photo picker. `accept="image/*"` without `capture`, so phones offer camera OR library and
 * laptops get the file picker. HEIC can't be previewed in most desktop browsers: shows a name tile.
 */
export default function PhotoPicker({
  photos,
  onChange,
  disabled,
}: {
  photos: File[];
  onChange: (photos: File[]) => void;
  disabled?: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<File>>(new Set());

  const urls = useMemo(() => photos.map((f) => (isHeic(f) ? null : URL.createObjectURL(f))), [photos]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  function add(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again after removing it
    const messages: string[] = [];
    const tooBig = picked.filter((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig.length) messages.push(`${tooBig.map((f) => `"${f.name}"`).join(", ")} ${tooBig.length > 1 ? "are" : "is"} over 20MB and wasn't added.`);
    const ok = picked.filter((f) => f.size <= MAX_PHOTO_BYTES);
    const room = MAX_PHOTOS - photos.length;
    if (ok.length > room) messages.push(`Up to ${MAX_PHOTOS} photos per room: ${ok.length - room} extra photo${ok.length - room > 1 ? "s weren't" : " wasn't"} added.`);
    setNotice(messages.length ? messages.join(" ") : null);
    if (ok.length && room > 0) onChange([...photos, ...ok.slice(0, room)]);
  }

  function remove(i: number) {
    setNotice(null);
    onChange(photos.filter((_, j) => j !== i));
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <fieldset>
      <legend className="mb-1 text-base font-semibold">Photos of the room</legend>
      <p className="mb-3 text-sm text-stone-600">
        Use the 1x camera (not 0.5x). Corners and doorways help most. {photos.length} of {MAX_PHOTOS}
      </p>

      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2" aria-label="Selected photos">
          {photos.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-stone-200">
              {urls[i] && !broken.has(f) ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize it
                <img
                  src={urls[i]!}
                  alt={`Photo ${i + 1}: ${f.name}`}
                  className="h-full w-full object-cover"
                  onError={() => setBroken((b) => new Set(b).add(f))}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                  <span className="text-sm font-semibold text-stone-700">Photo {i + 1}</span>
                  <span className="break-all text-xs text-stone-500">{f.name}</span>
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center disabled:opacity-50"
              >
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-lg leading-none text-white">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className={`flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-semibold ring-1 ${
          full || disabled
            ? "cursor-not-allowed bg-stone-100 text-stone-400 ring-stone-200"
            : "cursor-pointer bg-white text-stone-900 ring-stone-400 active:bg-stone-100"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={full || disabled}
          onChange={add}
          className="sr-only"
          aria-label="Add photos"
        />
        {full ? "6 photos added" : photos.length ? "Add more photos" : "Take or choose photos"}
      </label>

      {notice && (
        <p role="status" className="mt-2 text-sm text-amber-800">
          {notice}
        </p>
      )}
    </fieldset>
  );
}
