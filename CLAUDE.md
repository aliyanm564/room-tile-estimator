# CLAUDE.md — Flooring Estimator

Project memory for Claude Code sessions. Keep this file current when decisions change.

@AGENTS.md
(AGENTS.md is managed by Next.js — `next dev` rewrites its block. This is Next.js 16.x: check
`node_modules/next/dist/docs/` before relying on remembered Next.js APIs. `cacheComponents` and
`partialPrefetching` are enabled in `next.config.ts`.)

## Purpose
A web app for **non-technical construction managers**: photograph a room, get an estimate of how much
flooring is needed and what it will cost. Hardwood first; other flooring types later.

Estimates are for **budgeting**, but should be as accurate as possible. Show uncertainty honestly
(ranges + confidence) instead of false precision. Runs locally for now (no deployment yet).

## Stack
- Next.js (App Router) + TypeScript, `src/` directory
- Tailwind CSS
- Zod (validation of config, AI output, user input)
- Vitest (unit tests, `npm test`)
- AI: Anthropic API. Start with **Claude Sonnet 5.5** (`claude-sonnet-5-5`); evaluate
  **Claude Haiku 5.5** (`claude-haiku-5-5`) later for cost. Use exact model ID strings, no date suffixes.
- AI is called **only from server-side code** (route handlers / server actions). `ANTHROPIC_API_KEY`
  lives in `.env.local` and must never reach the browser (no `NEXT_PUBLIC_` prefix, never import the
  AI module from a client component).

## Core rules
1. **The AI only returns room data as JSON** (dimensions, confidence, scale reference), validated with
   Zod. **All math is deterministic code in `src/lib/calc/`.** Never let the model do arithmetic,
   compute quantities, or guess prices.
2. The AI provider sits behind **one interface: `src/lib/ai/provider.ts`**, so it can be swapped.
3. **Prices come from a hand-maintained catalog**, `config/flooring-catalog.json`, sourced manually
   from Home Depot Canada / Rona. **No scraping.** Placeholder entries are marked
   `source: "placeholder"`, `verified: false`, and the UI must label them as such.
4. **Manual user input always overrides** defaults and AI guesses.
5. Config (`config/*.json`) is **validated with Zod at load** (`src/lib/catalog.ts`); bad config throws
   a clear error.

## Domain decisions
- **Units:** imperial is the default (ft, in, sq ft); metric supported. Internally, calc works in feet /
  sq ft; convert at the edges.
- **Hardwood is sold by the box.** Primary outputs: sq ft needed (with waste), boxes, cost.
  Cost = whole boxes purchased × price per sq ft. Plank count is approximate/secondary (null when the
  product uses random lengths).
- **Waste factor by layout** in `config/settings.json` (straight 10%, diagonal 15%, herringbone 15%).
- **Uncertainty:** every dimension may be an exact number or a `{ low, high }` range. Calc returns
  low/high results. Phase 3 feeds AI uncertainty through this.
- **Rooms:** one or more rectangular sections summed (L-shapes = 2 sections), minus obstacle rectangles
  (islands, built-ins).
- **Precision:** keep full precision internally; round only in formatting helpers
  (`src/lib/format.ts`).

## AI room analysis (Phase 2)
- **Flow:** `analyzeRoomPhotos()` in `src/lib/ai/index.ts` = `preprocessImages()` → `RoomAnalyzer.analyzeRoom()`.
  Used by `POST /api/estimate` (multipart: `images` 1–6, `roomName`, `knownMeasurement` JSON) and by
  `npm run analyze` (`scripts/analyze.ts` → `src/lib/ai/analyze-files.ts`, the base for the Phase 4 eval).
