
# Flooring Estimator

A tool for construction managers to estimate how much flooring a room needs and what it will cost. Estimates are for budgeting. Create a project for each house, add its rooms one by one, measure the
walls and/or take photos, and get the square footage, boxes and cost per room plus a house total you
can print or save as PDF. Projects are saved in the browser. See [CLAUDE.md](CLAUDE.md) for the roadmap
and design decisions.

## How the estimate works

Each room has two optional wall fields, **Longer wall (length)** and **Shorter wall (width)**, in feet
+ inches or metres. Measure **wall to wall, not including closets** (closets are listed separately,
because flooring normally goes into closets).

| You enter | What happens | Costs an AI call? |
|---|---|---|
| Both walls | The estimate appears instantly from your measurements. No photos needed. | **No** |
| One wall + photos | The photos are analyzed with your wall as a "ruler"; the AI re-measures the other wall. Your wall is used exactly. | Yes, one |
| Photos only | The AI estimates both walls from reference objects (doors, outlets, furniture). | Yes, one |
| One wall, no photos | Add photos (or the second wall). | — |

- After a result, editing a wall updates everything instantly, **without** a new AI call. If you add a
  wall measurement after a photo-only result, it's applied right away, and a **Re-analyze with this
  measurement** button lets the AI re-measure the other wall with it (one more call; usually more
  accurate than the first guess).
- Each dimension is marked **measured** or **estimated**. Estimated values show a range; the cost shows
  the likely amount plus a rounded range.
- One measured wall makes photo estimates much more accurate. Both walls make them exact.
- **Closets and built-ins:** closets and built-ins (islands, vanities) found in the photos are listed on
  the room screen. Edit a size (it becomes exact, "measured"), remove one, or **Add closet** yourself.
  Both walls + your closets give a fully measured estimate with no photos at all.
- Photos are shrunk in the browser before upload when possible, and are **never saved**: after a reload,
  a room keeps its analysis and result, but you'll need to re-add photos to re-analyze.

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
lens) followed by token usage and estimated cost. Each section is labelled `main` (the room), `closet`
or `other`; `--known` is the main room only, wall to wall, excluding closets (`--which longest` or
`shortest`). With `--json`, stdout is only the JSON; log lines go to stderr. Accepts JPEG, PNG, WebP and iPhone HEIC; up to 6
photos, 20MB each. Location data (GPS) and all other metadata are removed before anything is sent.

**Use the 1x camera.** Photos taken with the 0.5x ultra-wide lens make rooms look bigger; the result
flags them with an `ultra_wide_lens` issue.

Keep real customer photos in `tests/fixtures/rooms/`. That folder is gitignored and must never be
committed.

`--prompt v2|v3` picks a registered prompt version (default: `v2`).

### API

`POST /api/estimate` with `multipart/form-data`: `images` (1–6 files), optional `roomName`, optional
`knownMeasurement` as JSON (`{"valueFt": 14, "which": "longest"}`, where `which` is `longest`,
`shortest` or `unknown`). Returns the same JSON as the CLI, or `{ "error": { "code", "message" } }`
with a plain-language message.

## Rebranding for a client

Edit [`config/branding.json`](config/branding.json); no code changes:

```json
{
  "appName": "Acme Floor Planner",
  "tagline": "Flooring budgets in minutes",
  "primaryColor": "#1d4ed8",
  "logoPath": "/acme-logo.svg"
}
```

- `primaryColor` is a hex colour for buttons and accents; text on it switches to black or white
  automatically.
- `logoPath` is a file you put in a `public/` folder at the project root (create it if needed), or
  `null` for no logo.
- The file is checked at startup; a typo gives a clear error naming the field. Restart `npm run dev`
  after editing.

## Resetting local data

Projects live in this browser's local storage (key `flooring-estimator`), separately on each device
and browser.
- **In the app:** on the Projects screen, **Delete all saved data** (asks to confirm).
- **By hand:** browser DevTools → Application → Local Storage → delete `flooring-estimator`.
- If saved data is ever unreadable, the app starts fresh, shows a message, and keeps a copy under
  `flooring-estimator:backup:<date>`.

## Project layout

```
config/              catalog, settings, branding (hand-edited JSON)
src/lib/calc/        all estimate math (pure functions, fully tested)
src/lib/catalog.ts   loads + validates config
src/lib/format.ts    display rounding/formatting
src/lib/images/      photo preprocessing (HEIC, rotation, metadata stripping, resizing, lens detection)
src/lib/ai/          photo analysis: provider interface, Anthropic implementation, prompt, schema
src/lib/estimate/    merging AI + measurements, API client
src/lib/project/     projects/rooms model, browser storage, sample project
src/components/      UI (screens in src/components/app/)
src/app/             Next.js pages + API route (api/estimate)
src/types/           shared types
scripts/analyze.ts   command-line photo analysis
eval/                accuracy evaluation harness
tests/               Vitest tests (never call the real API)
```
