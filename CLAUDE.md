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
- **Prompt versioning:** `PROMPT_VERSION` in `src/lib/ai/prompt.ts` (format `YYYY-MM-DD.N`). **Bump it on
  every change** to the system prompt, user-message wording, or schema; Phase 4 compares versions.
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
  Display: headline cost to the cent, cost range to the nearest $10, "About 12 × 9 ft" to the nearest foot.
- **Known gap:** with both walls measured and no analysis, closets aren't counted (no manual closet
  input). Phase 5 / client request.

## v1 UX (target, built in Phase 5)
- Project → rooms, **room by room** (not bulk upload).
- Up to **6 photos per room** with a guided shot checklist + optional known-wall measurement.
- The photo checklist must tell users to **use the 1x camera, not 0.5x (ultra-wide)**: ultra-wide makes
  rooms look bigger. Show the `ultra_wide_lens` issue next to the affected photo.
- Phone-first (camera capture), but laptop file upload must work.
- Projects stored in the browser (**localStorage**). No database, no auth in v1.
- Plain language, large tap targets.

## Phases
1. Scaffold + manual calculator + unit tests ✅
2. API route: room photos → Claude vision → validated JSON (dimensions, confidence, scale reference) ✅
3. Merge AI estimates with manual overrides; show ranges + confidence ✅
4. **Accuracy eval against test photos with known dimensions** ← NEXT
5. UX polish: project → rooms flow, guided photo checklist, mobile-first
6. Deployment

## Layout
- `config/` — `flooring-catalog.json`, `settings.json` (hand-edited)
- `src/lib/catalog.ts` — loads + Zod-validates config
- `src/lib/calc/` — pure functions: `units.ts`, `range.ts`, `area.ts`, `flooring.ts`, `cost.ts`, `estimate.ts`
- `src/lib/format.ts` — display rounding
- `src/lib/measurement-input.ts` — form state for lengths/price: one canonical value at full
  precision (feet, $/sq ft); text kept exactly as typed; text re-rendered only on unit switch or blur
- `src/components/` — client components: `Calculator.tsx` (page state), `PhotoPicker.tsx`,
  `LengthInput.tsx`, `EstimateResult.tsx`, `UnitsToggle.tsx`
- `src/lib/estimate/` — `merge.ts` (decision table), `run.ts` (AI call or not, one at a time),
  `api-client.ts` (browser fetch to `/api/estimate`, friendly message for every error code)
- `src/lib/images/` — `preprocess.ts` (limits, HEIC, orientation, strip, resize), `lens.ts`
- `src/lib/ai/` — `provider.ts` (interface), `anthropic.ts`, `schema.ts`, `prompt.ts`, `models.ts`,
  `index.ts` (`analyzeRoomPhotos`, `getAnalyzer`), `analyze-files.ts` (CLI / eval)
- `src/app/api/estimate/route.ts` — POST photos → RoomAnalysis
- `scripts/analyze.ts` — CLI (`npm run analyze`)
- `src/types/` — shared types (RoomInput, RoomResult, FlooringProduct, Settings, Project, Room)
- `tests/` — Vitest: `calc/`, `images/`, `ai/`, `api/`; `helpers/images.ts` generates synthetic photos;
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
