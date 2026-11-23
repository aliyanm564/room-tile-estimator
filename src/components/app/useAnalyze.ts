"use client";

import { useState } from "react";
import { EstimateApiError, requestAnalysis } from "@/lib/estimate/api-client";
import type { Walls } from "@/lib/estimate/merge";
import { createEstimateRunner } from "@/lib/estimate/run";
import type { PreparedPhoto } from "@/lib/images/shrink-client";
import { setRoomAnalysis } from "@/lib/project/model";
import { orderedPhotos, type PhotoEntry } from "@/lib/project/photos";
import { projectStore } from "@/lib/project/store";

export type AnalyzePhase = "idle" | "preparing" | "uploading" | "analyzing";

/** Photos → (shrunk) upload with progress → AI analysis saved to the room. One call at a time. */
export function useAnalyze(projectId: string, roomId: string) {
  const [phase, setPhase] = useState<AnalyzePhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // One runner per screen: a second tap while a call is in flight shares it (each call costs money).
  const [run] = useState(() =>
    createEstimateRunner<PreparedPhoto>((photos, km) =>
      requestAnalysis(photos, km, {
        onUploadProgress: (f) => {
          setProgress(f);
          if (f >= 1) setPhase("analyzing");
        },
      }),
    ),
  );

  async function analyze(walls: Walls, entries: PhotoEntry[]): Promise<boolean> {
    if (phase !== "idle") return false;
    setError(null);
    setPhase("preparing");
    try {
      const prepared = await Promise.all(orderedPhotos(entries).map((e) => e.prepared));
      setProgress(0);
      setPhase("uploading");
      const res = await run({ walls, photos: prepared });
      if (!res.analysis) return false;
      projectStore.update((d) => setRoomAnalysis(d, projectId, roomId, res.analysis!, prepared.length));
      projectStore.updateRoom(projectId, roomId, {}); // refresh the saved result snapshot
      return true;
    } catch (e) {
      setError(e instanceof EstimateApiError ? e.message : "Something went wrong. Please try again.");
      return false;
    } finally {
      setPhase("idle");
    }
  }

  return { analyze, phase, progress, error, busy: phase !== "idle", clearError: () => setError(null) };
}
