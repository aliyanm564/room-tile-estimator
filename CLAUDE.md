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
- **Schema** (`src/lib/ai/schema.ts`), all lengths in feet, every dimension `{ low, likely, high }`:
  `usable`, `issues[] {code, message, photoIndex}`, `roomType`, `shape` (rectangle → 1 section,
  l_shape → 2, irregular → ≥1), `sections[] {lengthFt, widthFt}`, `obstacles[] {label, lengthFt,
  widthFt}` (permanent built-ins only), `scaleReferences[]`, `confidence` + `confidenceReason`,
  `existingFloor`, `notes` (≤ 3). Our code adds `photos[]` (incl. lens) and `meta` (model, prompt
  version, tokens, estimated cost, duration, attempts). `toCalcRect()` maps sections onto calc input.
  - `ModelOutputSchema` (structure only) goes to the API as structured output; `validateModelOutput()`
    enforces the rules JSON Schema can't (low ≤ likely ≤ high, section counts, photo index range).
- **Prompt versioning:** `PROMPT_VERSION` in `src/lib/ai/prompt.ts` (format `YYYY-MM-DD.N`). **Bump it on
  every change** to the system prompt, user-message wording, or schema; Phase 4 compares versions.
- **Anthropic call** (`src/lib/ai/anthropic.ts`): structured outputs via `output_config.format`
  (forced `tool_choice` returns 400 on Sonnet 5.5). Adaptive thinking (default; can't be disabled on
  Sonnet 5.5), `effort: "high"`. **No refusal fallbacks**: results always come from the requested
  model; a refusal is a friendly error. Invalid output → exactly one retry with the validation errors.
  SDK `maxRetries: 1` covers 429/529/5xx; timeout 180s. SDK pinned at 1.6.0 (sends the key as
  `Authorization: Bearer`). Prices for cost logs in `src/lib/ai/models.ts`; verify against the
  pricing page.
- **Errors:** `UserFacingError` (`src/lib/errors.ts`) has `userMessage` (safe for clients) and `message`
  (log detail). The route only ever returns `{ error: { code, message: userMessage } }`.
- **Tests never call the API:** `tests/setup.ts` removes the key and points the SDK at a closed port;
  tests inject fake clients / fake `fetch`.
- `tests/fixtures/rooms/` holds photos of real homes: **gitignored, never commit**.

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
3. **Merge AI estimates with manual overrides; show ranges + confidence** ← NEXT
4. Accuracy eval against test photos with known dimensions
5. UX polish: project → rooms flow, guided photo checklist, mobile-first
6. Deployment

## Layout
- `config/` — `flooring-catalog.json`, `settings.json` (hand-edited)
- `src/lib/catalog.ts` — loads + Zod-validates config
- `src/lib/calc/` — pure functions: `units.ts`, `range.ts`, `area.ts`, `flooring.ts`, `cost.ts`, `estimate.ts`
- `src/lib/format.ts` — display rounding
- `src/lib/measurement-input.ts` — form state for lengths/price: one canonical value at full
  precision (feet, $/sq ft); text kept exactly as typed; text re-rendered only on unit switch or blur
- `src/components/` — `Calculator.tsx`, `UnitsToggle.tsx` (client components)
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
