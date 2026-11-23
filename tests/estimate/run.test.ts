import { describe, expect, it, vi } from "vitest";
import type { RoomAnalysis } from "@/lib/ai/schema";
import { createEstimateRunner, decideAction, type AnalyzeFn } from "@/lib/estimate/run";

const fakeAnalysis = { usable: true } as RoomAnalysis;

describe("decideAction", () => {
  it("both walls → calculate (no AI), even with photos", () => {
    expect(decideAction({ longerFt: 12, shorterFt: 9 }, 0)).toBe("calculate");
    expect(decideAction({ longerFt: 12, shorterFt: 9 }, 6)).toBe("calculate");
  });
  it("a wall missing → analyze with photos, otherwise needs photos", () => {
    expect(decideAction({ longerFt: 12, shorterFt: null }, 2)).toBe("analyze");
    expect(decideAction({ longerFt: null, shorterFt: null }, 1)).toBe("analyze");
    expect(decideAction({ longerFt: null, shorterFt: 9 }, 0)).toBe("needs_photos");
  });
});

describe("createEstimateRunner", () => {
  it("both walls measured → the provider is NEVER called", async () => {
    const analyze = vi.fn<AnalyzeFn<string>>();
    const run = createEstimateRunner(analyze);
    const res = await run({ walls: { longerFt: 12.47, shorterFt: 9.02 }, photos: ["a.jpg", "b.jpg"] });
    expect(res).toEqual({ action: "calculate", analysis: null });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("one wall → called once with it as the known measurement", async () => {
    const analyze = vi.fn<AnalyzeFn<string>>().mockResolvedValue(fakeAnalysis);
    const run = createEstimateRunner(analyze);
    await run({ walls: { longerFt: 12.47, shorterFt: null }, photos: ["a.jpg"] });
    await run({ walls: { longerFt: null, shorterFt: 9.02 }, photos: ["a.jpg"] });
    await run({ walls: { longerFt: null, shorterFt: null }, photos: ["a.jpg"] });
    expect(analyze.mock.calls.map((c) => c[1])).toEqual([
      { valueFt: 12.47, which: "longest" },
      { valueFt: 9.02, which: "shortest" },
      undefined,
    ]);
  });

  it("double submit while in flight → only ONE provider call", async () => {
    let resolve!: (a: RoomAnalysis) => void;
    const analyze = vi.fn<AnalyzeFn<string>>().mockReturnValue(new Promise((r) => (resolve = r)));
    const run = createEstimateRunner(analyze);
    const input = { walls: { longerFt: null, shorterFt: null }, photos: ["a.jpg"] };
    const p1 = run(input);
    const p2 = run(input);
    const p3 = run(input);
    resolve(fakeAnalysis);
    expect(await Promise.all([p1, p2, p3])).toEqual(Array(3).fill({ action: "analyze", analysis: fakeAnalysis }));
    expect(analyze).toHaveBeenCalledTimes(1);
    await run(input); // after it finishes, a new call is allowed
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("a failed call releases the lock so the user can retry", async () => {
    const analyze = vi.fn<AnalyzeFn<string>>().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce(fakeAnalysis);
    const run = createEstimateRunner(analyze);
    const input = { walls: { longerFt: null, shorterFt: null }, photos: ["a.jpg"] };
    await expect(run(input)).rejects.toThrow("busy");
    await expect(run(input)).resolves.toMatchObject({ analysis: fakeAnalysis });
  });
});
