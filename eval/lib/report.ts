// Markdown report for an eval run. Plain tables, readable on GitHub.
import { mean, stdDev } from "./metrics";
import type { EvalRoom } from "./rooms";
import type { GroupStats, RunRecord, SkippedCondition } from "./runner";

export interface EvalResultFile {
  createdAt: string;
  config: {
    prompts: string[];
    promptVersions: Record<string, string>;
    models: string[];
    repeats: number;
    roomIds: string[];
    conditionIds: string[] | null;
    maxCostUsd: number;
  };
  estimatedCostUsd: number;
  totalCostUsd: number;
  aborted: boolean;
  abortReason: string | null;
  rooms: Pick<EvalRoom, "id" | "description" | "truth">[];
  skippedConditions: SkippedCondition[];
  groups: GroupStats[];
  runs: RunRecord[];
}

const n = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : x.toFixed(d));
const signed = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(d)}%`);
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const usd = (x: number | null | undefined, d = 4) => (x === null || x === undefined ? "—" : `$${x.toFixed(d)}`);
const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`);
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

/** Pool runs by prompt × model across rooms/conditions. */
function pooled(runs: RunRecord[]) {
  const keys = [...new Set(runs.map((r) => `${r.promptId}|${r.model}`))];
  return keys.map((k) => {
    const [promptId, model] = k.split("|");
    const rs = runs.filter((r) => r.promptId === promptId && r.model === model);
    const ok = rs.filter((r) => r.status === "ok" && r.score?.area);
    const a = ok.map((r) => r.score!.area!);
    const notes = rs.flatMap((r) => r.notes);
    const v = rs.reduce(
      (s, r) => s + (r.noteChecks ? new Set([...r.noteChecks.firstPerson, ...r.noteChecks.unsupportedAction, ...r.noteChecks.asksUser, ...r.noteChecks.questions]).size : 0),
      0,
    );
    return [
      promptId,
      model,
      `${ok.length}/${rs.length}`,
      signed(mean(a.map((x) => x.errorPct))),
      `${n(mean(a.map((x) => x.absErrorPct)))}%`,
      pct(a.length ? a.filter((x) => x.covered).length / a.length : null),
      `${n(mean(a.map((x) => x.rangeWidthPct)), 0)}%`,
      usd(mean(rs.filter((r) => r.costUsd > 0).map((r) => r.costUsd))),
      secs(mean(rs.filter((r) => r.durationMs !== null).map((r) => r.durationMs!))),
      `${v} of ${notes.length}`,
    ];
  });
}

