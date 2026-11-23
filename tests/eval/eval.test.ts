import { describe, expect, it, vi } from "vitest";
import type { RoomAnalysis } from "@/lib/ai/schema";
import { AnalysisError } from "@/lib/ai/provider";
import { runEvalCli, type CliDeps } from "../../eval/lib/cli";
import { scoreAnalysis, scoreRange, stdDev, wallsFor } from "../../eval/lib/metrics";
import { checkNotes } from "../../eval/lib/notes";
import { renderReport } from "../../eval/lib/report";
import { loadRooms, missingPhotos, parseRooms, type EvalRoom } from "../../eval/lib/rooms";
import { aggregate, buildPlan, estimateRunCost, runPlan, type AnalyzeForEval, type RunRecord } from "../../eval/lib/runner";
import { product, settings } from "../fixtures";
import { r, sec, validOutput } from "../helpers/images";

const ROOM: EvalRoom = {
  id: "room-a",
  photos: ["a.heic", "b.heic"],
  truth: { totalAreaSqft: 112.5 },
  conditions: [
    { id: "none", knownMeasurement: null, valid: true },
    { id: "known-shortest", knownMeasurement: { valueFt: 9.02, which: "shortest" }, valid: true },
    { id: "known-longest", knownMeasurement: { valueFt: 12.47, which: "longest" }, valid: false, invalidReason: "includes closet" },
  ],
};

/** Main 11–13 × 8.5–10 (likely 12 × 9) + closet 5 × 2: likely total 118 sq ft. */
function analysis(over: Partial<RoomAnalysis> = {}, cost = 0.03): RoomAnalysis {
  return {
    ...validOutput({ sections: [sec(r(11, 12, 13), r(8.5, 9, 10)), sec(r(4, 5, 6), r(2, 2, 2), "closet")] }),
    photos: [],
    meta: { model: "claude-sonnet-5-5", promptId: "v2", promptVersion: "x", knownMeasurement: null, inputTokens: 8000, outputTokens: 1000, estimatedCostUsd: cost, durationMs: 9000, attempts: 1 },
    ...over,
  } as RoomAnalysis;
}

const deps = (analyze: AnalyzeForEval) => ({ analyze, product, settings });

describe("metrics", () => {
  it("error %, coverage and range width", () => {
    const s = scoreRange({ low: 100, likely: 120, high: 140 }, 112.5);
    expect(s.errorPct).toBeCloseTo(6.667, 3);
    expect(s.absErrorPct).toBeCloseTo(6.667, 3);
    expect(s.covered).toBe(true);
    expect(s.rangeWidthPct).toBeCloseTo(33.333, 3);
    const under = scoreRange({ low: 90, likely: 95, high: 110 }, 112.5);
    expect(under.errorPct).toBeCloseTo(-15.556, 3);
    expect(under.covered).toBe(false);
    expect(scoreRange({ low: 112.5, likely: 112.5, high: 112.5 }, 112.5).covered).toBe(true); // boundaries count
  });

  it("sample standard deviation; null for < 2 values", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdDev([5])).toBeNull();
  });

  it("total area = main + closets − built-ins, through the same merge as the app", () => {
    const a = analysis({ obstacles: [{ label: "vanity", lengthFt: r(2, 3, 4), widthFt: r(2, 2, 2) }] });
    const s = scoreAnalysis(a, ROOM.conditions[0], ROOM.truth, product, settings);
    expect(s.area!.likely).toBe(12 * 9 + 10 - 6);
    expect(s.closetCount).toBe(1);
    expect(s.closetAreaLikely).toBe(10);
  });

  it("a known-shortest condition locks that wall exactly, like the app", () => {
    expect(wallsFor(ROOM.conditions[1])).toEqual({ longerFt: null, shorterFt: 9.02 });
    const s = scoreAnalysis(analysis(), ROOM.conditions[1], ROOM.truth, product, settings);
    expect(s.main!.shorter).toMatchObject({ low: 9.02, likely: 9.02, high: 9.02, source: "measured" });
    expect(s.area!.likely).toBeCloseTo(12 * 9.02 + 10, 10);
  });

  it("per-dimension scores only when the truth has main dimensions", () => {
    expect(scoreAnalysis(analysis(), ROOM.conditions[0], ROOM.truth, product, settings).mainScore).toBeNull();
    const s = scoreAnalysis(analysis(), ROOM.conditions[0], { totalAreaSqft: 112.5, main: { lengthFt: 11, widthFt: 9 } }, product, settings);
    expect(s.mainScore!.length.errorPct).toBeCloseTo(9.09, 2);
    expect(s.mainScore!.width.errorPct).toBe(0);
  });

  it("unusable analysis → no area", () => {
    const bad = analysis({ usable: false, sections: [], issues: [{ code: "too_dark", message: "dark", photoIndex: 1, source: "model" }] });
    expect(scoreAnalysis(bad, ROOM.conditions[0], ROOM.truth, product, settings)).toMatchObject({ usable: false, area: null });
  });
});