- **Images** (`src/lib/images/`): JPEG/PNG/WebP/HEIC, max 6, max 20MB each (checked before decoding).
  HEIC is decoded with `heic-decode` (sharp's prebuilt binaries can't decode HEVC). EXIF orientation is
  applied, then **all metadata is stripped** (GPS of customers' homes must never leave the server). Long
  edge ≤ 1568px, JPEG q85. The **only** metadata read is lens info (`FocalLengthIn35mmFilm`, fallback:
  explicit "ultra wide"/"telephoto" in `LensModel`; never the word "wide" alone, since iPhone main
  lenses report "dual wide camera").
- **Lens:** < 20mm-equiv = `ultra_wide` (0.5x), > 40mm = `telephoto`, else `standard`; no data =
  `unknown` (no warning). Ultra-wide distorts and exaggerates depth. Our code (not the model) adds a
  deterministic `ultra_wide_lens` issue; the lens is also given to the model in each "Photo N" label.
- **Schema v2** (`src/lib/ai/schema.ts`), all lengths in feet, every dimension `{ low, likely, high }`:
  - `usable`: false if no estimate is possible (then `sections` is empty and `issues` explain why).
  - `issues[] {code, message, photoIndex}`: photoIndex is 1-based or null. Our code adds `ultra_wide_lens`.
  - `roomType`: a guess, e.g. "bedroom". `existingFloor`: informational.
  - `shape`: the **main room only**: rectangle → exactly 1 `main` section, l_shape → 2, irregular → ≥ 1.
  - `sections[] {label, lengthFt, widthFt, knownMeasurementAppliedTo}`: `label` is `main` | `closet` |
    `other`. Closet/other sections come in addition to the shape's main sections. lengthFt is the longer
    side. `knownMeasurementAppliedTo` (`length` | `width` | null) says which main dimension the user's
    measurement matched; null on closet/other sections and when no measurement was given.
  - `obstacles[] {label, lengthFt, widthFt}`: permanent built-ins only, never furniture or rugs.
  - `scaleReferences[] {object, assumedSize, photoIndex}`, `confidence` (low/medium/high) +
    `confidenceReason` (one plain sentence), `notes` (≤ 3 tips; **never questions**, the user can't reply).
  - Our code adds `photos[]` (incl. lens) and `meta` (model, prompt version, the `knownMeasurement` the
    analysis was made with, tokens, estimated cost, duration, attempts). `toCalcRect()` maps onto calc input.
- **Retry rule:** retry the AI **only when output is unusable**: invalid structure / not JSON, a range
  with low > likely > high or non-positive values, or wrong main-section count for the shape
  (`validateModelOutput()`). **Anything code can normalize, code normalizes; never spend a second call on
  it** (`normalizeModelOutput()`): notes ending in "?" are dropped, > 3 notes truncated, out-of-range photo
  indexes → null, `knownMeasurementAppliedTo` on non-main sections cleared, an unusable result with no
  issue gets a generic one. A missing/wrong `knownMeasurementAppliedTo` or a known value the AI didn't
  copy exactly is NOT retried: the merge overwrites the value and falls back to larger/smaller.
- **Closet rule:** flooring normally goes into closets. The AI returns reach-in and walk-in closets that
  belong to the room as separate `closet` sections; their area is added. A known measurement (and the
  wall fields in the UI) is the **main room only, wall to wall, excluding closets**.
- **Prompt versioning:** `src/lib/ai/prompt.ts` keeps a registry, `PROMPTS`, with an ID (`v2`, `v3`, …)
  and a version string (`YYYY-MM-DD.N`) per entry. **Every change** to the system prompt, user-message
  wording or schema becomes a NEW registered version; never edit a registered prompt's text in place.
  Older versions stay runnable so the eval can compare them. `DEFAULT_PROMPT_ID` (currently `v3`) is
  what the app uses; `meta.promptId`/`promptVersion` record which one produced each result.
  v1 isn't registered (it used the pre-v2 schema).
- **Notes rules (v3):** neutral voice (no "I"); never questions; only suggest actions the app supports:
  add or retake a photo (corner view, doorway view, 1x lens) or measure the longer or shorter wall.
  Never suggest measuring closets, built-ins or anything there's no field for.
- **Anthropic call** (`src/lib/ai/anthropic.ts`): structured outputs via `output_config.format`
  (forced `tool_choice` returns 400 on Sonnet 5.5). Adaptive thinking (default; can't be disabled on
  Sonnet 5.5), `effort: "high"`. **No refusal fallbacks**: results always come from the requested
  model; a refusal is a friendly error. Unusable output → exactly one retry with the errors (see retry rule).
  SDK `maxRetries: 1` covers 429/529/5xx; timeout 180s. SDK pinned at 1.6.0 (sends the key as
  `Authorization: Bearer`). Prices for cost logs in `src/lib/ai/models.ts`; verify against the
  pricing page.
- **Errors:** `UserFacingError` (`src/lib/errors.ts`) has `userMessage` (safe for clients) and `message`
  (log detail). The route only ever returns `{ error: { code, message: userMessage } }`.
- **Tests never call the API:** `tests/setup.ts` removes the key and points the SDK at a closed port;
  tests inject fake clients / fake `fetch`.
- `tests/fixtures/rooms/` holds photos of real homes: **gitignored, never commit**.

## Merging AI + manual input (Phase 3, `src/lib/estimate/`)
**Evidence (2026-11-23, prompt v1, Sonnet 5.5, 2 photos of a test room, real 12.47 × 9.02 ft incl. closet):**
- no measurement → 11 × 9.5 likely
- told longest = 12.47 → width 9.0 likely (real 9.02)
- told shortest = 9.02 → length 12.0 likely (real 12.47)
- Rescaling the other dimension with the AI's proportions would have given 10.8 / 10.4: much worse.

**Rule: a single known wall is sent to the AI as a ruler (`knownMeasurement`) and the AI re-measures the
other dimension. NEVER rescale the other dimension proportionally in code.** Code only locks the measured
dimension to the exact value.

**Fields (UI):** "Longer wall" and "Shorter wall", both optional, in the user's units, measured wall to
wall excluding closets. Longer = the main room's longer floor dimension (`which: "longest"`), shorter =
the shorter one (`"shortest"`). A manual value is exact (low = likely = high).

**Decision table** (`buildEstimate()` in `merge.ts`; one test per row in `tests/estimate/merge.test.ts`):
| # | Walls | Analysis | Main room | Closets / obstacles | Confidence | AI call |
|---|---|---|---|---|---|---|
| 1 | none | none | `empty` | — | — | on Estimate (photos needed) |
| 2 | none | usable | AI ranges | AI | AI's | already made |
| 3 | one | none | `needs_photos` | — | — | on Estimate, with the wall as ruler |
| 4 | one | usable, made with this measurement | that dimension exact; other from the AI (re-measured with the ruler) | AI | AI's | none |
| 5 | one | usable, made without it / different value | locked immediately (free); other = AI's as-is; offer "Re-analyze with this measurement" | AI | AI's | only on Re-analyze |
| 6 | both | any or none | exact longer × shorter | AI's if an analysis exists (estimated); else none | `measured` | **never** |
| 7 | none/one | unusable | `unusable` + issues to fix | — | — | — |
| 8 | one | usable, L-shape/irregular | no lock (can't map one wall) + warning | AI | AI's | — |
| 9 | both | usable, L-shape/irregular | walls as a rectangle + `shape_conflict` warning | AI | `measured` | never |
- **Which dimension a wall locks:** the AI's `knownMeasurementAppliedTo`, if the analysis was made with
  this exact measurement and the value is on that dimension (within 5%); otherwise "Longer wall" →
  the larger-likely dimension, "Shorter wall" → the smaller (tie → length is longer).
- **Never silently swap:** if a lock contradicts its label (shorter wall > the other side's likely, or
  longer wall < it) → `measurement_inconsistent` warning; values stay as entered. Both walls entered
  reversed → `walls_reversed` warning.
- Closet and `other` sections add area; obstacles subtract. Warnings = lens issues, then AI issues,
  then merge warnings. Unusable analysis → no estimate, issues returned (ignored if both walls given).
- `decideAction()` / `createEstimateRunner()` in `run.ts`: both walls → calculate, **no provider call**;
  one in-flight call at a time (double submits share it).
- Calc ranges carry `likely` (`ResultRange`); headline numbers use likely, low/high logic unchanged.
  Display: headline cost to the cent; cost range in $10 steps rounded OUTWARD (low down, high up) so the
  headline is always inside it; "About 12½ × 9 ft" to the nearest half foot (metric 0.1 m).
- **Closets & built-ins (Phase 5, `AreaEdits`):** AI-detected closets / extra areas / built-ins can be
  edited (width × depth, exact → "measured"; the fields select their value on focus, so typing replaces it) or removed (kept in the list for undo), and closets can be
  added by hand. Edits are keyed `section:<i>` / `obstacle:<i>` into the analysis and are **cleared when
  the room is re-analyzed**; manual closets are kept. Both walls + manual closets = a fully measured
  estimate with no AI call (this closed the Phase 3 gap).

## Evaluation (Phase 4a, `eval/`)
- **Rule: every prompt change gets an eval run before it becomes the default.** Register the new prompt,
  run `npm run eval -- --dry-run …` to check the cost, run it for real, then change `DEFAULT_PROMPT_ID`
  only if the report supports it. Differences smaller than the run-to-run spread don't count.
- `eval/rooms.json`: one entry per test room: `photos` (≤ 6, paths from the repo root, usually in the
  gitignored `tests/fixtures/rooms/`), `truth` (`totalAreaSqft` required; optional `main {lengthFt,
  widthFt}`, `closets [{widthFt, depthFt}]`, `notes`), and `conditions` (`none` / a known `longest` or
  `shortest` wall, each `valid: true|false` with an `invalidReason`). Adding rooms needs no code changes.
- `npm run eval -- --prompt v2,v3 --model claude-sonnet-5-5,claude-haiku-5-5 --repeats 3 [--rooms …]
  [--conditions …] [--max-cost 1] [--dry-run]`. Runs are **sequential**. Before each run, if actual
  spend so far + the next run's expected cost would exceed `--max-cost` (default $1), it stops. A failed
  run is recorded, never a crash. `--dry-run` prints the matrix and estimated cost and makes no calls.
- Scored area = what the app shows: the analysis goes through the same merge (known wall locked,
  closets added, built-ins subtracted). Metrics per run: area likely/low/high, error %, truth inside
  low–high (coverage), range width %, per-dimension scores when the truth has `main`. Per group (room ×
  condition × prompt × model): mean error, spread (min–max, SD of likely area), coverage rate, mean width,
  cost, time, notes-rule flags (heuristic: first person, unsupported measurements, asking the user).
- Output: `eval/results/<timestamp>/results.json` + `report.md`. No images; safe to commit.
- Code: `eval/run-eval.ts` (entry), `eval/lib/` (`rooms.ts`, `metrics.ts`, `runner.ts`, `report.ts`,
  `notes.ts`, `cli.ts`). It reuses `analyzeFiles()` (`src/lib/ai/analyze-files.ts`), the same path as
  `npm run analyze`. Tests: `tests/eval/` (fake analyzer, no API).
- **Measurement protocol for a new test room** (a tape or laser, in feet):
  1. **Main room, wall to wall, WITHOUT closets:** the longer dimension and the shorter dimension.
  2. **Each closet separately:** width along the wall × depth.
  3. **Total area** that gets flooring = main + closets − permanent built-ins (islands, vanities).
  4. Note anything unusual (alcoves, angled walls) in `truth.notes`. Mark a condition `valid: false`
     with a reason if the measurement doesn't follow step 1 (e.g. the current room's 12.47 ft
     includes its closet).
  5. Photos: 2–6, with the 1x camera, corners and doorway views, saved in `tests/fixtures/rooms/`.

### Phase 4a findings (2026-11-23, 1 room, 3 repeats; `eval/results/2026-11-23T08-38-50-351Z/`)
- **A measured wall cut error from ~14% to ~2%** on the test room (Sonnet). This drives the UI: wall
  measurements come FIRST and are marked "Recommended".
- No-measurement estimates **overestimated in every run** (+8% to +33%). **Do NOT add a correction factor
  until there are 5–10 measured rooms**; one room can't separate bias from that room's quirks.
- Ranges are wide relative to actual error (width 30–60% of likely vs. error 1–28%; truth inside the range
  in 23/24 runs). **Don't tune range width until more rooms exist.**
- Run-to-run spread: SD ≈ 3.5 sq ft on average (max 7.4), well below the measurement effect.
- **v3 became the default** (Sonnet accuracy unchanged vs v2 within noise; v3 notes followed the rules,
  v2 broke them in 6/12 runs).
- **Haiku 5.5 rejected** for now: less accurate (+24–28% without a measurement vs ~14%), slower (~13s vs
  ~10s, more output tokens), though ~12× cheaper. Haiku v3 also counted bedroom-1's second door as a
  closet; it's actually a door to another room (bathroom), so that was an overcount.

## Product UI (Phase 5)
- **Screens** (hash routes in `src/components/app/router.ts`, so back/forward work and it runs offline):
  Projects `#/` → Project `#/p/<id>` (rooms + house total) → Room `#/p/<id>/r/<id>` (inputs) → Result
  `#/p/<id>/r/<id>/result`; Print `#/p/<id>/print`. Phone-first, ≥ 44px tap targets, plain language.
- **Room input order:** name → walls first ("Recommended", "One measurement makes the estimate much more
  accurate"; never quote a percentage) → photo checklist (1 corner looking across, required when a wall
  is missing; 2 opposite corner; 3 doorway with a door; 4 anything blocking the floor; extras up to 6;
  "Use the 1x camera, not 0.5x") → closets & built-ins → flooring, layout, price.
- **Both walls filled:** no Estimate button, "Both walls measured, no photos needed." and "See result".
- **Photos are never stored.** A room with an analysis but no photos in memory shows "Re-add photos to
  re-analyze". Photos live in `src/lib/project/photos.ts` (memory, per tab).
- **Client-side shrinking** (`src/lib/images/shrink-client.ts`): if the browser can decode a photo, it's
  resized to ≤ 1568px JPEG q0.85 before upload; otherwise (e.g. HEIC in Chrome) the original is sent.
  Re-encoding drops EXIF, so the lens fields are read first (`exif-lite.ts`) and sent as `lensHints`; the
  server uses a hint only when the uploaded file has no lens EXIF. Uploads use XHR for progress.
- **Results:** likely numbers are the headline; ranges are small secondary text. Measured/estimated
  badges, confidence, "Scale from", warnings, tips, price source (placeholder flagged), and the
  disclaimer (`src/lib/disclaimer.ts`) everywhere results appear, including print.
- **House total** = sum of the rooms' low, likely and high (`houseTotal()`); rooms without an estimate
  are flagged and excluded. Boxes are listed per flooring product (`boxLines()`), never summed across products.
- **Print / PDF:** the browser's print on the Print screen (`print:` Tailwind variants + `@media print`
  in `globals.css`); no PDF library.

### Data model and storage (`src/lib/project/`)
- `model.ts` (pure): `AppData { schemaVersion: 1, projects[] }` → `StoredProject { id, name, units,
  rooms[] }` → `StoredRoom { id, name, walls {longerFt, shorterFt}, productId, layout,
  priceOverridePerSqft, analysis, analysisPhotoCount, areaEdits, lastResult }`. Each room has its own
  product/layout/price. `lastResult` is a snapshot; the UI always recomputes from inputs (`roomOutcome`).
- `storage.ts`: one localStorage key, `flooring-estimator`. Parsing never throws: bad JSON, a newer
  version, or an un-migratable old version → start empty with a plain message; a bad project/room is
  skipped and a bad analysis cleared, with the rest kept. **Before anything unreadable is overwritten,
  the original text is copied to `flooring-estimator:backup:<timestamp>`.** Storage full/blocked → a
  message, no crash. **Schema changes:** bump `SCHEMA_VERSION` and add a `MIGRATIONS[n]` step (n → n+1);
  never edit old steps.
- `store.ts`: external store (`useSyncExternalStore`) over localStorage; reloads on another tab's change.
- IDs use `crypto.getRandomValues` (`crypto.randomUUID` doesn't exist on plain-http LAN pages).

### Demo sample project
"Load sample project" (`src/lib/project/sample.ts`) creates "Sample: 24 Maple Street" with 3 rooms from
**synthetic** saved analyses (no photos, no API call, works offline): Main bedroom (one wall + photo
analysis + AI closet), Living room (both walls + a manual closet: fully measured), Kitchen (photos only,
island subtracted). Keep it synthetic; never put a real home in it.

### Branding (`config/branding.json`, validated in `src/lib/catalog.ts`)
`appName`, optional `tagline`, `primaryColor` (hex; text on it is black/white automatically),
`logoPath` (a file in `public/`, e.g. `"/logo.svg"`, or null). Applied as CSS variables `--brand` /
`--brand-text` on `<html>` (layout.tsx) and used by buttons/accents. Rebrand per client without code.

## Phases
1. Scaffold + manual calculator + unit tests ✅
2. API route: room photos → Claude vision → validated JSON (dimensions, confidence, scale reference) ✅
3. Merge AI estimates with manual overrides; show ranges + confidence ✅
4. Accuracy eval against test photos with known dimensions: **4a done** (harness + prompt v3 + first
   run on 1 room; v3 is now the default). Next: 5–10 more test rooms measured with the protocol above.
5. Product UI: project → rooms flow, guided photo checklist, closets editor, demo, print ✅
6. **Deployment** ← NEXT

## Layout
- `config/` — `flooring-catalog.json`, `settings.json`, `branding.json` (hand-edited)
- `src/lib/catalog.ts` — loads + Zod-validates config
- `src/lib/calc/` — pure functions: `units.ts`, `range.ts`, `area.ts`, `flooring.ts`, `cost.ts`, `estimate.ts`
- `src/lib/format.ts` — display rounding
- `src/lib/measurement-input.ts` — form state for lengths/price: one canonical value at full
  precision (feet, $/sq ft); text kept exactly as typed; text re-rendered only on unit switch or blur
- `src/components/app/` — the app: `App.tsx` (routing + state), `router.ts`, screens (`ProjectsScreen`,
  `ProjectScreen`, `RoomScreen`, `ResultScreen`, `PrintScreen`), `PhotoChecklist`, `AreaItemsEditor`,
  `useAnalyze` (upload + progress), `ui.tsx` (buttons, badges, confirm, notices), `labels.ts`
- `src/components/` — shared: `EstimateResult.tsx`, `LengthInput.tsx`, `UnitsToggle.tsx`
- `src/lib/project/` — `model.ts`, `storage.ts`, `store.ts`, `photos.ts`, `sample.ts`
- `src/lib/estimate/` — `merge.ts` (decision table), `run.ts` (AI call or not, one at a time),
  `api-client.ts` (browser upload to `/api/estimate` with progress, friendly message for every error code)
- `src/lib/images/` — `preprocess.ts` (limits, HEIC, orientation, strip, resize), `lens.ts`,
  `exif-lite.ts` + `shrink-client.ts` (browser side)
- `src/lib/ai/` — `provider.ts` (interface), `anthropic.ts`, `schema.ts`, `prompt.ts`, `models.ts`,
  `index.ts` (`analyzeRoomPhotos`, `getAnalyzer`), `analyze-files.ts` (CLI / eval)
- `src/app/api/estimate/route.ts` — POST photos → RoomAnalysis
- `scripts/analyze.ts` — CLI (`npm run analyze`, `--prompt v2|v3`, `--model`, `--known/--which`, `--json`)
- `eval/` — evaluation harness (`npm run eval`), `rooms.json`, `results/<timestamp>/`
- `src/types/` — shared types (RoomInput, RoomResult, FlooringProduct, Settings, Project, Room)
- `tests/` — Vitest: `calc/`, `images/`, `ai/`, `api/`, `estimate/`, `eval/`, `project/`; `helpers/images.ts` generates synthetic photos;
  `fixtures/images/two-tone.heic` is a synthetic HEIC (made with macOS `sips`)

## Conventions
- Calc = small **pure** functions: no React, no I/O, no `Date.now()`.
- **Every calc change gets tests.** Run `npm test`, `npm run lint`, `npm run build` before calling work done.
- Validate at boundaries (config load, user input, AI output) with Zod; trust types inside.
- Don't invent real SKUs, URLs, or prices.
- Inputs: never derive math from display text, and never rewrite an input's text while the user is
  typing. Tap targets ≥ 44px.
- Phone testing in dev relies on `allowedDevOrigins` in `next.config.ts` (LAN hosts are blocked by
  default in Next 16, and the page silently fails to hydrate).
