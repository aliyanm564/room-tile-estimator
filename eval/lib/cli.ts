// `npm run eval -- [options]`. Dependencies are injected so tests can prove a dry run makes no calls.
import { parseArgs } from "node:util";
import { DEFAULT_MODEL, MODEL_IDS, isModelId, type ModelId } from "@/lib/ai/models";
import { DEFAULT_PROMPT_ID, PROMPTS, PROMPT_IDS, isPromptId, type PromptId } from "@/lib/ai/prompt";
import type { FlooringProduct, Settings } from "@/types";
import { checkNotes } from "./notes";
import { renderReport, type EvalResultFile } from "./report";
import { missingPhotos, type EvalRoom } from "./rooms";
import { aggregate, buildPlan, estimatePlanCost, runPlan, type AnalyzeForEval } from "./runner";

export const USAGE = `Usage: npm run eval -- [options]

  --prompt <ids>       comma-separated: ${PROMPT_IDS.join(", ")} (default: ${DEFAULT_PROMPT_ID})
  --model <ids>        comma-separated: ${MODEL_IDS.join(", ")} (default: ${DEFAULT_MODEL})
  --repeats <n>        identical runs per configuration (default: 1)
  --rooms <ids>        comma-separated room ids from eval/rooms.json (default: all)
  --conditions <ids>   comma-separated condition ids (default: all valid ones)
  --max-cost <usd>     stop before actual spend would exceed this (default: 1)
  --dry-run            print the run matrix and estimated cost, then exit (no API calls)
  --rooms-file <path>  default: eval/rooms.json
  --out <dir>          default: eval/results
  --report-only <dir>  re-score notes and rebuild report.md from <dir>/results.json (no API calls)`;

export interface CliDeps {
  loadRooms: (path: string) => EvalRoom[];
  /** Only called for a real run. */
  createAnalyze: () => AnalyzeForEval;
  writeFiles: (dir: string, files: Record<string, string>) => void;
  /** Used by --report-only. */
  readFile?: (path: string) => string;
  product: FlooringProduct;
  settings: Settings;
  log: (line: string) => void;
  now: () => Date;
  exists?: (path: string) => boolean;
}

