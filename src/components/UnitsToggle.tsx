"use client";

import { useRef, type KeyboardEvent } from "react";
import type { UnitSystem } from "@/types";

const OPTIONS: { value: UnitSystem; label: string; hint: string }[] = [
  { value: "imperial", label: "Imperial", hint: "ft · in" },
  { value: "metric", label: "Metric", hint: "m" },
];

/**
 * Two-option segmented control. Semantics: a radio group (one tab stop, arrow keys move the
 * selection). Each segment is ≥ 56px tall and half the width, so it's an easy thumb target.
 */
export default function UnitsToggle({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (u: UnitSystem) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = OPTIONS.findIndex((o) => o.value === value);
    const next = (i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <span id="units-label" className="mb-2 block text-base font-semibold">
        Units
      </span>
      <div
        role="radiogroup"
        aria-labelledby="units-label"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200 p-1"
      >
        {OPTIONS.map((o, i) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`flex min-h-14 touch-manipulation select-none flex-col items-center justify-center rounded-xl px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                selected
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-700 active:bg-stone-300"
              }`}
            >
              <span className="text-base font-semibold leading-tight">{o.label}</span>
              <span className={`text-sm leading-tight ${selected ? "text-stone-300" : "text-stone-500"}`}>
                {o.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
