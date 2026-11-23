import type { Dimension, LengthUnit } from "@/types";

export const METERS_PER_FOOT = 0.3048; // exact by definition
export const INCHES_PER_FOOT = 12;
export const SQM_PER_SQFT = METERS_PER_FOOT * METERS_PER_FOOT; // 0.09290304

export const inchesToFeet = (inches: number): number => inches / INCHES_PER_FOOT;
export const feetToInches = (feet: number): number => feet * INCHES_PER_FOOT;
export const metersToFeet = (m: number): number => m / METERS_PER_FOOT;
export const feetToMeters = (ft: number): number => ft * METERS_PER_FOOT;

/** Feet + inches (e.g. 12' 6") to decimal feet. */
export const feetAndInchesToFeet = (feet: number, inches = 0): number =>
  feet + inchesToFeet(inches);

export const sqftToSqm = (sqft: number): number => sqft * SQM_PER_SQFT;
export const sqmToSqft = (sqm: number): number => sqm / SQM_PER_SQFT;

/** Price per m² → price per sq ft (and back). */
export const pricePerSqmToPerSqft = (p: number): number => p * SQM_PER_SQFT;
export const pricePerSqftToPerSqm = (p: number): number => p / SQM_PER_SQFT;

export function toFeet(value: number, unit: LengthUnit): number {
  switch (unit) {
    case "ft":
      return value;
    case "in":
      return inchesToFeet(value);
    case "m":
      return metersToFeet(value);
  }
}

/** Convert a Dimension (exact or range, with or without likely) to feet, preserving its shape. */
export function dimensionToFeet(d: Dimension, unit: LengthUnit): Dimension {
  if (typeof d === "number") return toFeet(d, unit);
  const out: Dimension = { low: toFeet(d.low, unit), high: toFeet(d.high, unit) };
  if (d.likely !== undefined) out.likely = toFeet(d.likely, unit);
  return out;
}