export function renderReport(res: EvalResultFile): string {
  const runs = res.runs;
  const count = (s: string) => runs.filter((r) => r.status === s).length;
  const out: string[] = [];

  out.push(`# Eval report — ${res.createdAt}`, "");
  out.push(
    `- **Prompts:** ${res.config.prompts.map((p) => `${p} (${res.config.promptVersions[p]})`).join(", ")}`,
    `- **Models:** ${res.config.models.join(", ")}`,
    `- **Repeats:** ${res.config.repeats} · **Rooms:** ${res.config.roomIds.join(", ")}${res.config.conditionIds ? ` · **Conditions:** ${res.config.conditionIds.join(", ")}` : ""}`,
    `- **Runs:** ${runs.length} planned · ${count("ok")} ok · ${count("unusable")} unusable · ${count("failed")} failed · ${count("skipped_cost_cap")} skipped (cost cap)`,
    `- **Cost:** ${usd(res.totalCostUsd)} actual (estimated ${usd(res.estimatedCostUsd)}; cap $${res.config.maxCostUsd.toFixed(2)})`,
  );
  if (res.aborted) out.push(`- **ABORTED:** ${res.abortReason}`);
  out.push(
    "",
    "Area = total floor area the app would compute (main room + closets − built-ins, after the merge locks any known wall). Error = (likely − truth) / truth. Coverage = truth inside the low–high range. Spread = likely area across identical repeats.",
    "",
  );

  out.push("## Rooms and ground truth", "");
  out.push(
    table(
      ["Room", "Total area", "Main (L × W)", "Closets", "Notes"],
      res.rooms.map((r) => [
        r.id,
        `${r.truth.totalAreaSqft} sq ft`,
        r.truth.main ? `${r.truth.main.lengthFt} × ${r.truth.main.widthFt} ft` : "unknown",
        r.truth.closets ? r.truth.closets.map((c) => `${c.widthFt} × ${c.depthFt}`).join(", ") : "unknown",
        esc(r.truth.notes ?? ""),
      ]),
    ),
    "",
  );

  if (res.skippedConditions.length) {
    out.push("## Skipped conditions", "");
    out.push(table(["Room", "Condition", "Reason"], res.skippedConditions.map((s) => [s.roomId, s.conditionId, esc(s.reason)])), "");
  }

  out.push("## Summary by prompt × model (all rooms and conditions pooled)", "");
  out.push(
    table(["Prompt", "Model", "OK", "Mean error", "Mean \\|error\\|", "Coverage", "Range width", "Cost/run", "Time/run", "Notes flagged"], pooled(runs)),
    "",
  );

  out.push("## Results by group (room × condition × prompt × model)", "");
  out.push(
    table(
      ["Room", "Condition", "Prompt", "Model", "OK", "Mean error", "Mean \\|error\\|", "Likely area min–max", "Spread (SD)", "Coverage", "Range width", "Closet", "Cost/run", "Time/run"],
      res.groups.map((g) => [
        g.roomId,
        g.conditionId,
        g.promptId,
        g.model,
        `${g.ok}/${g.planned}${g.failed ? ` (${g.failed} failed)` : ""}${g.unusable ? ` (${g.unusable} unusable)` : ""}`,
        signed(g.meanErrorPct),
        `${n(g.meanAbsErrorPct)}%`,
        g.likelyMin === null ? "—" : `${n(g.likelyMin)}–${n(g.likelyMax)}`,
        g.likelyStdDev === null ? "—" : `${n(g.likelyStdDev)} sq ft`,
        pct(g.coverageRate),
        `${n(g.meanRangeWidthPct, 0)}%`,
        g.meanClosetAreaLikely === null ? "none" : `${n(g.meanClosetAreaLikely)} sq ft`,
        usd(g.meanCostUsd),
        secs(g.meanDurationMs),
      ]),
    ),
    "",
  );

  // Variation between identical runs, pooled over groups.
  const sds = res.groups.map((g) => g.likelyStdDev).filter((x): x is number => x !== null);
  const ranges = res.groups.filter((g) => g.likelyMin !== null && g.ok > 1).map((g) => g.likelyMax! - g.likelyMin!);
  if (sds.length) {
    out.push(
      "## Repeatability",
      "",
      `Across ${sds.length} groups with ≥ 2 successful repeats: likely-area SD averages ${n(mean(sds))} sq ft (max ${n(Math.max(...sds))}); min–max spread averages ${n(mean(ranges))} sq ft (max ${n(Math.max(...ranges))}). A difference between configurations smaller than this is indistinguishable from run-to-run noise.`,
      "",
    );
  }

  out.push("## Notes rule checks (heuristic; read the flagged notes)", "");
  const flagged = runs.flatMap((r) =>
    r.noteChecks
      ? [
          ...r.noteChecks.firstPerson.map((t) => [r.index, r.promptId, r.model, "first person", t] as const),
          ...r.noteChecks.unsupportedAction.map((t) => [r.index, r.promptId, r.model, "unsupported action", t] as const),
          ...r.noteChecks.asksUser.map((t) => [r.index, r.promptId, r.model, "asks user to check/confirm", t] as const),
          ...r.noteChecks.questions.map((t) => [r.index, r.promptId, r.model, "question", t] as const),
        ]
      : [],
  );
  out.push(
    flagged.length
      ? table(["Run", "Prompt", "Model", "Rule", "Note"], flagged.map(([i, p, m, rule, t]) => [String(i), p, m, rule, esc(t)]))
      : "No notes flagged.",
    "",
  );

  out.push("## All runs", "");
  out.push(
    table(
      ["#", "Rep", "Room", "Condition", "Prompt", "Model", "Status", "Area likely (low–high)", "Error", "In range", "Width", "Main L × W (likely)", "Closet", "Conf.", "Issues", "Tokens in/out", "Cost", "Time", "Att."],
      runs.map((r) => {
        const a = r.score?.area;
        const m = r.score?.main;
        return [
          String(r.index),
          String(r.repeat),
          r.roomId,
          r.conditionId,
          r.promptId,
          r.model,
          r.status === "failed" ? `failed: ${r.error?.code}` : r.status,
          a ? `${n(a.likely)} (${n(a.low)}–${n(a.high)})` : "—",
          a ? signed(a.errorPct) : "—",
          a ? (a.covered ? "yes" : "**no**") : "—",
          a ? `${n(a.rangeWidthPct, 0)}%` : "—",
          m ? `${n(m.longer.likely, 2)}${m.longer.source === "measured" ? "*" : ""} × ${n(m.shorter.likely, 2)}${m.shorter.source === "measured" ? "*" : ""}` : "—",
          r.score?.closetAreaLikely ? `${n(r.score.closetAreaLikely)}` : "—",
          r.confidence ?? "—",
          r.issues.length ? r.issues.join(", ") : "—",
          `${r.inputTokens}/${r.outputTokens}`,
          usd(r.costUsd),
          secs(r.durationMs),
          r.attempts === null ? "—" : String(r.attempts),
        ];
      }),
    ),
    "",
    "`*` = measured (locked by the merge).",
    "",
  );

  out.push("## Notes by run", "");
  for (const r of runs.filter((x) => x.notes.length)) {
    out.push(`- **#${r.index}** ${r.promptId} / ${r.model} / ${r.conditionId}:`);
    for (const note of r.notes) out.push(`  - ${note}`);
  }
  out.push("");
  return out.join("\n");
}

// re-export for tests
export { mean, stdDev };