describe("rooms file", () => {
  it("the committed eval/rooms.json is valid, and known-longest is marked invalid with a reason", () => {
    const rooms = loadRooms("eval/rooms.json");
    const room = rooms.find((x) => x.id === "bedroom-1")!;
    expect(room.truth.totalAreaSqft).toBe(112.5);
    expect(room.conditions.filter((c) => c.valid).map((c) => c.id)).toEqual(["none", "known-shortest"]);
    expect(room.conditions.find((c) => c.id === "known-longest")).toMatchObject({ valid: false, invalidReason: expect.stringMatching(/includes the closet/) });
  });

  it("rejects bad room files with a clear error", () => {
    expect(() => parseRooms({ rooms: [{ ...ROOM, truth: {} }] })).toThrow(/truth\.totalAreaSqft/);
    expect(() => parseRooms({ rooms: [{ ...ROOM, conditions: [{ id: "x", knownMeasurement: null, valid: false }] }] })).toThrow(/invalidReason/);
    expect(() => parseRooms({ rooms: [ROOM, ROOM] })).toThrow(/unique/);
    expect(() => parseRooms({ rooms: [{ ...ROOM, photos: Array(7).fill("p.jpg") }] })).toThrow(/photos/);
  });

  it("reports missing photos", () => {
    expect(missingPhotos([ROOM], (p) => p === "a.heic")).toEqual(["b.heic"]);
  });
});

describe("plan", () => {
  it("builds the matrix, skips invalid conditions with their reason, repeats outermost", () => {
    const plan = buildPlan([ROOM], { prompts: ["v2", "v3"], models: ["claude-sonnet-5-5", "claude-haiku-5-5"], repeats: 3 });
    expect(plan.runs).toHaveLength(2 * 2 * 2 * 3);
    expect(plan.skippedConditions).toEqual([{ roomId: "room-a", conditionId: "known-longest", reason: "includes closet" }]);
    expect(plan.runs.slice(0, 8).every((x) => x.repeat === 1)).toBe(true);
    expect(plan.runs[0]).toMatchObject({ index: 1, conditionId: "none", promptId: "v2", model: "claude-sonnet-5-5" });
    expect(() => buildPlan([ROOM], { prompts: ["v2"], models: ["claude-sonnet-5-5"], repeats: 1, roomIds: ["nope"] })).toThrow(/Unknown room/);
  });

  it("estimates cost from calibrated token counts", () => {
    // 2 photos: 8,250 in / 1,500 out → Sonnet $0.0315, Haiku $0.001575
    expect(estimateRunCost("claude-sonnet-5-5", 2)).toBeCloseTo(0.0315, 6);
    expect(estimateRunCost("claude-haiku-5-5", 2)).toBeCloseTo(0.001575, 6);
  });
});

