// Analyze room photos from the command line (no HTTP). Calls the real API — costs money.
//
//   npm run analyze -- a.jpg b.heic [--known 14 --which longest] [--room "Main bedroom"]
//                       [--model claude-haiku-5-5] [--json]
//
// --json prints only the JSON (for piping into the Phase 4 eval).

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { analyzeFiles } from "@/lib/ai/analyze-files";
import { DEFAULT_MODEL, MODEL_IDS, isModelId } from "@/lib/ai/models";
import type { KnownMeasurement } from "@/lib/ai/prompt";
import { UserFacingError } from "@/lib/errors";

const USAGE = `Usage: npm run analyze -- <photo> [photo ...] [options]

Options:
  --known <feet>      a measurement you know, in feet (e.g. 14 or 13.5)
  --which <which>     what --known is: longest | shortest | unknown (default: unknown)
  --room <name>       room name, e.g. "Main bedroom"
  --model <id>        ${MODEL_IDS.join(" | ")} (default: ${DEFAULT_MODEL})
  --json              print only the JSON result
  -h, --help          show this help`;

function fail(message: string): never {
  console.error(`Error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      known: { type: "string" },
      which: { type: "string", default: "unknown" },
      room: { type: "string" },
      model: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length === 0) fail("give at least one photo path.");
  // --json: stdout must be ONLY the JSON (for piping into the eval), so send log lines to stderr.
  if (values.json) console.info = (...args: unknown[]) => console.error(...args);

  let knownMeasurement: KnownMeasurement | undefined;
  if (values.known !== undefined) {
    const valueFt = Number(values.known);
    if (!Number.isFinite(valueFt) || valueFt <= 0) fail(`--known must be a positive number of feet.`);
    const which = values.which;
    if (which !== "longest" && which !== "shortest" && which !== "unknown") {
      fail(`--which must be longest, shortest or unknown.`);
    }
    knownMeasurement = { valueFt, which };
  }
  if (values.model !== undefined && !isModelId(values.model)) {
    fail(`unknown model "${values.model}". Use one of: ${MODEL_IDS.join(", ")}`);
  }

  const result = await analyzeFiles(positionals, {
    roomName: values.room,
    knownMeasurement,
    model: values.model as (typeof MODEL_IDS)[number] | undefined,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!values.json) {
    const m = result.meta;
    console.log(
      [
        "",
        `Model:     ${m.model} (prompt ${m.promptVersion}, ${m.attempts} attempt${m.attempts > 1 ? "s" : ""})`,
        `Tokens:    ${m.inputTokens.toLocaleString()} in / ${m.outputTokens.toLocaleString()} out`,
        `Est. cost: $${m.estimatedCostUsd.toFixed(4)} USD`,
        `Time:      ${(m.durationMs / 1000).toFixed(1)}s`,
      ].join("\n"),
    );
  }
}

main().catch((e) => {
  if (e instanceof UserFacingError) {
    console.error(`Error (${e.code}): ${e.userMessage}`);
    if (e.message !== e.userMessage) console.error(`Detail: ${e.message}`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
