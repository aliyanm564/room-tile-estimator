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

## v1 UX (target, built in Phase 5)
- Project → rooms, **room by room** (not bulk upload).
- Up to **6 photos per room** with a guided shot checklist + optional known-wall measurement.
- Phone-first (camera capture), but laptop file upload must work.
- Projects stored in the browser (**localStorage**). No database, no auth in v1.
- Plain language, large tap targets.

## Phases
1. **Scaffold + manual calculator + unit tests** ← CURRENT
2. API route: room photos → Claude vision → validated JSON (dimensions, confidence, scale reference)
3. Merge AI estimates with manual overrides; show ranges + confidence
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
- `src/types/` — shared types (RoomInput, RoomResult, FlooringProduct, Settings, Project, Room)
- `tests/` — Vitest tests (`tests/calc/` for calculator, `tests/catalog.test.ts` for config)

## Conventions
- Calc = small **pure** functions: no React, no I/O, no `Date.now()`.
- **Every calc change gets tests.** Run `npm test`, `npm run lint`, `npm run build` before calling work done.
- Validate at boundaries (config load, user input, AI output) with Zod; trust types inside.
- Don't invent real SKUs, URLs, or prices.
- Inputs: never derive math from display text, and never rewrite an input's text while the user is
  typing. Tap targets ≥ 44px.
- Phone testing in dev relies on `allowedDevOrigins` in `next.config.ts` (LAN hosts are blocked by
  default in Next 16, and the page silently fails to hydrate).