describe("runPlan", () => {
  const plan = buildPlan([ROOM], { prompts: ["v2"], models: ["claude-sonnet-5-5"], repeats: 3, conditionIds: ["none"] });

  it("runs sequentially, never two at once, passing prompt/model/known measurement", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const analyze = vi.fn<AnalyzeForEval>(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((res) => setTimeout(res, 5));
      inFlight--;
      return analysis();
    });
    const both = buildPlan([ROOM], { prompts: ["v3"], models: ["claude-haiku-5-5"], repeats: 1 });
    const out = await runPlan(both, 1, deps(analyze));
    expect(maxInFlight).toBe(1);
    expect(analyze.mock.calls.map((c) => c[1])).toEqual([
      { model: "claude-haiku-5-5", promptId: "v3", knownMeasurement: undefined },
      { model: "claude-haiku-5-5", promptId: "v3", knownMeasurement: { valueFt: 9.02, which: "shortest" } },
    ]);
    expect(out.runs.every((x) => x.status === "ok")).toBe(true);
  });

  it("a failed run is recorded (with what it spent) and the eval continues", async () => {
    const err = new AnalysisError("invalid_output", "nope", 502, "detail");
    err.spend = { inputTokens: 16000, outputTokens: 2000, estimatedCostUsd: 0.05 };
    const analyze = vi.fn<AnalyzeForEval>().mockResolvedValueOnce(analysis()).mockRejectedValueOnce(err).mockRejectedValueOnce(new Error("socket hang up"));
    const out = await runPlan(plan, 1, deps(analyze));
    expect(out.runs.map((x) => x.status)).toEqual(["ok", "failed", "failed"]);
    expect(out.runs[1]).toMatchObject({ error: { code: "invalid_output" }, costUsd: 0.05, inputTokens: 16000 });
    expect(out.runs[2].error).toEqual({ code: "error", message: "socket hang up" });
    expect(out.totalCostUsd).toBeCloseTo(0.08, 10);
    expect(out.aborted).toBe(false);
  });

  it("aborts BEFORE exceeding the cap, based on actual spend so far", async () => {
    // Estimate is ~$0.03/run, but each run actually costs $0.40. Cap $1:
    // run 1 → $0.40; run 2 → $0.80; run 3 would need ~$0.40 more (largest actual) → $1.20 > $1 → stop.
    const analyze = vi.fn<AnalyzeForEval>().mockResolvedValue(analysis({}, 0.4));
    const out = await runPlan(plan, 1, deps(analyze));
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(out.runs.map((x) => x.status)).toEqual(["ok", "ok", "skipped_cost_cap"]);
    expect(out.totalCostUsd).toBeCloseTo(0.8, 10);
    expect(out.totalCostUsd).toBeLessThanOrEqual(1);
    expect(out.aborted).toBe(true);
    expect(out.abortReason).toMatch(/Stopped before run 3: spent \$0\.8000/);
  });

  it("won't even start if the first run's estimate exceeds the cap", async () => {
    const analyze = vi.fn<AnalyzeForEval>();
    const out = await runPlan(plan, 0.01, deps(analyze));
    expect(analyze).not.toHaveBeenCalled();
    expect(out.runs.every((x) => x.status === "skipped_cost_cap")).toBe(true);
  });
});

describe("aggregate", () => {
  it("per group: mean error, spread, coverage, width, cost, time; failures counted separately", async () => {
    const mk = (likely: number) =>
      analysis({ sections: [sec(r(10, likely / 9, 13), r(9, 9, 9))] }, 0.03); // area likely = likely, low 90, high 117
    const analyze = vi.fn<AnalyzeForEval>().mockResolvedValueOnce(mk(108)).mockResolvedValueOnce(mk(117)).mockRejectedValueOnce(new Error("x"));
    const plan = buildPlan([ROOM], { prompts: ["v2"], models: ["claude-sonnet-5-5"], repeats: 3, conditionIds: ["none"] });
    const out = await runPlan(plan, 1, deps(analyze));
    const [g] = aggregate(out.runs);
    expect(g).toMatchObject({ planned: 3, ok: 2, failed: 1, likelyMin: 108, likelyMax: 117, coverageRate: 1 });
    expect(g.meanErrorPct).toBeCloseTo(((108 - 112.5) / 112.5 * 100 + (117 - 112.5) / 112.5 * 100) / 2, 10);
    expect(g.meanAbsErrorPct).toBeCloseTo(4, 10);
    expect(g.likelyStdDev).toBeCloseTo(6.364, 3);
    expect(g.meanCostUsd).toBeCloseTo(0.03, 10);
    expect(g.meanDurationMs).toBe(9000);
  });
});

