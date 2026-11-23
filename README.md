# Flooring Estimator

A tool for construction managers to estimate how much flooring a room needs and what it will cost.
Hardwood first; other flooring types later. Estimates are for budgeting.

**Current status: Phase 2.** The page is a manual calculator: type room measurements, get square
footage, boxes and cost. Behind it, a photo analyzer (Claude's vision API) turns 1–6 room photos into
estimated room dimensions with ranges and confidence. It's available as an API route and a command-line
script. Connecting the two in the UI is Phase 3. See [CLAUDE.md](CLAUDE.md) for the roadmap and design
decisions.

## Setup

Requires Node.js 20.12+ (developed on Node 26).

```bash
npm install
cp .env.example .env.local
```

### Anthropic API key (for photo analysis)

1. Create a key at [console.anthropic.com](https://console.anthropic.com) → **API Keys**.
2. Put it in `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`. That file is gitignored and the key is only
   used on the server; it never reaches the browser.
3. **Set a monthly spend limit** in the Console (**Settings → Limits**) so a bug or a loop can't run up
   a bill. Each analysis costs roughly a few cents (the exact estimate is printed after each run).
4. Restart `npm run dev` after editing `.env.local`.

Optional: `ANTHROPIC_MODEL=claude-haiku-5-5` in `.env.local` switches the default model (default is
`claude-sonnet-5-5`).

The manual calculator works without a key. `npm test` never uses the key or calls the API.

## Run

```bash
npm run dev      # http://localhost:3000
npm test         # unit tests (Vitest), never calls the API
npm run lint     # ESLint
npm run build    # production build
```

### Analyze room photos from the command line

Calls the real API, so it costs money.

```bash
npm run analyze -- photo1.heic photo2.jpg
npm run analyze -- photo1.heic photo2.jpg --known 14 --which longest   # a wall you measured, in feet
npm run analyze -- photo1.heic --room "Main bedroom" --model claude-haiku-5-5
npm run analyze -- photo1.heic --json    # JSON only, for scripts
npm run analyze -- --help
```

It prints the JSON result (dimensions in feet as low / likely / high, issues, confidence, each photo's
lens) followed by token usage and estimated cost. Accepts JPEG, PNG, WebP and iPhone HEIC; up to 6
photos, 20MB each. Location data (GPS) and all other metadata are removed before anything is sent.

**Use the 1x camera.** Photos taken with the 0.5x ultra-wide lens make rooms look bigger; the result
flags them with an `ultra_wide_lens` issue.

Keep real customer photos in `tests/fixtures/rooms/`. That folder is gitignored and must never be
committed.

### API

`POST /api/estimate` with `multipart/form-data`: `images` (1–6 files), optional `roomName`, optional
`knownMeasurement` as JSON (`{"valueFt": 14, "which": "longest"}`, where `which` is `longest`,
`shortest` or `unknown`). Returns the same JSON as the CLI, or `{ "error": { "code", "message" } }`
with a plain-language message.

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
src/lib/images/      photo preprocessing (HEIC, rotation, metadata stripping, resizing, lens detection)
src/lib/ai/          photo analysis: provider interface, Anthropic implementation, prompt, schema
src/components/      UI components
src/app/             Next.js pages + API route (api/estimate)
src/types/           shared types
scripts/analyze.ts   command-line photo analysis
tests/               Vitest tests (never call the real API)
```