const list = (s: string | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

export async function runEvalCli(argv: string[], deps: CliDeps): Promise<{ exitCode: number; result?: EvalResultFile; outDir?: string }> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        prompt: { type: "string" },
        model: { type: "string" },
        repeats: { type: "string", default: "1" },
        rooms: { type: "string" },
        conditions: { type: "string" },
        "max-cost": { type: "string", default: "1" },
        "dry-run": { type: "boolean", default: false },
        "rooms-file": { type: "string", default: "eval/rooms.json" },
        out: { type: "string", default: "eval/results" },
        "report-only": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    deps.log(`Error: ${(e as Error).message}\n\n${USAGE}`);
    return { exitCode: 2 };
  }
  if (values.help) {
    deps.log(USAGE);
    return { exitCode: 0 };
  }

  // Rebuild a report from saved results (e.g. after improving the notes checks). Never calls the API.
  if (values["report-only"]) {
    const dir = values["report-only"];
    if (!deps.readFile) throw new Error("readFile dependency missing");
    const saved = JSON.parse(deps.readFile(`${dir}/results.json`)) as EvalResultFile;
    const runs = saved.runs.map((r) => ({ ...r, noteChecks: r.status === "ok" || r.status === "unusable" ? checkNotes(r.notes) : r.noteChecks }));
    const result: EvalResultFile = { ...saved, runs, groups: aggregate(runs) };
    deps.writeFiles(dir, { "results.json": JSON.stringify(result, null, 2) + "\n", "report.md": renderReport(result) });
    deps.log(`Rebuilt ${dir}/report.md from results.json (notes re-checked; no API calls).`);
    return { exitCode: 0, result, outDir: dir };
  }

  const prompts = list(values.prompt) ?? [DEFAULT_PROMPT_ID];
  const models = list(values.model) ?? [DEFAULT_MODEL];
  const repeats = Number(values.repeats);
  const maxCost = Number(values["max-cost"]);
  const bad = [
    ...prompts.filter((p) => !isPromptId(p)).map((p) => `unknown prompt "${p}"`),
    ...models.filter((m) => !isModelId(m)).map((m) => `unknown model "${m}"`),
    ...(Number.isInteger(repeats) && repeats >= 1 ? [] : ["--repeats must be a whole number ≥ 1"]),
    ...(Number.isFinite(maxCost) && maxCost > 0 ? [] : ["--max-cost must be a positive number of USD"]),
  ];
  if (bad.length) {
    deps.log(`Error: ${bad.join("; ")}\n\n${USAGE}`);
    return { exitCode: 2 };
  }

  const allRooms = deps.loadRooms(values["rooms-file"]!);
  const plan = buildPlan(allRooms, {
    prompts: prompts as PromptId[],
    models: models as ModelId[],
    repeats,
    roomIds: list(values.rooms),
    conditionIds: list(values.conditions),
  });
  const estimate = estimatePlanCost(plan);

  // ---- plan / dry run ----
  deps.log(`Eval plan: ${plan.runs.length} runs (sequential)`);
  deps.log(`  prompts: ${prompts.map((p) => `${p} (${PROMPTS[p as PromptId].version})`).join(", ")}`);
  deps.log(`  models:  ${models.join(", ")}`);
  deps.log(`  repeats: ${repeats}`);
  for (const room of plan.rooms) {
    const conds = [...new Set(plan.runs.filter((r) => r.roomId === room.id).map((r) => r.conditionId))];
    deps.log(`  room ${room.id} (${room.photos.length} photos): conditions ${conds.join(", ") || "none"}`);
  }
  for (const s of plan.skippedConditions) deps.log(`  skipped ${s.roomId}/${s.conditionId}: ${s.reason}`);
  deps.log("  matrix:");
  const groups = new Map<string, number>();
  for (const r of plan.runs) groups.set(`${r.roomId} / ${r.conditionId} / ${r.promptId} / ${r.model}`, (groups.get(`${r.roomId} / ${r.conditionId} / ${r.promptId} / ${r.model}`) ?? 0) + 1);
  for (const [k, v] of groups) deps.log(`    ${k} × ${v}`);
  deps.log("  estimated cost:");
  for (const [m, e] of Object.entries(estimate.byModel)) {
    deps.log(`    ${m}: ${e.runs} runs × ~$${e.perRun.toFixed(4)} = ~$${e.total.toFixed(4)}`);
  }
  deps.log(`    TOTAL ~$${estimate.total.toFixed(4)} (cap $${maxCost.toFixed(2)})${estimate.total > maxCost ? "  ⚠ exceeds the cap: the run would stop early" : ""}`);

  const missing = missingPhotos(plan.rooms, deps.exists);
  if (missing.length) deps.log(`  ⚠ missing photos (gitignored, add them locally): ${missing.join(", ")}`);

  if (values["dry-run"]) {
    deps.log("Dry run: no API calls made.");
    return { exitCode: 0 };
  }
  if (missing.length) {
    deps.log("Error: can't run with missing photos.");
    return { exitCode: 1 };
  }
  if (plan.runs.length === 0) {
    deps.log("Nothing to run.");
    return { exitCode: 1 };
  }

  // ---- real run ----
  const analyze = deps.createAnalyze();
  const started = deps.now();
  const outcome = await runPlan(plan, maxCost, { analyze, product: deps.product, settings: deps.settings, log: deps.log });

  const result: EvalResultFile = {
    createdAt: started.toISOString(),
    config: {
      prompts,
      promptVersions: Object.fromEntries(prompts.map((p) => [p, PROMPTS[p as PromptId].version])),
      models,
      repeats,
      roomIds: plan.rooms.map((r) => r.id),
      conditionIds: list(values.conditions) ?? null,
      maxCostUsd: maxCost,
    },
    estimatedCostUsd: estimate.total,
    totalCostUsd: outcome.totalCostUsd,
    aborted: outcome.aborted,
    abortReason: outcome.abortReason,
    rooms: plan.rooms.map((r) => ({ id: r.id, description: r.description, truth: r.truth })),
    skippedConditions: plan.skippedConditions,
    groups: aggregate(outcome.runs),
    runs: outcome.runs,
  };
  const outDir = `${values.out}/${started.toISOString().replace(/[:.]/g, "-")}`;
  deps.writeFiles(outDir, {
    "results.json": JSON.stringify(result, null, 2) + "\n",
    "report.md": renderReport(result),
  });
  deps.log(`\nDone: ${outcome.runs.filter((r) => r.status === "ok").length}/${outcome.runs.length} ok, actual cost $${outcome.totalCostUsd.toFixed(4)}.`);
  if (outcome.aborted) deps.log(`ABORTED: ${outcome.abortReason}`);
  deps.log(`Report: ${outDir}/report.md`);
  return { exitCode: outcome.aborted ? 3 : 0, result, outDir };
}
