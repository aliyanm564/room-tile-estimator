"use client";

import type { FocusEvent, Ref } from "react";
import type { LengthField, LengthPart } from "@/lib/measurement-input";
import type { UnitSystem } from "@/types";

/** True when focus is moving to somewhere outside this element (not between its own inputs). */
const focusLeft = (e: FocusEvent<HTMLElement>) => !e.currentTarget.contains(e.relatedTarget as Node | null);

/** A length in ft + in (imperial) or m (metric). Text is kept exactly as typed. */
export default function LengthInput({
  label,
  optional,
  field,
  units,
  onEdit,
  onLeave,
  inputRef,
}: {
  label: string;
  optional?: boolean;
  field: LengthField;
  units: UnitSystem;
  onEdit: (part: LengthPart, text: string) => void;
  onLeave: () => void;
  /** Ref to the first box, so "Edit" buttons can focus it. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const inputClass = "min-h-12 w-full rounded-xl px-3 text-lg ring-1 ring-stone-300";
  const box = (part: LengthPart, unitLabel: string, ariaUnit: string, placeholder: string, first: boolean) => (
    <label className="flex items-center gap-2">
      <input
        ref={first ? inputRef : undefined}
        inputMode="decimal"
        aria-label={`${label} ${ariaUnit}`}
        placeholder={placeholder}
        value={field.text[part]}
        onChange={(e) => onEdit(part, e.target.value)}
        className={inputClass}
      />
      <span className="text-base text-stone-600">{unitLabel}</span>
    </label>
  );

  return (
    // Tidy the display only when focus leaves the whole group, not when moving ft → in.
    <fieldset onBlur={(e) => focusLeft(e) && onLeave()}>
      <legend className="mb-2 text-base font-semibold">
        {label} {optional && <span className="font-normal text-stone-600">(optional)</span>}
      </legend>
      {units === "imperial" ? (
        <div className="grid grid-cols-2 gap-2">
          {box("ft", "ft", "feet", "", true)}
          {box("in", "in", "inches", "", false)}
        </div>
      ) : (
        box("m", "m", "metres", "", true)
      )}
    </fieldset>
  );
}
