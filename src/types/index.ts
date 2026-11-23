// Shared domain types. Calc code works internally in feet / square feet.

/**
 * An exact measurement, or an uncertain one: a low/high range with an optional best guess
 * ("likely"). Without likely, the midpoint is used.
 */
export type Dimension = number | { low: number; high: number; likely?: number };

/** A range. For exact inputs, low === likely === high. */
export interface Range {
  low: number;
  high: number;
  /** Best estimate, low ≤ likely ≤ high. Optional on input; always set on calc results. */
  likely?: number;
}

/** A range as returned by the calculator: likely is always present. Headline numbers use likely. */
export interface ResultRange extends Range {
  likely: number;
}

export type LengthUnit = "ft" | "in" | "m";
export type UnitSystem = "imperial" | "metric";
export type Layout = "straight" | "diagonal" | "herringbone";

/** A rectangle: a room section, or an obstacle (island, built-in) to subtract. */
export interface Rect {
  length: Dimension;
  width: Dimension;
}

export interface RoomInput {
  /** Unit the section/obstacle dimensions are given in. */
  unit: LengthUnit;
  /** One or more rectangular sections, summed (an L-shaped room = 2 sections). */
  sections: Rect[];
  /** Areas with no flooring (kitchen island, built-ins). */
  obstacles?: Rect[];
  layout: Layout;
  productId: string;
  /** User-entered price per sq ft. Replaces the catalog price when set. */
  priceOverridePerSqft?: number | null;
}

/** Where the price used in a result came from. */
export type PriceSource =
  | "user" // entered by the user
  | "catalog" // verified catalog price
  | "placeholder"; // unverified / placeholder catalog price — don't rely on it

export interface RoomResult {
  productId: string;
  /** True if any input dimension was a range (low and high differ). */
  isRange: boolean;
  grossAreaSqft: ResultRange;
  obstacleAreaSqft: ResultRange;
  /** Floor area to cover (sections minus obstacles). */
  areaSqft: ResultRange;
  wasteFactor: number;
  /** areaSqft × (1 + waste). */
  sqftNeeded: ResultRange;
  boxes: ResultRange;
  /** boxes × sqftPerBox — what you actually buy. */
  purchasedSqft: ResultRange;
  /** Approximate plank count; null when the product ships in random lengths. */
  approxPlanks: ResultRange | null;
  pricePerSqft: number;
  priceSource: PriceSource;
  cost: ResultRange;
  currency: "CAD";
}

export interface FlooringProduct {
  id: string;
  name: string;
  category: "hardwood";
  construction: "solid" | "engineered";
  plankWidthIn: number;
  /** Null when randomLengths is true and no nominal length is given. */
  plankLengthIn: number | null;
  randomLengths: boolean;
  sqftPerBox: number;
  pricePerSqft: number;
  currency: "CAD";
  source: "Home Depot" | "Rona" | "placeholder";
  sourceUrl: string | null;
  /** ISO date (YYYY-MM-DD) the price was last checked. */
  lastChecked: string | null;
  verified: boolean;
}

export interface Settings {
  wasteFactors: Record<Layout, number>;
  defaultUnits: UnitSystem;
}

// ---- Later phases (types only; no UI yet) ----

/** Placeholder for a room photo (Phase 2+). Stored client-side. */
export interface RoomPhoto {
  id: string;
  /** Which guided-checklist shot this is, e.g. "corner-1". */
  shot?: string;
  /** Data URL or object URL; storage strategy decided in Phase 5. */
  src: string;
  takenAt?: string;
}

export interface Room {
  id: string;
  name: string;
  photos: RoomPhoto[]; // up to 6
  /** Optional known wall measurement used as a scale reference. */
  knownWall?: { lengthFt: number; label?: string } | null;
  input: RoomInput | null;
  result: RoomResult | null;
}

export interface Project {
  id: string;
  name: string;
  unitSystem: UnitSystem;
  rooms: Room[];
  createdAt: string;
  updatedAt: string;
}
