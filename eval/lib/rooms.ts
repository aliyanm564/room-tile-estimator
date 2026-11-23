// Eval room definitions (eval/rooms.json), validated with Zod.
import { existsSync, readFileSync } from "node:fs";
import * as z from "zod/v4";

const positive = z.number().positive();

const KnownSchema = z.object({ valueFt: positive, which: z.enum(["longest", "shortest"]) }).strict();

const ConditionSchema = z
  .object({
    /** e.g. "none", "known-shortest". */
    id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
    /** null = photos only. Otherwise sent to the AI as a ruler AND locked by the merge, like the app. */
    knownMeasurement: KnownSchema.nullable(),
    /** false = don't run (e.g. the measurement wasn't taken the way the app defines it). */
    valid: z.boolean(),
    invalidReason: z.string().optional(),
  })
  .strict()
  .refine((c) => c.valid || !!c.invalidReason?.trim(), { message: "invalid conditions need an invalidReason", path: ["invalidReason"] });

const TruthSchema = z
  .object({
    /** Required: total floor area that gets flooring (main room + closets − built-ins), sq ft. */
    totalAreaSqft: positive,
    /** Optional: the MAIN room only, wall to wall, excluding closets. Length = the longer side. */
    main: z.object({ lengthFt: positive, widthFt: positive }).strict().optional(),
    /** Optional: each closet's floor (width along the wall × depth). */
    closets: z.array(z.object({ widthFt: positive, depthFt: positive }).strict()).optional(),
    notes: z.string().optional(),
  })
  .strict();

const RoomSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
    description: z.string().optional(),
    /** Paths relative to the repo root. Photos of real homes live in gitignored tests/fixtures/rooms/. */
    photos: z.array(z.string().min(1)).min(1).max(6),
    truth: TruthSchema,
    conditions: z.array(ConditionSchema).min(1),
  })
  .strict()
  .refine((r) => new Set(r.conditions.map((c) => c.id)).size === r.conditions.length, {
    message: "condition ids must be unique within a room",
    path: ["conditions"],
  });

export const RoomsFileSchema = z
  .object({ rooms: z.array(RoomSchema).min(1) })
  .strict()
  .refine((f) => new Set(f.rooms.map((r) => r.id)).size === f.rooms.length, { message: "room ids must be unique", path: ["rooms"] });

export type EvalRoom = z.infer<typeof RoomSchema>;
export type EvalCondition = z.infer<typeof ConditionSchema>;
export type EvalTruth = z.infer<typeof TruthSchema>;

export function parseRooms(data: unknown, source = "eval/rooms.json"): EvalRoom[] {
  const r = RoomsFileSchema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid ${source}:\n${issues}`);
  }
  return r.data.rooms;
}

export function loadRooms(path: string): EvalRoom[] {
  return parseRooms(JSON.parse(readFileSync(path, "utf8")), path);
}

/** Photos that don't exist locally (photos are gitignored, so a fresh clone won't have them). */
export function missingPhotos(rooms: EvalRoom[], exists: (p: string) => boolean = existsSync): string[] {
  return rooms.flatMap((r) => r.photos.filter((p) => !exists(p)));
}
