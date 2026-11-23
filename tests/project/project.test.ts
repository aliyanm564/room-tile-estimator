import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/lib/catalog";
import { addRanges } from "@/lib/calc/range";
import {
  SCHEMA_VERSION,
  addRoom,
  createProject,
  deleteProject,
  deleteRoom,
  emptyAppData,
  houseTotal,
  newId,
  newRoom,
  renameProject,
  roomOutcome,
  roomStatus,
  setRoomAnalysis,
  updateRoom,
  type AppData,
} from "@/lib/project/model";
import { createSampleProject, SAMPLE_PROJECT_NAME } from "@/lib/project/sample";
import { BACKUP_PREFIX, STORAGE_KEY, loadAppData, parseAppData, saveAppData, type StorageLike } from "@/lib/project/storage";

const { products, settings } = loadConfig();

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

function demoData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, projects: [createSampleProject(products, settings)] };
}

afterEach(() => vi.restoreAllMocks());

describe("project + room operations", () => {
  it("create, rename, add/update/delete rooms, delete project", () => {
    let d = createProject(emptyAppData(), "  Smith house ", "imperial", "p1");
    expect(d.projects[0]).toMatchObject({ id: "p1", name: "Smith house", units: "imperial", rooms: [] });
    d = renameProject(d, "p1", "Smith renovation");
    d = renameProject(d, "p1", "   "); // blank names are ignored
    expect(d.projects[0].name).toBe("Smith renovation");
    d = addRoom(d, "p1", newRoom("Bedroom", { productId: products[0].id }, "r1"));
    d = updateRoom(d, "p1", "r1", { walls: { longerFt: 12, shorterFt: 10 }, layout: "diagonal", priceOverridePerSqft: 6 });
    expect(d.projects[0].rooms[0]).toMatchObject({ walls: { longerFt: 12, shorterFt: 10 }, layout: "diagonal", priceOverridePerSqft: 6 });
    d = deleteRoom(d, "p1", "r1");
    expect(d.projects[0].rooms).toEqual([]);
    expect(deleteProject(d, "p1").projects).toEqual([]);
  });

  it("each room has its own product, layout and price", () => {
    let d = createProject(emptyAppData(), "P", "imperial", "p");
    d = addRoom(d, "p", { ...newRoom("A", { productId: products[0].id }, "a"), walls: { longerFt: 10, shorterFt: 10 } });
    d = addRoom(d, "p", { ...newRoom("B", { productId: products[1].id, layout: "herringbone" }, "b"), walls: { longerFt: 10, shorterFt: 10 }, priceOverridePerSqft: 9 });
    const [a, b] = d.projects[0].rooms.map((r) => roomOutcome(r, products, settings));
    if (a.status !== "ok" || b.status !== "ok") throw new Error("expected ok");
    expect(a.estimate.result.wasteFactor).toBe(0.1);
    expect(b.estimate.result.wasteFactor).toBe(0.15);
    expect(b.estimate.result.pricePerSqft).toBe(9);
    expect(a.estimate.result.pricePerSqft).toBe(products[0].pricePerSqft);
  });

  it("a new analysis clears edits to the OLD analysis's items but keeps manual closets", () => {
    const sample = createSampleProject(products, settings, "imperial");
    let d: AppData = { schemaVersion: SCHEMA_VERSION, projects: [sample] };
    const room = sample.rooms[0];
    d = updateRoom(d, sample.id, room.id, {
      areaEdits: { ai: { "section:1": { removed: true } }, manualClosets: [{ id: "m", label: "Linen", widthFt: 2, depthFt: 2 }] },
    });
    d = setRoomAnalysis(d, sample.id, room.id, room.analysis!, 2);
    expect(d.projects[0].rooms[0].areaEdits).toEqual({ ai: {}, manualClosets: [{ id: "m", label: "Linen", widthFt: 2, depthFt: 2 }] });
    expect(d.projects[0].rooms[0].analysisPhotoCount).toBe(2);
  });

  it("ids work without crypto.randomUUID (plain-http LAN pages)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    expect([...ids][0]).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("house total", () => {
  it("equals the sum of the rooms' low, likely and high; pending rooms are counted, not summed", () => {
    const sample = createSampleProject(products, settings);
    const pending = newRoom("Hallway", { productId: products[0].id });
    const rooms = [...sample.rooms, pending].map((r) => ({ productId: r.productId, outcome: roomOutcome(r, products, settings) }));
    const total = houseTotal(rooms);
    const ok = rooms.map((r) => r.outcome).filter((o) => o.status === "ok").map((o) => (o.status === "ok" ? o.estimate.result : null)!);
    expect(ok).toHaveLength(3);
    const sum = (k: "areaSqft" | "sqftNeeded" | "cost") => ok.map((r) => r[k]).reduce((a, b) => addRanges(a, b));
    for (const k of ["areaSqft", "sqftNeeded", "cost"] as const) {
      expect(total[k]!.low).toBeCloseTo(sum(k).low, 9);
      expect(total[k]!.likely).toBeCloseTo(sum(k).likely, 9);
      expect(total[k]!.high).toBeCloseTo(sum(k).high, 9);
    }
    expect(total.includedRooms).toBe(3);
    expect(total.pendingRooms).toBe(1);
    expect(total.boxesByProduct).toHaveLength(3); // boxes only add up per product
    expect(total.anyPlaceholderPrice).toBe(true);
  });

  it("no estimated rooms → null totals", () => {
    expect(houseTotal([{ productId: "x", outcome: { status: "empty" } }])).toMatchObject({ includedRooms: 0, pendingRooms: 1, cost: null });
  });
});

describe("demo sample project", () => {
  it("loads with ZERO network calls and every room has an estimate", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sample = createSampleProject(products, settings);
    const outcomes = sample.rooms.map((r) => roomOutcome(r, products, settings));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sample.name).toBe(SAMPLE_PROJECT_NAME);
    expect(sample.rooms.map((r) => r.name)).toEqual(["Main bedroom", "Living room", "Kitchen"]);
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "ok", "ok"]);
    expect(outcomes.map(roomStatus)).toEqual(["estimated", "measured", "estimated"]);
    expect(sample.rooms.every((r) => r.lastResult?.status === "ok")).toBe(true);
  });

  it("has saved analyses but no photos (→ 'Re-add photos to re-analyze' in the UI)", () => {
    const sample = createSampleProject(products, settings);
    expect(sample.rooms.filter((r) => r.analysis).length).toBe(2);
    expect(JSON.stringify(sample)).not.toMatch(/base64|data:image/);
  });

  it("survives a storage round trip unchanged (except the recomputed snapshot)", () => {
    const data = demoData();
    const s = memoryStorage();
    expect(saveAppData(s, data)).toEqual({ ok: true });
    const loaded = loadAppData(s);
    expect(loaded.problem).toBeNull();
    expect(loaded.data.projects[0].rooms.map((r) => ({ ...r, lastResult: null }))).toEqual(data.projects[0].rooms.map((r) => ({ ...r, lastResult: null })));
  });
});

