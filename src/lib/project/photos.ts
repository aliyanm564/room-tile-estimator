// Photos live in memory only (per browser tab), never in localStorage. Each photo is shrunk in the
// background as soon as it's added, so the upload is ready when the user presses Estimate.

import { useSyncExternalStore } from "react";
import { shrinkForUpload, type PreparedPhoto } from "@/lib/images/shrink-client";

export type PhotoSlot = 1 | 2 | 3 | 4;

export interface PhotoEntry {
  id: string;
  file: File;
  /** Which checklist shot this is; null = an extra photo. */
  slot: PhotoSlot | null;
  previewUrl: string;
  prepared: Promise<PreparedPhoto>;
}

export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

const EMPTY: PhotoEntry[] = [];
const byRoom = new Map<string, PhotoEntry[]>();
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

function set(roomId: string, entries: PhotoEntry[]) {
  byRoom.set(roomId, entries);
  emit();
}

function entryFor(file: File, slot: PhotoSlot | null): PhotoEntry {
  return {
    id: `photo-${++counter}`,
    file,
    slot,
    previewUrl: URL.createObjectURL(file),
    prepared: shrinkForUpload(file),
  };
}

/** Checklist photos first (1–4), then extras in the order added. This is the upload order. */
export function orderedPhotos(entries: PhotoEntry[]): PhotoEntry[] {
  return [...entries].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
}

export const photoStore = {
  get(roomId: string): PhotoEntry[] {
    return byRoom.get(roomId) ?? EMPTY;
  },
  /** Put a photo in a checklist slot (replacing any photo already there). */
  setSlot(roomId: string, slot: PhotoSlot, file: File) {
    const current = photoStore.get(roomId);
    const old = current.find((e) => e.slot === slot);
    if (old) URL.revokeObjectURL(old.previewUrl);
    set(roomId, [...current.filter((e) => e.slot !== slot), entryFor(file, slot)]);
  },
  /** Add extra photos, up to the 6-photo limit. Returns how many were added. */
  addExtras(roomId: string, files: File[]): number {
    const current = photoStore.get(roomId);
    const room = Math.max(0, MAX_PHOTOS - current.length);
    const added = files.slice(0, room).map((f) => entryFor(f, null));
    if (added.length) set(roomId, [...current, ...added]);
    return added.length;
  },
  remove(roomId: string, id: string) {
    const current = photoStore.get(roomId);
    const gone = current.find((e) => e.id === id);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    set(roomId, current.filter((e) => e.id !== id));
  },
  clearRoom(roomId: string) {
    for (const e of photoStore.get(roomId)) URL.revokeObjectURL(e.previewUrl);
    byRoom.delete(roomId);
    emit();
  },
  clearAll() {
    for (const id of [...byRoom.keys()]) photoStore.clearRoom(id);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function usePhotos(roomId: string): PhotoEntry[] {
  return useSyncExternalStore(
    photoStore.subscribe,
    () => photoStore.get(roomId),
    () => EMPTY,
  );
}
