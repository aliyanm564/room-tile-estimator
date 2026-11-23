import type { LengthUnit, Range, Rect } from "@/types";
import { CalcError } from "./errors";
import { multiplyRanges, subtractRanges, sumRanges, toRange } from "./range";
import { dimensionToFeet } from "./units";

/** Area of one rectangle in sq ft. */
export function rectAreaSqft(rect: Rect, unit: LengthUnit, label = "Section"): Range {
  const length = toRange(dimensionToFeet(rect.length, unit), `${label} length`);
  const width = toRange(dimensionToFeet(rect.width, unit), `${label} width`);
  return multiplyRanges(length, width);
}

export interface RoomArea {
  gross: Range;
  obstacles: Range;
  net: Range;
}

/**
 * Room floor area: sum of rectangular sections minus obstacle rectangles.
 * Rejects obstacles that cover the whole room (even in the worst case of a range).
 */
export function roomAreaSqft(
  sections: Rect[],
  obstacles: Rect[] = [],
  unit: LengthUnit,
): RoomArea {
  if (sections.length === 0) {
    throw new CalcError("Add at least one room section.");
  }
  const gross = sumRanges(
    sections.map((s, i) => rectAreaSqft(s, unit, sections.length > 1 ? `Section ${i + 1}` : "Room")),
  );
  const obs = sumRanges(obstacles.map((o, i) => rectAreaSqft(o, unit, `Obstacle ${i + 1}`)));
  const net = subtractRanges(gross, obs);
  if (net.low <= 0) {
    throw new CalcError("The obstacles are as big as (or bigger than) the room. Check the measurements.");
  }
  return { gross, obstacles: obs, net };
}
