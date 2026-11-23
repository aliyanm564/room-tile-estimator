// Decide whether an estimate needs an AI call, and make sure we never make two at once.
// The analyze function is injected (the browser passes a fetch wrapper; tests pass a spy).

import type { KnownMeasurement, RoomAnalysis } from "@/lib/ai/schema";
import { knownMeasurementFromWalls, type Walls } from "./merge";

export type EstimateAction =
  | "calculate" // both walls measured: calculate locally, never call the AI
  | "analyze" // photos present and at least one wall missing
  | "needs_photos"; // at least one wall missing and no photos

export function decideAction(walls: Walls, photoCount: number): EstimateAction {
  if (walls.longerFt !== null && walls.shorterFt !== null) return "calculate";
  return photoCount > 0 ? "analyze" : "needs_photos";
}

export type AnalyzeFn<P> = (photos: P[], knownMeasurement?: KnownMeasurement) => Promise<RoomAnalysis>;

export interface RunResult {
  action: EstimateAction;
  /** The new analysis when action is "analyze"; otherwise null (nothing was called). */
  analysis: RoomAnalysis | null;
}

/**
 * Returns a `run` function. While an analysis is in flight, further calls return the SAME promise
 * instead of starting another (each call costs money).
 */
export function createEstimateRunner<P>(analyze: AnalyzeFn<P>) {
  let inFlight: Promise<RunResult> | null = null;
  return function run(input: { walls: Walls; photos: P[] }): Promise<RunResult> {
    if (inFlight) return inFlight;
    const action = decideAction(input.walls, input.photos.length);
    if (action !== "analyze") return Promise.resolve({ action, analysis: null });
    inFlight = analyze(input.photos, knownMeasurementFromWalls(input.walls))
      .then((analysis) => ({ action, analysis }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
