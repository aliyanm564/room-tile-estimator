// Projects and rooms as stored in the browser. Pure functions only (no React, no storage I/O).
// Photos are NOT stored (localStorage is ~5MB); the AI analysis made from them is.

import type { RoomAnalysis } from "@/lib/ai/schema";
import { addRanges } from "@/lib/calc/range";
import { buildEstimate, NO_AREA_EDITS, type AreaEdits, type EstimateOutcome, type Walls } from "@/lib/estimate/merge";
import type { FlooringProduct, Layout, ResultRange, Settings, UnitSystem } from "@/types";

export const SCHEMA_VERSION = 1;

export interface LastResult {
  status: EstimateOutcome["status"];
  areaSqft: ResultRange | null;
  sqftNeeded: ResultRange | null;
  boxes: ResultRange | null;
  cost: ResultRange | null;
  computedAt: string;
}

export interface StoredRoom {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Canonical feet; null = not entered. */
  walls: Walls;
  productId: string;
  layout: Layout;
  priceOverridePerSqft: number | null;
  analysis: RoomAnalysis | null;
  /** How many photos the analysis was made from. The photos themselves are not stored. */
  analysisPhotoCount: number;
  areaEdits: AreaEdits;
  /** Snapshot saved with the room for the record. The UI always recomputes from the inputs. */
  lastResult: LastResult | null;
}

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  units: UnitSystem;
  rooms: StoredRoom[];
}

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  projects: StoredProject[];
}

export const emptyAppData = (): AppData => ({ schemaVersion: SCHEMA_VERSION, projects: [] });

/**
 * Random id. Uses crypto.getRandomValues, which (unlike crypto.randomUUID) also works on plain-http
 * LAN addresses, where phones load the dev server.
 */
export function newId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const now = () => new Date().toISOString();

// ---------- projects ----------

export function createProject(data: AppData, name: string, units: UnitSystem, id = newId()): AppData {
  const t = now();
  const project: StoredProject = { id, name: name.trim() || "Untitled project", createdAt: t, updatedAt: t, units, rooms: [] };
  return { ...data, projects: [project, ...data.projects] };
}

function mapProject(data: AppData, projectId: string, f: (p: StoredProject) => StoredProject): AppData {
  return { ...data, projects: data.projects.map((p) => (p.id === projectId ? { ...f(p), updatedAt: now() } : p)) };
}

export const renameProject = (data: AppData, projectId: string, name: string) =>
  mapProject(data, projectId, (p) => ({ ...p, name: name.trim() || p.name }));

export const setProjectUnits = (data: AppData, projectId: string, units: UnitSystem) =>
  mapProject(data, projectId, (p) => ({ ...p, units }));

export const deleteProject = (data: AppData, projectId: string): AppData => ({
  ...data,
  projects: data.projects.filter((p) => p.id !== projectId),
});

export const addProject = (data: AppData, project: StoredProject): AppData => ({ ...data, projects: [project, ...data.projects] });

// ---------- rooms ----------

export function newRoom(name: string, defaults: { productId: string; layout?: Layout }, id = newId()): StoredRoom {
  const t = now();
  return {
    id,
    name: name.trim() || "Room",
    createdAt: t,
    updatedAt: t,
    walls: { longerFt: null, shorterFt: null },
    productId: defaults.productId,
    layout: defaults.layout ?? "straight",
    priceOverridePerSqft: null,
    analysis: null,
    analysisPhotoCount: 0,
    areaEdits: NO_AREA_EDITS,
    lastResult: null,
  };
}

export const addRoom = (data: AppData, projectId: string, room: StoredRoom) =>
  mapProject(data, projectId, (p) => ({ ...p, rooms: [...p.rooms, room] }));

export const deleteRoom = (data: AppData, projectId: string, roomId: string) =>
  mapProject(data, projectId, (p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== roomId) }));

export type RoomPatch = Partial<Pick<StoredRoom, "name" | "walls" | "productId" | "layout" | "priceOverridePerSqft" | "areaEdits" | "lastResult">>;

export const updateRoom = (data: AppData, projectId: string, roomId: string, patch: RoomPatch) =>
  mapProject(data, projectId, (p) => ({
    ...p,
    rooms: p.rooms.map((r) =>
      r.id === roomId ? { ...r, ...patch, name: patch.name !== undefined ? patch.name.trim() || r.name : r.name, updatedAt: now() } : r,
    ),
  }));