describe("notes checks", () => {
  it("flags first person, unsupported measurements, asking the user, and questions", () => {
    const c = checkNotes([
      "I assumed the closet is 2 ft deep.",
      "Assumed the mirrored door is a reach-in closet about 2 ft deep.",
      "Measure the closet depth to tighten the estimate.",
      "Measuring the shorter wall would narrow the range.",
      "A photo from the doorway would help.",
      "Check whether the second door needs flooring.",
      "Is there a closet?",
    ]);
    expect(c.firstPerson).toEqual(["I assumed the closet is 2 ft deep."]);
    expect(c.unsupportedAction).toEqual(["Measure the closet depth to tighten the estimate."]);
    expect(c.asksUser).toEqual(["Check whether the second door needs flooring."]);
    expect(c.questions).toEqual(["Is there a closet?"]);
  });

  // Real notes from the 2026-11-23 eval run.
  it("does NOT flag supported suggestions that merely mention a door", () => {
    const ok = [
      "Measuring the room's longer wall or adding a photo from the doorway would tighten the estimate.",
      "Room length is estimated from the bed and door; measuring the longer wall would tighten the estimate.",
      "The longer dimension is estimated from the bed and door sizes; measuring the longer wall would tighten the result.",
      "Length was estimated from the door and switch sizes because the long wall is not measured.",
      "A wide photo of the full floor from the doorway would help confirm the longer dimension.",
      "Measuring one wall from corner to corner and entering it would tighten this estimate a lot.",
    ];
    const c = checkNotes(ok);
    expect([...c.firstPerson, ...c.unsupportedAction, ...c.asksUser, ...c.questions]).toEqual([]);
  });

  it("DOES flag real violations from v2", () => {
    const c = checkNotes([
      "The mirrored sliding door on the left looks like a closet; its size is assumed and not shown, so measure it if you can.",
      "I did not count the white hinged door in the alcove beside the black bag as a closet; if it opens to a closet, that closet needs to be added.",
      "The other door in photo 2 may be a bathroom or second closet and is not counted; add it if flooring goes there.",
    ]);
    expect(c.unsupportedAction).toHaveLength(3);
    expect(c.firstPerson).toHaveLength(1);
  });
});

