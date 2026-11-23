// localStorage persistence with a versioned schema and safe parsing.
// Corrupt, partial or old data must never crash the app: unreadable parts are skipped with a plain
// message, and the original text is backed up under another key before anything is overwritten.

import * as z from "zod/v4";
import { ISSUE_CODES, SECTION_LABELS } from "@/lib/ai/schema";
import type { RoomAnalysis } from "@/lib/ai/schema";
import { NO_AREA_EDITS } from "@/lib/estimate/merge";
import { SCHEMA_VERSION, emptyAppData, type AppData, type StoredProject, type StoredRoom } from "./model";

export const STORAGE_KEY = "flooring-estimator";
export const BACKUP_PREFIX = `${STORAGE_KEY}:backup:`;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Upgrades data from version N to N+1. Add one entry per schema change; never edit old ones. */
export type Migration = (data: unknown) => unknown;
export const MIGRATIONS: Record<number, Migration> = {
  // e.g. 1: (v1) => ({ ...v1, schemaVersion: 2, projects: … }),
};

// ---------- schemas (structural; the merge handles bad numbers without crashing) ----------

const num = z.number().refine(Number.isFinite, "must be a number");
const feetOrNull = num.positive().nullable();
const range = z.object({ low: num, likely: num, high: num });
const dims = { lengthFt: range, widthFt: range };

const AnalysisSchema = z
  .object({
    usable: z.boolean(),
    issues: z.array(z.object({ code: z.enum(ISSUE_CODES), message: z.string(), photoIndex: num.nullable(), source: z.enum(["model", "app"]) })),
    roomType: z.string(),
    shape: z.enum(["rectangle", "l_shape", "irregular"]),
    sections: z.array(z.object({ label: z.enum(SECTION_LABELS), ...dims, knownMeasurementAppliedTo: z.enum(["length", "width"]).nullable() })),
    obstacles: z.array(z.object({ label: z.string(), ...dims })),
    scaleReferences: z.array(z.object({ object: z.string(), assumedSize: z.string(), photoIndex: num.nullable() })),
    confidence: z.enum(["low", "medium", "high"]),
    confidenceReason: z.string(),
    existingFloor: z.string(),
    notes: z.array(z.string()),
    photos: z.array(z.unknown()),
    meta: z
      .object({
        model: z.string(),
        promptId: z.string(),
        promptVersion: z.string(),
        knownMeasurement: z.object({ valueFt: num.positive(), which: z.enum(["longest", "shortest", "unknown"]) }).nullable(),
      })
      .loose(),
  })
  .loose();

const AreaSizeSchema = z.object({ widthFt: num.positive(), depthFt: num.positive() });

const AreaEditsSchema = z.object({
  ai: z.record(z.string(), z.union([AreaSizeSchema, z.object({ removed: z.literal(true) })])),
  manualClosets: z.array(AreaSizeSchema.extend({ id: z.string(), label: z.string() })),
});

const RoomSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  walls: z.object({ longerFt: feetOrNull, shorterFt: feetOrNull }),
  productId: z.string(),
  layout: z.enum(["straight", "diagonal", "herringbone"]),
  priceOverridePerSqft: num.positive().nullable(),
  analysis: z.unknown(),
  analysisPhotoCount: z.number().int().min(0),
  areaEdits: z.unknown(),
  lastResult: z.unknown(),
});

const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  units: z.enum(["imperial", "metric"]),
  rooms: z.array(z.unknown()),
});

// ---------- parsing ----------