/**
 * Save a new analysis. Edits to the OLD analysis's closets/built-ins are keyed by its indexes, so they
 * are cleared; closets the user added by hand are kept.
 */
export const setRoomAnalysis = (data: AppData, projectId: string, roomId: string, analysis: RoomAnalysis, photoCount: number) =>
  mapProject(data, projectId, (p) => ({
    ...p,
    rooms: p.rooms.map((r) =>
      r.id === roomId
        ? { ...r, analysis, analysisPhotoCount: photoCount, areaEdits: { ai: {}, manualClosets: r.areaEdits.manualClosets }, updatedAt: now() }
        : r,
    ),
  }));

// ---------- estimates ----------

export function resolveProduct(products: FlooringProduct[], productId: string): { product: FlooringProduct; missing: boolean } {
  const found = products.find((p) => p.id === productId);
  return found ? { product: found, missing: false } : { product: products[0], missing: true };
}

/** The room's estimate, computed from its saved inputs (pure; never calls the AI). */
export function roomOutcome(room: StoredRoom, products: FlooringProduct[], settings: Settings): EstimateOutcome {
  const { product } = resolveProduct(products, room.productId);
  return buildEstimate(
    {
      analysis: room.analysis,
      walls: room.walls,
      layout: room.layout,
      priceOverridePerSqft: room.priceOverridePerSqft,
      areaEdits: room.areaEdits,
    },
    product,
    settings,
  );
}

export function lastResultOf(outcome: EstimateOutcome): LastResult {
  const r = outcome.status === "ok" ? outcome.estimate.result : null;
  return {
    status: outcome.status,
    areaSqft: r?.areaSqft ?? null,
    sqftNeeded: r?.sqftNeeded ?? null,
    boxes: r?.boxes ?? null,
    cost: r?.cost ?? null,
    computedAt: now(),
  };
}

export type RoomStatus = "measured" | "estimated" | "needs_input" | "needs_photos" | "unusable" | "invalid";

export function roomStatus(outcome: EstimateOutcome): RoomStatus {
  switch (outcome.status) {
    case "ok":
      return outcome.estimate.confidence === "measured" && outcome.estimate.items.every((i) => i.removed || i.source === "measured")
        ? "measured"
        : "estimated";
    case "empty":
      return "needs_input";
    case "needs_photos":
      return "needs_photos";
    case "unusable":
      return "unusable";
    case "invalid":
      return "invalid";
  }
}

export interface HouseTotal {
  /** Rooms included in the total (those with an estimate). */
  includedRooms: number;
  /** Rooms still needing photos or measurements (not in the total). */
  pendingRooms: number;
  areaSqft: ResultRange | null;
  sqftNeeded: ResultRange | null;
  cost: ResultRange | null;
  /** Boxes only add up per product. */
  boxesByProduct: { productId: string; boxes: ResultRange }[];
  anyPlaceholderPrice: boolean;
  anyEstimated: boolean;
}

/** House total = the sum of the rooms' low, likely and high values. */
export function houseTotal(rooms: { productId: string; outcome: EstimateOutcome }[]): HouseTotal {
  let area: ResultRange | null = null;
  let needed: ResultRange | null = null;
  let cost: ResultRange | null = null;
  const boxes = new Map<string, ResultRange>();
  let included = 0;
  let anyPlaceholder = false;
  let anyEstimated = false;
  for (const { productId, outcome } of rooms) {
    if (outcome.status !== "ok") continue;
    const r = outcome.estimate.result;
    included++;
    area = area ? addRanges(area, r.areaSqft) : r.areaSqft;
    needed = needed ? addRanges(needed, r.sqftNeeded) : r.sqftNeeded;
    cost = cost ? addRanges(cost, r.cost) : r.cost;
    const prev = boxes.get(productId);
    boxes.set(productId, prev ? addRanges(prev, r.boxes) : r.boxes);
    anyPlaceholder ||= r.priceSource === "placeholder";
    anyEstimated ||= r.isRange;
  }
  return {
    includedRooms: included,
    pendingRooms: rooms.length - included,
    areaSqft: area,
    sqftNeeded: needed,
    cost,
    boxesByProduct: [...boxes].map(([productId, b]) => ({ productId, boxes: b })),
    anyPlaceholderPrice: anyPlaceholder,
    anyEstimated,
  };
}
