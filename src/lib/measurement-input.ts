// Form state for measurement + price inputs. Pure (no React) so it can be unit-tested.
//
// Rules:
// - Each field holds ONE canonical value at full precision: feet for lengths, CAD per sq ft for
//   price. All math reads the canonical value, never the text.
// - While the user types, the text is kept exactly as typed (no rounding / reformatting, so no
//   cursor jumps). The canonical value is re-derived from the typed text on every keystroke.
// - The text is only rewritten from the canonical value when the units are switched or the field
//   loses focus. Rewriting rounds for display only; the canonical value is untouched, so toggling
//   units back and forth never changes results.

import type { UnitSystem } from "@/types";
import {
  INCHES_PER_FOOT,
  feetAndInchesToFeet,
  feetToMeters,
  metersToFeet,
  pricePerSqftToPerSqm,
  pricePerSqmToPerSqft,
} from "./calc/units";

/** Canonical value: null = nothing entered; NaN = unparseable (calc reports it as an error). */
export type Canonical = number | null;

export type LengthPart = "ft" | "in" | "m";

export interface LengthField {
  /** Canonical length in feet, full precision. */
  feet: Canonical;
  /** Text shown in each box. Only the boxes for the active unit system are visible. */
  text: Record<LengthPart, string>;
}

export interface PriceField {
  /** Canonical price, CAD per sq ft, full precision. */
  perSqft: Canonical;
  text: string;
}

const DISPLAY_DECIMALS = { m: 2, in: 1, price: 2 } as const;

/** Parse one text box. "" → null; garbage → NaN. Accepts a comma as the decimal separator. */
export function parseNumberText(s: string): Canonical {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number(t);
}

/** Round for display and drop trailing zeros: 3.6576 → "3.66", 12.50 → "12.5". */
export function displayNumber(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)));
}

const isUsable = (v: Canonical): v is number => v !== null && Number.isFinite(v);

// ---------- lengths ----------

export const emptyLength = (): LengthField => ({ feet: null, text: { ft: "", in: "", m: "" } });

/** Canonical feet from the typed text of the active unit system. */
function feetFromText(text: LengthField["text"], units: UnitSystem): Canonical {
  if (units === "metric") {
    const m = parseNumberText(text.m);
    return m === null ? null : metersToFeet(m);
  }
  const ft = parseNumberText(text.ft);
  const inches = parseNumberText(text.in);
  if (ft === null && inches === null) return null;
  return feetAndInchesToFeet(ft ?? 0, inches ?? 0);
}

/** Display text for a canonical length in the given unit system (rounded for display only). */
export function lengthDisplayText(feet: Canonical, units: UnitSystem): LengthField["text"] {
  const blank = { ft: "", in: "", m: "" };
  if (!isUsable(feet)) return blank;
  if (units === "metric") {
    return { ...blank, m: displayNumber(feetToMeters(feet), DISPLAY_DECIMALS.m) };
  }
  // Round the inches first, then carry 12" into the next foot (e.g. 11.96" → 1 ft 0 in).
  const totalInches = Number((feet * INCHES_PER_FOOT).toFixed(DISPLAY_DECIMALS.in));
  const wholeFeet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Number((totalInches - wholeFeet * INCHES_PER_FOOT).toFixed(DISPLAY_DECIMALS.in));
  return { ...blank, ft: String(wholeFeet), in: inches === 0 ? "" : String(inches) };
}

/** A keystroke: keep the text exactly as typed; re-derive the canonical value from it. */
export function editLength(
  field: LengthField,
  units: UnitSystem,
  part: LengthPart,
  typed: string,
): LengthField {
  const text = { ...field.text, [part]: typed };
  return { feet: feetFromText(text, units), text };
}

/** Units switched: canonical value unchanged; text re-rendered in the new units. */
export function switchLengthUnits(field: LengthField, to: UnitSystem): LengthField {
  // Unparseable input can't be converted; clear it rather than carry garbage across.
  if (field.feet !== null && !Number.isFinite(field.feet)) return emptyLength();
  return { feet: field.feet, text: lengthDisplayText(field.feet, to) };
}

/** Focus left the field: tidy the display (e.g. 12.5 ft → 12 ft 6 in). Canonical unchanged. */
export function blurLength(field: LengthField, units: UnitSystem): LengthField {
  if (!isUsable(field.feet)) return field; // keep empty / invalid text so the user can fix it
  return { feet: field.feet, text: lengthDisplayText(field.feet, units) };
}

// ---------- price ----------

export const emptyPrice = (): PriceField => ({ perSqft: null, text: "" });

/** Display text for a canonical price: per sq ft (imperial) or per m² (metric). */
export function priceDisplayText(perSqft: Canonical, units: UnitSystem): string {
  if (!isUsable(perSqft)) return "";
  const shown = units === "metric" ? pricePerSqftToPerSqm(perSqft) : perSqft;
  return displayNumber(shown, DISPLAY_DECIMALS.price);
}

export function editPrice(units: UnitSystem, typed: string): PriceField {
  const v = parseNumberText(typed);
  const perSqft = v === null ? null : units === "metric" ? pricePerSqmToPerSqft(v) : v;
  return { perSqft, text: typed };
}

export function switchPriceUnits(field: PriceField, to: UnitSystem): PriceField {
  if (field.perSqft !== null && !Number.isFinite(field.perSqft)) return emptyPrice();
  return { perSqft: field.perSqft, text: priceDisplayText(field.perSqft, to) };
}

export function blurPrice(field: PriceField, units: UnitSystem): PriceField {
  if (!isUsable(field.perSqft)) return field;
  return { perSqft: field.perSqft, text: priceDisplayText(field.perSqft, units) };
}