describe("storage", () => {
  it("round trip: empty storage → empty data, no problem", () => {
    expect(loadAppData(memoryStorage())).toEqual({ data: emptyAppData(), problem: null });
  });

  it("corrupt JSON → empty data, friendly message, original backed up (not lost)", () => {
    const s = memoryStorage({ [STORAGE_KEY]: "{not json" });
    const res = loadAppData(s);
    expect(res.data.projects).toEqual([]);
    expect(res.problem).toMatch(/couldn't be read.*backup/);
    const backups = [...s.items.keys()].filter((k) => k.startsWith(BACKUP_PREFIX));
    expect(backups).toHaveLength(1);
    expect(s.items.get(backups[0])).toBe("{not json");
  });

  it("partly corrupt data: bad rooms are skipped, bad analyses cleared, the rest kept", () => {
    const data = demoData();
    const raw = JSON.parse(JSON.stringify(data));
    raw.projects[0].rooms[0].analysis.sections = "garbage"; // bad analysis
    raw.projects[0].rooms[1].walls = { longerFt: "twelve" }; // bad room
    raw.projects.push({ id: 5 }); // bad project
    const res = parseAppData(JSON.stringify(raw));
    expect(res.data.projects).toHaveLength(1);
    expect(res.data.projects[0].rooms.map((r) => r.name)).toEqual(["Main bedroom", "Kitchen"]);
    expect(res.data.projects[0].rooms[0].analysis).toBeNull();
    expect(res.data.projects[0].rooms[0].areaEdits.ai).toEqual({});
    expect(res.problem).toBe(
      "Some saved data couldn't be read: 1 project was skipped, 1 room was skipped, 1 photo analysis was cleared. A backup of the original data was kept.",
    );
  });

  it("versioned migration: older data is upgraded step by step", () => {
    const current = demoData();
    // Pretend version 0 stored walls as flat fields.
    const v0 = {
      projects: current.projects.map((p) => ({
        ...p,
        rooms: p.rooms.map(({ walls, ...room }) => ({ ...room, longerWallFt: walls.longerFt, shorterWallFt: walls.shorterFt })),
      })),
    };
    const migrations = {
      0: (d: unknown) => {
        const old = d as typeof v0;
        return {
          schemaVersion: 1,
          projects: old.projects.map((p) => ({
            ...p,
            rooms: p.rooms.map(({ longerWallFt, shorterWallFt, ...room }) => ({ ...room, walls: { longerFt: longerWallFt, shorterFt: shorterWallFt } })),
          })),
        };
      },
    };
    const res = parseAppData(JSON.stringify(v0), migrations);
    expect(res.problem).toBeNull();
    expect(res.data.projects[0].rooms[1].walls).toEqual({ longerFt: 16, shorterFt: 13.5 });
  });

  it("data from an unknown old version (no migration) or a newer version → friendly message", () => {
    expect(parseAppData(JSON.stringify({ projects: [] })).problem).toMatch(/old format/);
    expect(parseAppData(JSON.stringify({ schemaVersion: 99, projects: [] })).problem).toMatch(/newer version/);
    expect(parseAppData(JSON.stringify({ schemaVersion: 1, projects: "x" })).problem).toMatch(/couldn't be read/);
  });

  it("a migration that throws doesn't crash", () => {
    expect(parseAppData(JSON.stringify({ projects: [] }), { 0: () => { throw new Error("boom"); } }).problem).toMatch(/couldn't be upgraded/);
  });

  it("storage full / blocked → friendly messages, no throw", () => {
    const full: StorageLike = { getItem: () => null, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); } };
    expect(saveAppData(full, demoData())).toEqual({ ok: false, message: expect.stringMatching(/storage is full or blocked/) });
    const blocked: StorageLike = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    expect(loadAppData(blocked).problem).toMatch(/isn't letting the app read/);
  });

  it("saved data contains no photos", () => {
    const s = memoryStorage();
    saveAppData(s, demoData());
    expect(s.items.get(STORAGE_KEY)!).not.toMatch(/base64|data:image|blob:/);
  });
});
