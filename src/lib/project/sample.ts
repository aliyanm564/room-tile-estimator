// Demo sample project: 3 rooms with saved (synthetic) analyses. No photos, no API call, works offline.
// The analyses are invented for the demo; they don't describe a real home.

import type { RoomAnalysis } from "@/lib/ai/schema";
import type { UnitSystem } from "@/types";
import { lastResultOf, newId, newRoom, roomOutcome, type StoredProject, type StoredRoom } from "./model";
import type { FlooringProduct, Settings } from "@/types";

const r = (low: number, likely: number, high: number) => ({ low, likely, high });

function sampleAnalysis(over: Partial<RoomAnalysis>): RoomAnalysis {
  return {
    usable: true,
    issues: [],
    roomType: "room",
    shape: "rectangle",
    sections: [],
    obstacles: [],
    scaleReferences: [],
    confidence: "medium",
    confidenceReason: "",
    existingFloor: "unknown",
    notes: [],
    photos: [],
    meta: {
      model: "claude-sonnet-5-5",
      promptId: "v3",
      promptVersion: "sample",
      knownMeasurement: null,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      attempts: 1,
    },
    ...over,
  };
}

export const SAMPLE_PROJECT_NAME = "Sample: 24 Maple Street";

export function createSampleProject(
  products: FlooringProduct[],
  settings: Settings,
  units: UnitSystem = "imperial",
  idFn: () => string = newId,
): StoredProject {
  const productId = (preferred: string) => (products.some((p) => p.id === preferred) ? preferred : products[0].id);
  const t = new Date().toISOString();

  // 1. One wall measured, photos analyzed with it as a ruler; the AI found a closet.
  const bedroom: StoredRoom = {
    ...newRoom("Main bedroom", { productId: productId("eng-oak-7") }, idFn()),
    walls: { longerFt: null, shorterFt: 10.5 },
    analysisPhotoCount: 3,
    analysis: sampleAnalysis({
      roomType: "bedroom",
      sections: [
        { label: "main", lengthFt: r(12.5, 13.5, 14.5), widthFt: r(10.5, 10.5, 10.5), knownMeasurementAppliedTo: "width" },
        { label: "closet", lengthFt: r(5, 6, 7), widthFt: r(2, 2, 2.5), knownMeasurementAppliedTo: null },
      ],
      scaleReferences: [
        { object: "interior door", assumedSize: "80 in tall", photoIndex: 2 },
        { object: "electrical outlet", assumedSize: "about 14 in above the floor", photoIndex: 1 },
      ],
      confidence: "medium",
      confidenceReason: "The measured wall and a clear door give good scale; furniture hides part of the far wall.",
      existingFloor: "beige carpet",
      notes: [
        "Assumed the sliding-door closet is about 2 ft deep.",
        "Adding a photo from the opposite corner would tighten the length estimate.",
      ],
      meta: { ...sampleAnalysis({}).meta, knownMeasurement: { valueFt: 10.5, which: "shortest" } },
    }),
  };

  // 2. Both walls measured + a closet added by hand: fully measured, no AI involved.
  const living: StoredRoom = {
    ...newRoom("Living room", { productId: productId("eng-oak-5") }, idFn()),
    walls: { longerFt: 16, shorterFt: 13.5 },
    areaEdits: { ai: {}, manualClosets: [{ id: idFn(), label: "Coat closet", widthFt: 3, depthFt: 2 }] },
  };

  // 3. Photos only (no measurement), with a kitchen island subtracted.
  const kitchen: StoredRoom = {
    ...newRoom("Kitchen", { productId: productId("solid-maple-5"), layout: "diagonal" }, idFn()),
    analysisPhotoCount: 4,
    analysis: sampleAnalysis({
      roomType: "kitchen",
      sections: [{ label: "main", lengthFt: r(11, 12.5, 14), widthFt: r(9.5, 10.5, 11.5), knownMeasurementAppliedTo: null }],
      obstacles: [{ label: "kitchen island", lengthFt: r(5, 6, 7), widthFt: r(2.5, 3, 3.5) }],
      scaleReferences: [
        { object: "countertop", assumedSize: "36 in high", photoIndex: 1 },
        { object: "base cabinets", assumedSize: "24 in deep", photoIndex: 3 },
      ],
      confidence: "low",
      confidenceReason: "No wall was measured, so the size relies on the countertops and cabinets for scale.",
      existingFloor: "vinyl",
      notes: ["Measuring the room's longer wall would make this estimate much more accurate."],
    }),
  };

  const rooms = [bedroom, living, kitchen].map((room) => ({ ...room, lastResult: lastResultOf(roomOutcome(room, products, settings)) }));
  return { id: idFn(), name: SAMPLE_PROJECT_NAME, createdAt: t, updatedAt: t, units, rooms };
}