describe("CLI", () => {
  function cliDeps(over: Partial<CliDeps> = {}) {
    const lines: string[] = [];
    const createAnalyze = vi.fn<CliDeps["createAnalyze"]>(() => vi.fn<AnalyzeForEval>().mockResolvedValue(analysis()));
    const writeFiles = vi.fn<CliDeps["writeFiles"]>();
    const d: CliDeps = {
      loadRooms: () => [ROOM],
      createAnalyze,
      writeFiles,
      product,
      settings,
      log: (l) => lines.push(l),
      now: () => new Date("2026-11-23T12:00:00Z"),
      exists: () => true,
      ...over,
    };
    return { d, lines, createAnalyze, writeFiles };
  }

  it("--dry-run prints the matrix and estimate, and makes ZERO calls", async () => {
    const { d, lines, createAnalyze, writeFiles } = cliDeps();
    const res = await runEvalCli(
      ["--dry-run", "--prompt", "v2,v3", "--model", "claude-sonnet-5-5,claude-haiku-5-5", "--repeats", "3"],
      d,
    );
    expect(res.exitCode).toBe(0);
    expect(createAnalyze).not.toHaveBeenCalled();
    expect(writeFiles).not.toHaveBeenCalled();
    const text = lines.join("\n");
    expect(text).toMatch(/Eval plan: 24 runs/);
    expect(text).toMatch(/skipped room-a\/known-longest: includes closet/);
    expect(text).toMatch(/claude-sonnet-5-5: 12 runs × ~\$0\.0315 = ~\$0\.3780/);
    expect(text).toMatch(/TOTAL ~\$0\.3969/);
    expect(text).toMatch(/Dry run: no API calls made/);
  });

  it("rejects unknown prompts/models and bad numbers without calling anything", async () => {
    const { d, createAnalyze } = cliDeps();
    expect((await runEvalCli(["--prompt", "v9"], d)).exitCode).toBe(2);
    expect((await runEvalCli(["--model", "gpt-9"], d)).exitCode).toBe(2);
    expect((await runEvalCli(["--repeats", "0"], d)).exitCode).toBe(2);
    expect(createAnalyze).not.toHaveBeenCalled();
  });

  it("--report-only rebuilds report + notes checks from saved results, with ZERO calls", async () => {
    const { d: first, writeFiles: w1 } = cliDeps();
    await runEvalCli(["--conditions", "none"], first);
    const savedJson = JSON.parse(w1.mock.calls[0][1]["results.json"]);
    savedJson.runs[0].notes = ["I assumed the closet is 2 ft deep."];
    savedJson.runs[0].noteChecks = { stale: true };

    const { d, createAnalyze, writeFiles } = cliDeps({ readFile: () => JSON.stringify(savedJson) });
    const res = await runEvalCli(["--report-only", "eval/results/x"], d);
    expect(res.exitCode).toBe(0);
    expect(createAnalyze).not.toHaveBeenCalled();
    const [dir, files] = writeFiles.mock.calls[0];
    expect(dir).toBe("eval/results/x");
    expect(JSON.parse(files["results.json"]).runs[0].noteChecks.firstPerson).toEqual(["I assumed the closet is 2 ft deep."]);
    expect(files["report.md"]).toMatch(/first person \| I assumed the closet/);
  });

  it("refuses a real run when photos are missing", async () => {
    const { d, createAnalyze } = cliDeps({ exists: () => false });
    expect((await runEvalCli([], d)).exitCode).toBe(1);
    expect(createAnalyze).not.toHaveBeenCalled();
  });

  it("a real run writes results.json + report.md (no images) to eval/results/<timestamp>/", async () => {
    const { d, writeFiles } = cliDeps();
    const res = await runEvalCli(["--repeats", "2", "--conditions", "none"], d);
    expect(res.exitCode).toBe(0);
    const [dir, files] = writeFiles.mock.calls[0];
    expect(dir).toBe("eval/results/2026-11-23T12-00-00-000Z");
    expect(Object.keys(files).sort()).toEqual(["report.md", "results.json"]);
    const json = JSON.parse(files["results.json"]);
    expect(json.runs).toHaveLength(2);
    expect(json.groups[0]).toMatchObject({ ok: 2, coverageRate: 1 });
    expect(files["results.json"]).not.toMatch(/base64|"data":/);
    expect(files["report.md"]).toMatch(/# Eval report/);
    expect(files["report.md"]).toMatch(/\| room-a \| none \| v3 \| claude-sonnet-5-5 \| 2\/2/);
  });
});

describe("report", () => {
  it("renders failures, skipped runs and aborts", () => {
    const run = (over: Partial<RunRecord>): RunRecord =>
      ({ index: 1, repeat: 1, roomId: "room-a", conditionId: "none", promptId: "v2", model: "claude-sonnet-5-5", status: "ok", promptVersion: "x", truthAreaSqft: 112.5, score: null, confidence: null, issues: [], notes: [], noteChecks: null, error: null, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: null, totalMs: 0, attempts: null, ...over }) as RunRecord;
    const runs = [run({ status: "failed", error: { code: "timeout", message: "t" } }), run({ index: 2, status: "skipped_cost_cap" })];
    const md = renderReport({
      createdAt: "t",
      config: { prompts: ["v2"], promptVersions: { v2: "x" }, models: ["claude-sonnet-5-5"], repeats: 2, roomIds: ["room-a"], conditionIds: null, maxCostUsd: 1 },
      estimatedCostUsd: 0.06,
      totalCostUsd: 0,
      aborted: true,
      abortReason: "Stopped before run 2",
      rooms: [{ id: "room-a", truth: ROOM.truth }],
      skippedConditions: [],
      groups: aggregate(runs),
      runs,
    });
    expect(md).toMatch(/ABORTED:\*\* Stopped before run 2/);
    expect(md).toMatch(/failed: timeout/);
    expect(md).toMatch(/1 failed · 1 skipped \(cost cap\)/);
  });
});
