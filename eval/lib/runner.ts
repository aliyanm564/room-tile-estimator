// Eval runner: builds the run matrix, runs it SEQUENTIALLY with a hard cost cap, records every run
// (including failures), and aggregates per group. The analyze function is injected, so tests never
// touch the API.

import type { AnalyzeOptions } from "@/lib/ai/provider";
import { estimateCostUsd, type ModelId } from "@/lib/ai/models";
import type { PromptId } from "@/lib/ai/prompt";
import type { RoomAnalysis } from "@/lib/ai/schema";
import type { FlooringProduct, Settings } from "@/types";
import { mean, scoreAnalysis, stdDev, type RunScore } from "./metrics";
import { checkNotes, type NoteChecks } from "./notes";
import type { EvalCondition, EvalRoom } from "./rooms";

export interface RunSpec {
  index: number;
  repeat: number;
  roomId: string;
  conditionId: string;
  promptId: PromptId;
  model: ModelId;
}

export interface SkippedCondition {
  roomId: string;
  conditionId: string;
  reason: string;
}

export interface EvalPlan {
  rooms: EvalRoom[];
  runs: RunSpec[];
  skippedConditions: SkippedCondition[];
}

/**
 * Matrix order: repeat → room → condition → prompt → model. Repeats are the OUTER loop so identical
 * configurations are spread over time rather than run back to back.
 */
export function buildPlan(
  allRooms: EvalRoom[],
  opts: { prompts: PromptId[]; models: ModelId[]; repeats: number; roomIds?: string[]; conditionIds?: string[] },
): EvalPlan {
  const rooms = opts.roomIds?.length ? allRooms.filter((r) => opts.roomIds!.includes(r.id)) : allRooms;
  const unknownRooms = (opts.roomIds ?? []).filter((id) => !allRooms.some((r) => r.id === id));
  if (unknownRooms.length) throw new Error(`Unknown room id(s): ${unknownRooms.join(", ")}`);

  const skippedConditions: SkippedCondition[] = [];
  const active: { room: EvalRoom; condition: EvalCondition }[] = [];
  for (const room of rooms) {
    for (const c of room.conditions) {
      if (opts.conditionIds?.length && !opts.conditionIds.includes(c.id)) continue;
      if (!c.valid) skippedConditions.push({ roomId: room.id, conditionId: c.id, reason: c.invalidReason ?? "marked invalid" });
      else active.push({ room, condition: c });
    }
  }

  const runs: RunSpec[] = [];
  for (let repeat = 1; repeat <= opts.repeats; repeat++) {
    for (const { room, condition } of active) {
      for (const promptId of opts.prompts) {
        for (const model of opts.models) {
          runs.push({ index: runs.length + 1, repeat, roomId: room.id, conditionId: condition.id, promptId, model });
        }
      }
    }
  }
  return { rooms, runs, skippedConditions };
}

// ---------- cost estimate (dry run + cap) ----------

/**
 * Calibrated on real runs (2026-11-23, prompt v2): 2 photos ≈ 8,250 input tokens (~3,250 prompt +
 * ~2,500 per 1568px photo); output 585–1,211. We assume 1,500 output tokens to stay conservative.
 */
export const EST_PROMPT_TOKENS = 3_250;
export const EST_TOKENS_PER_PHOTO = 2_500;
export const EST_OUTPUT_TOKENS = 1_500;

export function estimateRunCost(model: ModelId, photoCount: number): number {
  return estimateCostUsd(model, EST_PROMPT_TOKENS + EST_TOKENS_PER_PHOTO * photoCount, EST_OUTPUT_TOKENS);
}

export function estimatePlanCost(plan: EvalPlan): { total: number; byModel: Record<string, { runs: number; perRun: number; total: number }> } {
  const byModel: Record<string, { runs: number; perRun: number; total: number }> = {};
  let total = 0;
  for (const run of plan.runs) {
    const room = plan.rooms.find((r) => r.id === run.roomId)!;
    const c = estimateRunCost(run.model, room.photos.length);
    total += c;
    const m = (byModel[run.model] ??= { runs: 0, perRun: c, total: 0 });
    m.runs++;
    m.total += c;
  }
  return { total, byModel };
}