export interface LoadResult {
  data: AppData;
  /** Plain-language message to show if anything couldn't be read; null if all is well. */
  problem: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function parseRoom(raw: unknown, counts: { rooms: number; analyses: number; edits: number }): StoredRoom | null {
  const r = RoomSchema.safeParse(raw);
  if (!r.success) {
    counts.rooms++;
    return null;
  }
  let analysis: RoomAnalysis | null = null;
  if (r.data.analysis !== null && r.data.analysis !== undefined) {
    const a = AnalysisSchema.safeParse(r.data.analysis);
    if (a.success) analysis = a.data as unknown as RoomAnalysis;
    else counts.analyses++;
  }
  let areaEdits = NO_AREA_EDITS;
  const e = AreaEditsSchema.safeParse(r.data.areaEdits);
  if (e.success) areaEdits = analysis ? e.data : { ai: {}, manualClosets: e.data.manualClosets };
  else counts.edits++;
  return {
    ...r.data,
    analysis,
    analysisPhotoCount: analysis ? r.data.analysisPhotoCount : 0,
    areaEdits,
    lastResult: null, // a snapshot only; recomputed by the app
  };
}

/** Parse stored text. Never throws. */
export function parseAppData(raw: string | null, migrations: Record<number, Migration> = MIGRATIONS): LoadResult {
  if (raw === null || raw.trim() === "") return { data: emptyAppData(), problem: null };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { data: emptyAppData(), problem: "Your saved projects couldn't be read, so the app started fresh. A backup of the old data was kept." };
  }

  let version = typeof (json as { schemaVersion?: unknown })?.schemaVersion === "number" ? (json as { schemaVersion: number }).schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    return {
      data: emptyAppData(),
      problem: "Your saved projects were made by a newer version of this app and can't be opened here. A backup was kept.",
    };
  }
  while (version < SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      return { data: emptyAppData(), problem: "Your saved projects are in an old format that can't be upgraded. A backup was kept." };
    }
    try {
      json = migrate(json);
    } catch {
      return { data: emptyAppData(), problem: "Your saved projects couldn't be upgraded to this version. A backup was kept." };
    }
    version++;
  }

  const projectsRaw = (json as { projects?: unknown })?.projects;
  if (!Array.isArray(projectsRaw)) {
    return { data: emptyAppData(), problem: "Your saved projects couldn't be read, so the app started fresh. A backup of the old data was kept." };
  }

  const counts = { projects: 0, rooms: 0, analyses: 0, edits: 0 };
  const projects: StoredProject[] = [];
  for (const p of projectsRaw) {
    const parsed = ProjectSchema.safeParse(p);
    if (!parsed.success) {
      counts.projects++;
      continue;
    }
    const rooms = parsed.data.rooms.map((r) => parseRoom(r, counts)).filter((r): r is StoredRoom => r !== null);
    projects.push({ ...parsed.data, rooms });
  }

  const lost = [
    counts.projects && plural(counts.projects, "project was skipped", "projects were skipped"),
    counts.rooms && plural(counts.rooms, "room was skipped", "rooms were skipped"),
    counts.analyses && plural(counts.analyses, "photo analysis was cleared", "photo analyses were cleared"),
    counts.edits && plural(counts.edits, "closet list was reset", "closet lists were reset"),
  ].filter(Boolean);
  return {
    data: { schemaVersion: SCHEMA_VERSION, projects },
    problem: lost.length ? `Some saved data couldn't be read: ${lost.join(", ")}. A backup of the original data was kept.` : null,
  };
}

/** Load from storage. If anything was unreadable, the original text is backed up first. */
export function loadAppData(storage: StorageLike, migrations: Record<number, Migration> = MIGRATIONS): LoadResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyAppData(), problem: "This browser isn't letting the app read saved projects (private mode?). Projects won't be kept after you close the page." };
  }
  const result = parseAppData(raw, migrations);
  if (result.problem && raw !== null) {
    try {
      storage.setItem(`${BACKUP_PREFIX}${new Date().toISOString()}`, raw);
    } catch {
      // best effort
    }
  }
  return result;
}

export function saveAppData(storage: StorageLike, data: AppData): { ok: true } | { ok: false; message: string } {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Couldn't save: the browser's storage is full or blocked. Your latest changes will be lost when you close the page.",
    };
  }
}
