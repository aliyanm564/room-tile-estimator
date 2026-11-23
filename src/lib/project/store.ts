// Client-side app state: the saved projects (localStorage) behind a tiny external store, read with
// useSyncExternalStore. On the server (and during the first render) the state is null ("loading").

import { useSyncExternalStore } from "react";
import type { FlooringProduct, Settings } from "@/types";
import { emptyAppData, lastResultOf, roomOutcome, updateRoom, type AppData, type RoomPatch } from "./model";
import { STORAGE_KEY, loadAppData, saveAppData, type StorageLike } from "./storage";

export interface AppState {
  data: AppData;
  /** Problem reading saved data (shown once, dismissible). */
  problem: string | null;
  /** Problem saving (e.g. storage full). */
  saveError: string | null;
}

const memory = new Map<string, string>();
const memoryStorage: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };

function storage(): StorageLike {
  try {
    return window.localStorage; // can throw in sandboxed / locked-down browsers
  } catch {
    return memoryStorage;
  }
}

let state: AppState | null = null;
const listeners = new Set<() => void>();
let ctx: { products: FlooringProduct[]; settings: Settings } | null = null;

function load(): AppState {
  const r = loadAppData(storage());
  return { data: r.data, problem: r.problem, saveError: null };
}

function emit() {
  for (const l of listeners) l();
}

function onStorageEvent(e: StorageEvent) {
  // Another tab changed the data: reload so we don't overwrite it with a stale copy.
  if (e.key === STORAGE_KEY) {
    state = load();
    emit();
  }
}

export const projectStore = {
  /** Products/settings are needed to keep each room's saved result snapshot up to date. */
  configure(products: FlooringProduct[], settings: Settings) {
    ctx = { products, settings };
  },
  subscribe(listener: () => void) {
    if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorageEvent);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorageEvent);
    };
  },
  getSnapshot(): AppState {
    state ??= load();
    return state;
  },
  getServerSnapshot(): AppState | null {
    return null;
  },
  update(fn: (data: AppData) => AppData) {
    const current = projectStore.getSnapshot();
    const data = fn(current.data);
    const saved = saveAppData(storage(), data);
    state = { ...current, data, saveError: saved.ok ? null : saved.message };
    emit();
  },
  /** Update a room and refresh its saved result snapshot. */
  updateRoom(projectId: string, roomId: string, patch: RoomPatch) {
    projectStore.update((d) => {
      const next = updateRoom(d, projectId, roomId, patch);
      const room = next.projects.find((p) => p.id === projectId)?.rooms.find((r) => r.id === roomId);
      if (!room || !ctx) return next;
      return updateRoom(next, projectId, roomId, { lastResult: lastResultOf(roomOutcome(room, ctx.products, ctx.settings)) });
    });
  },
  dismissProblem() {
    const s = projectStore.getSnapshot();
    state = { ...s, problem: null };
    emit();
  },
  resetAll() {
    projectStore.update(() => emptyAppData());
  },
};

export function useAppState(): AppState | null {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot, projectStore.getServerSnapshot);
}