// ---------- running ----------

export type RunStatus = "ok" | "unusable" | "failed" | "skipped_cost_cap";

export interface RunRecord extends RunSpec {
  status: RunStatus;
  promptVersion: string | null;
  truthAreaSqft: number;
  score: RunScore | null;
  confidence: string | null;
  issues: string[];
  notes: string[];
  noteChecks: NoteChecks | null;
  error: { code: string; message: string } | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** AI time (meta.durationMs). */
  durationMs: number | null;
  /** Wall-clock incl. photo preprocessing. */
  totalMs: number;
  attempts: number | null;
}

export type AnalyzeForEval = (photos: string[], options: AnalyzeOptions) => Promise<RoomAnalysis>;

export interface RunDeps {
  analyze: AnalyzeForEval;
  product: FlooringProduct;
  settings: Settings;
  now?: () => number;
  log?: (line: string) => void;
}

export interface EvalOutcome {
  runs: RunRecord[];
  totalCostUsd: number;
  aborted: boolean;
  abortReason: string | null;
}

function errorSpend(e: unknown): { inputTokens: number; outputTokens: number; estimatedCostUsd: number } | null {
  const s = (e as { spend?: unknown })?.spend as { inputTokens: number; outputTokens: number; estimatedCostUsd: number } | undefined;
  return s && typeof s.estimatedCostUsd === "number" ? s : null;
}

/**
 * Runs the plan one call at a time. Before each run: if (actual spend so far + the next run's
 * expected cost) would exceed maxCostUsd, stop and mark the rest skipped. The next run's expected
 * cost is the larger of the estimate and the most expensive actual run of that model so far.
 */
export async function runPlan(plan: EvalPlan, maxCostUsd: number, deps: RunDeps): Promise<EvalOutcome> {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const runs: RunRecord[] = [];
  const maxSeen: Partial<Record<ModelId, number>> = {};
  let spent = 0;
  let abortReason: string | null = null;

  for (const spec of plan.runs) {
    const room = plan.rooms.find((r) => r.id === spec.roomId)!;
    const condition = room.conditions.find((c) => c.id === spec.conditionId)!;
    const base: Omit<RunRecord, "status"> = {
      ...spec,
      truthAreaSqft: room.truth.totalAreaSqft,
      promptVersion: null,
      score: null,
      confidence: null,
      issues: [],
      notes: [],
      noteChecks: null,
      error: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: null,
      totalMs: 0,
      attempts: null,
    };

    const expected = Math.max(estimateRunCost(spec.model, room.photos.length), maxSeen[spec.model] ?? 0);
    if (abortReason || spent + expected > maxCostUsd) {
      abortReason ??= `Stopped before run ${spec.index}: spent $${spent.toFixed(4)} + next run ~$${expected.toFixed(4)} would exceed the $${maxCostUsd.toFixed(2)} cap.`;
      runs.push({ ...base, status: "skipped_cost_cap" });
      continue;
    }

    log(`[eval] run ${spec.index}/${plan.runs.length}: ${spec.roomId} / ${spec.conditionId} / ${spec.promptId} / ${spec.model} (repeat ${spec.repeat})`);
    const started = now();
    try {
      const analysis = await deps.analyze(room.photos, {
        model: spec.model,
        promptId: spec.promptId,
        knownMeasurement: condition.knownMeasurement ?? undefined,
      });
      const score = scoreAnalysis(analysis, condition, room.truth, deps.product, deps.settings);
      const m = analysis.meta;
      spent += m.estimatedCostUsd;
      maxSeen[spec.model] = Math.max(maxSeen[spec.model] ?? 0, m.estimatedCostUsd);
      runs.push({
        ...base,
        status: score.usable ? "ok" : "unusable",
        promptVersion: m.promptVersion,
        score,
        confidence: analysis.confidence,
        issues: analysis.issues.map((i) => i.code),
        notes: analysis.notes,
        noteChecks: checkNotes(analysis.notes),
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        costUsd: m.estimatedCostUsd,
        durationMs: m.durationMs,
        totalMs: now() - started,
        attempts: m.attempts,
      });
    } catch (e) {
      // A failed run is recorded, never a crash. Count anything it already spent.
      const spend = errorSpend(e);
      if (spend) {
        spent += spend.estimatedCostUsd;
        maxSeen[spec.model] = Math.max(maxSeen[spec.model] ?? 0, spend.estimatedCostUsd);
      }
      const code = typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : "error";
      runs.push({
        ...base,
        status: "failed",
        error: { code, message: e instanceof Error ? e.message : String(e) },
        inputTokens: spend?.inputTokens ?? 0,
        outputTokens: spend?.outputTokens ?? 0,
        costUsd: spend?.estimatedCostUsd ?? 0,
        totalMs: now() - started,
      });
      log(`[eval]   failed: ${code}`);
    }
  }
  return { runs, totalCostUsd: spent, aborted: abortReason !== null, abortReason };
}

