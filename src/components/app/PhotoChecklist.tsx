"use client";

import { useState, type ChangeEvent } from "react";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, photoStore, usePhotos, type PhotoEntry, type PhotoSlot } from "@/lib/project/photos";
import { Badge } from "./ui";

const SLOTS: { slot: PhotoSlot; title: string; hint: string }[] = [
  { slot: 1, title: "Corner, looking across the room", hint: "Stand in a corner and fit as much floor as you can." },
  { slot: 2, title: "Opposite corner", hint: "From the far corner, looking back." },
  { slot: 3, title: "Doorway, with a door in the frame", hint: "A door gives the analyzer a known size." },
  { slot: 4, title: "Anything blocking the floor", hint: "Islands, built-ins, or closets with the doors open." },
];

function Thumb({ entry, label }: { entry: PhotoEntry; label: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-stone-200 p-1 text-center">
      <span className="text-xs font-semibold text-stone-700">Photo</span>
      <span className="break-all text-[10px] leading-tight text-stone-500">{entry.file.name}</span>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- local blob: preview; next/image can't optimize it
    <img src={entry.previewUrl} alt={label} onError={() => setBroken(true)} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
  );
}

const pickerClass =
  "relative inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold ring-1 ring-stone-300 bg-white active:bg-stone-100";

export default function PhotoChecklist({ roomId, photosRequired, disabled }: { roomId: string; photosRequired: boolean; disabled?: boolean }) {
  const photos = usePhotos(roomId);
  const [notice, setNotice] = useState<string | null>(null);
  const extras = photos.filter((p) => p.slot === null);
  const full = photos.length >= MAX_PHOTOS;

  function tooBig(files: File[]) {
    const big = files.filter((f) => f.size > MAX_PHOTO_BYTES);
    setNotice(big.length ? `${big.map((f) => `"${f.name}"`).join(", ")} ${big.length > 1 ? "are" : "is"} over 20MB and wasn't added.` : null);
    return files.filter((f) => f.size <= MAX_PHOTO_BYTES);
  }

  function pickSlot(slot: PhotoSlot, e: ChangeEvent<HTMLInputElement>) {
    const [file] = tooBig(Array.from(e.target.files ?? []));
    e.target.value = "";
    if (!file) return;
    const replacing = photos.some((p) => p.slot === slot);
    if (!replacing && full) return setNotice(`Up to ${MAX_PHOTOS} photos per room. Remove one first.`);
    photoStore.setSlot(roomId, slot, file);
  }

  function pickExtras(e: ChangeEvent<HTMLInputElement>) {
    const files = tooBig(Array.from(e.target.files ?? []));
    e.target.value = "";
    const added = photoStore.addExtras(roomId, files);
    if (added < files.length) setNotice(`Up to ${MAX_PHOTOS} photos per room: ${files.length - added} photo${files.length - added > 1 ? "s weren't" : " wasn't"} added.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-stone-700">
        <strong>Use the 1x camera, not 0.5x.</strong> The ultra-wide lens makes rooms look bigger. {photos.length} of {MAX_PHOTOS} photos.
      </p>

      <ol className="flex flex-col gap-2" aria-label="Photo checklist">
        {SLOTS.map(({ slot, title, hint }) => {
          const entry = photos.find((p) => p.slot === slot);
          const inputLabel = `${entry ? "Retake" : "Add"} photo ${slot}: ${title}`;
          return (
            <li key={slot} className="flex items-center gap-3 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200">
              {entry ? (
                <Thumb entry={entry} label={`Photo ${slot}: ${title}`} />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-2xl font-bold text-stone-400">
                  {slot}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-snug">
                  {slot}. {title} {slot === 1 && photosRequired && <Badge tone="amber">Required</Badge>}
                </p>
                <p className="text-sm text-stone-600">{hint}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <label className={`${pickerClass} ${disabled ? "pointer-events-none opacity-50" : ""}`}>
                    <input type="file" accept="image/*" className="sr-only" aria-label={inputLabel} disabled={disabled} onChange={(e) => pickSlot(slot, e)} />
                    {entry ? "Retake" : "Add photo"}
                  </label>
                  {entry && (
                    <button type="button" disabled={disabled} onClick={() => photoStore.remove(roomId, entry.id)} className={pickerClass} aria-label={`Remove photo ${slot}`}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {extras.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="More photos">
          {extras.map((e, i) => (
            <li key={e.id} className="relative">
              <Thumb entry={e} label={`Extra photo ${i + 1}`} />
              <button
                type="button"
                disabled={disabled}
                onClick={() => photoStore.remove(roomId, e.id)}
                aria-label={`Remove extra photo ${i + 1}`}
                className="absolute -right-2 -top-2 flex h-11 w-11 items-center justify-center"
              >
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-lg text-white">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className={`${pickerClass} min-h-12 text-base ${full || disabled ? "pointer-events-none opacity-50" : ""}`}>
        <input type="file" accept="image/*" multiple className="sr-only" aria-label="Add more photos" disabled={full || disabled} onChange={pickExtras} />
        {full ? "6 photos added" : "+ More photos"}
      </label>

      {notice && <p role="status" className="text-sm text-amber-800">{notice}</p>}
    </div>
  );
}
