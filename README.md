# Flooring Estimator

A tool for construction managers to estimate how much flooring a room needs and what it will cost.
Hardwood first; other flooring types later. Estimates are for budgeting.

**Current status: Phase 1.** You type in room measurements by hand and get square footage, boxes to
buy, and cost. Photo-based estimates (using Claude's vision API) come in Phase 2. See
[CLAUDE.md](CLAUDE.md) for the full roadmap and design decisions.

## Setup

Requires Node.js 20.9+ (developed on Node 26).

```bash
npm install
cp .env.example .env.local   # not used until Phase 2, but keep it in place
```

## Run

```bash
npm run dev      # http://localhost:3000
npm test         # unit tests (Vitest)
npm run lint     # ESLint
npm run build    # production build
```

### Testing on your phone

1. Put the phone on the same Wi-Fi as your Mac.
2. Run `npm run dev -- -H 0.0.0.0 -p 3000`.
3. Find your Mac's IP with `ipconfig getifaddr en0` and open `http://<that IP>:3000` on the phone.

Next.js blocks its dev-server resources for hosts other than `localhost`. If it does, the page
loads but nothing responds to taps. `next.config.ts` allows the usual home/office ranges
(`192.168.*.*`, `10.*.*.*`) and `*.local` names through `allowedDevOrigins`. If your network uses
something else (e.g. `172.16.x.x`), add it there and **restart the dev server**. The terminal shows a
"Blocked cross-origin request" warning naming the host to add.

A production build skips this check: `npm run build && npm start -- -H 0.0.0.0`.

## Editing the flooring catalog

Prices live in [`config/flooring-catalog.json`](config/flooring-catalog.json). They're entered by
hand from Home Depot Canada or Rona (no scraping). The current entries are **placeholders**: generic
names, made-up prices, and `"verified": false`. The app labels their prices as placeholders.

To add a real product, copy an entry and fill in:

| Field | Meaning |
| --- | --- |
| `id` | Unique, lowercase, e.g. `"rona-oak-5in-natural"` |
| `name` | What users see in the dropdown |
| `category` | `"hardwood"` (only option for now) |
| `construction` | `"solid"` or `"engineered"` |
| `plankWidthIn` | Plank width in inches, e.g. `3.25` |
| `plankLengthIn` | Plank length in inches, or `null` if random lengths |
| `randomLengths` | `true` if the box has mixed lengths (`plankLengthIn` can then be `null`) |
| `sqftPerBox` | Coverage per box, from the box label or product page |
| `pricePerSqft` | Price per sq ft in CAD, before tax |
| `currency` | `"CAD"` |
| `source` | `"Home Depot"`, `"Rona"`, or `"placeholder"` |
| `sourceUrl` | Product page URL, or `null` |
| `lastChecked` | Date you checked the price, `"YYYY-MM-DD"`, or `null` |
| `verified` | `true` once you've confirmed the price yourself (not allowed with source `"placeholder"`) |

Waste factors (extra material for cuts, by layout) and the default units are in
[`config/settings.json`](config/settings.json).

Both files are checked when the app starts. If something's wrong (a missing field, a negative price,
a duplicate id), you get an error naming the file and field. Run `npm test` after editing to catch
mistakes early.

## Project layout

```
config/              catalog + settings (hand-edited JSON)
src/lib/calc/        all estimate math (pure functions, fully tested)
src/lib/catalog.ts   loads + validates config
src/lib/format.ts    display rounding/formatting
src/components/      UI components
src/app/             Next.js pages
src/types/           shared types
tests/               Vitest tests
```