// ---------- aggregation ----------

export interface GroupStats {
  roomId: string;
  conditionId: string;
  promptId: PromptId;
  model: ModelId;
  planned: number;
  ok: number;
  unusable: number;
  failed: number;
  skipped: number;
  meanErrorPct: number | null;
  meanAbsErrorPct: number | null;
  likelyMin: number | null;
  likelyMax: number | null;
  likelyStdDev: number | null;
  /** Fraction of ok runs whose low–high contains the truth. */
  coverageRate: number | null;
  meanRangeWidthPct: number | null;
  meanClosetAreaLikely: number | null;
  meanCostUsd: number | null;
  totalCostUsd: number;
  meanDurationMs: number | null;
  notesTotal: number;
  noteViolations: { firstPerson: number; unsupportedAction: number; asksUser: number; questions: number };
}

export function groupKey(r: Pick<RunSpec, "roomId" | "conditionId" | "promptId" | "model">) {
  return `${r.roomId}|${r.conditionId}|${r.promptId}|${r.model}`;
}

export function aggregate(runs: RunRecord[]): GroupStats[] {
  const groups = new Map<string, RunRecord[]>();
  for (const r of runs) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.values()].map((rs) => {
    const ok = rs.filter((r) => r.status === "ok" && r.score?.area);
    const areas = ok.map((r) => r.score!.area!);
    const likely = areas.map((a) => a.likely);
    const billed = rs.filter((r) => r.status !== "skipped_cost_cap" && r.costUsd > 0);
    const timed = rs.filter((r) => r.durationMs !== null);
    const closets = ok.map((r) => r.score!.closetAreaLikely).filter((x): x is number => x !== null);
    const checks = rs.map((r) => r.noteChecks).filter((c): c is NoteChecks => c !== null);
    return {
      roomId: rs[0].roomId,
      conditionId: rs[0].conditionId,
      promptId: rs[0].promptId,
      model: rs[0].model,
      planned: rs.length,
      ok: ok.length,
      unusable: rs.filter((r) => r.status === "unusable").length,
      failed: rs.filter((r) => r.status === "failed").length,
      skipped: rs.filter((r) => r.status === "skipped_cost_cap").length,
      meanErrorPct: mean(areas.map((a) => a.errorPct)),
      meanAbsErrorPct: mean(areas.map((a) => a.absErrorPct)),
      likelyMin: likely.length ? Math.min(...likely) : null,
      likelyMax: likely.length ? Math.max(...likely) : null,
      likelyStdDev: stdDev(likely),
      coverageRate: areas.length ? areas.filter((a) => a.covered).length / areas.length : null,
      meanRangeWidthPct: mean(areas.map((a) => a.rangeWidthPct)),
      meanClosetAreaLikely: mean(closets),
      meanCostUsd: mean(billed.map((r) => r.costUsd)),
      totalCostUsd: rs.reduce((s, r) => s + r.costUsd, 0),
      meanDurationMs: mean(timed.map((r) => r.durationMs!)),
      notesTotal: rs.reduce((s, r) => s + r.notes.length, 0),
      noteViolations: {
        firstPerson: checks.reduce((s, c) => s + c.firstPerson.length, 0),
        unsupportedAction: checks.reduce((s, c) => s + c.unsupportedAction.length, 0),
        asksUser: checks.reduce((s, c) => s + c.asksUser.length, 0),
        questions: checks.reduce((s, c) => s + c.questions.length, 0),
      },
    };
  });
}
