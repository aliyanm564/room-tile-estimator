// Evaluation harness entry point. Calls the REAL API (except with --dry-run) — costs money.
//
//   npm run eval -- --dry-run --prompt v2,v3 --model claude-sonnet-5-5,claude-haiku-5-5 --repeats 3
//   npm run eval -- --prompt v2,v3 --model claude-sonnet-5-5,claude-haiku-5-5 --repeats 3 --max-cost 1
//
// See eval/lib/cli.ts for options. Results: eval/results/<timestamp>/{results.json,report.md}
// (no images; safe to commit). Photos stay in gitignored tests/fixtures/rooms/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "@/lib/ai/analyze-files";
import { createAnthropicAnalyzer } from "@/lib/ai/anthropic";
import { loadConfig } from "@/lib/catalog";
import { runEvalCli } from "./lib/cli";
import { loadRooms } from "./lib/rooms";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { products, settings } = loadConfig();

// Keep per-call [ai] log lines out of the way (stderr); progress goes to stdout.
console.info = (...args: unknown[]) => console.error(...args);

runEvalCli(process.argv.slice(2), {
  loadRooms,
  createAnalyze: () => {
    const analyzer = createAnthropicAnalyzer();
    // Same preprocessing + provider path as `npm run analyze`.
    return (photos, options) => analyzeFiles(photos, options, analyzer);
  },
  writeFiles: (dir, files) => {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  },
  readFile: (path) => readFileSync(path, "utf8"),
  product: products[0], // area doesn't depend on the product
  settings,
  log: (line) => console.log(line),
  now: () => new Date(),
})
  .then(({ exitCode }) => process.exit(exitCode))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
