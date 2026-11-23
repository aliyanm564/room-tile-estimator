"use client";

import { useState } from "react";
import type { AreaEdits, AreaItem, AreaSize } from "@/lib/estimate/merge";
import { formatAreaValue, formatLength } from "@/lib/format";
import { blurLength, editLength, lengthDisplayText, type LengthField } from "@/lib/measurement-input";
import { newId } from "@/lib/project/model";
import { selectAllOnFocus } from "@/lib/select-on-focus";
import type { UnitSystem } from "@/types";
import LengthInput from "../LengthInput";
import { PrimaryButton, SecondaryButton, SourceBadge } from "./ui";

const fieldFrom = (ft: number | null, units: UnitSystem): LengthField =>
  ft === null ? { feet: null, text: { ft: "", in: "", m: "" } } : { feet: ft, text: lengthDisplayText(ft, units) };

function SizeForm({
  units,
  initial,
  withLabel,
  submitLabel,
  onSave,
  onCancel,
}: {
  units: UnitSystem;
  initial: { label?: string; widthFt: number | null; depthFt: number | null };
  withLabel?: boolean;
  submitLabel: string;
  onSave: (size: AreaSize, label: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial.label ?? "Closet");
  const [width, setWidth] = useState(fieldFrom(initial.widthFt, units));
  const [depth, setDepth] = useState(fieldFrom(initial.depthFt, units));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const ok = (f: LengthField) => f.feet !== null && Number.isFinite(f.feet) && f.feet > 0;
    if (!ok(width) || !ok(depth)) return setError("Enter a width and a depth greater than zero.");
    onSave({ widthFt: width.feet!, depthFt: depth.feet! }, label.trim() || "Closet");
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {withLabel && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Name</span>
          <input aria-label="Closet name" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} {...selectAllOnFocus} className="min-h-12 rounded-xl px-3 text-lg ring-1 ring-stone-300" />
        </label>
      )}
      <LengthInput selectOnFocus label="Width (along the wall)" field={width} units={units} onEdit={(p, t) => setWidth((f) => editLength(f, units, p, t))} onLeave={() => setWidth((f) => blurLength(f, units))} />
      <LengthInput selectOnFocus label="Depth" field={depth} units={units} onEdit={(p, t) => setDepth((f) => editLength(f, units, p, t))} onLeave={() => setDepth((f) => blurLength(f, units))} />
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit">{submitLabel}</PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </form>
  );
}

/**
 * Closets / extra areas / built-ins found in the photos, plus closets added by hand. Edited and manual
 * sizes are exact and override the AI (shown as "measured").
 */
export default function AreaItemsEditor({
  items,
  edits,
  units,
  onChange,
}: {
  items: AreaItem[];
  edits: AreaEdits;
  units: UnitSystem;
  onChange: (edits: AreaEdits) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const active = items.filter((i) => !i.removed);
  const removed = items.filter((i) => i.removed);
  const size = (i: AreaItem) => `${formatLength(i.widthFt.likely, units)} × ${formatLength(i.depthFt.likely, units)}`;

  const withAi = (key: string, value: AreaEdits["ai"][string] | null): AreaEdits => {
    const ai = { ...edits.ai };
    if (value === null) delete ai[key];
    else ai[key] = value;
    return { ...edits, ai };
  };
  const manualId = (key: string) => key.slice("manual:".length);

  function save(item: AreaItem, s: AreaSize, label: string) {
    if (item.origin === "manual") {
      onChange({ ...edits, manualClosets: edits.manualClosets.map((m) => (m.id === manualId(item.key) ? { ...m, ...s, label } : m)) });
    } else {
      onChange(withAi(item.key, s));
    }
    setEditing(null);
  }

  function remove(item: AreaItem) {
    if (item.origin === "manual") onChange({ ...edits, manualClosets: edits.manualClosets.filter((m) => m.id !== manualId(item.key)) });
    else onChange(withAi(item.key, { removed: true }));
  }

  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 && !adding && (
        <p className="text-sm text-stone-600">None yet. Closets found in your photos appear here, or add one yourself.</p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Closets and built-ins">
        {active.map((item) => (
          <li key={item.key} className="rounded-xl ring-1 ring-stone-200">
            {editing === item.key ? (
              <SizeForm
                units={units}
                initial={{ label: item.label, widthFt: item.widthFt.likely, depthFt: item.depthFt.likely }}
                withLabel={item.origin === "manual"}
                submitLabel="Save size"
                onSave={(s, label) => save(item, s, label)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {item.label} <SourceBadge source={item.source} />
                    {item.kind === "obstacle" && <span className="ml-1 text-xs text-stone-600">(subtracted)</span>}
                  </p>
                  <p className="text-sm text-stone-600 tabular-nums">
                    {item.source === "estimated" ? "about " : ""}
                    {size(item)} · {item.kind === "obstacle" ? "−" : ""}
                    {formatAreaValue(item.areaSqft.likely, units)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(item.key)} aria-label={`Edit ${item.label}`} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-sky-800 ring-1 ring-sky-300 active:bg-sky-50">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item.label}`} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-800 ring-1 ring-red-300 active:bg-red-50">
                    Remove
                  </button>
                  {item.origin === "ai" && edits.ai[item.key] && (
                    <button type="button" onClick={() => onChange(withAi(item.key, null))} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300">
                      Use estimate
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {removed.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-stone-600" aria-label="Removed">
          {removed.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2">
              <span>
                Removed: {item.label} ({size(item)})
              </span>
              <button type="button" onClick={() => onChange(withAi(item.key, null))} className="min-h-11 rounded-lg px-3 font-semibold text-sky-800">
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <SizeForm
          units={units}
          initial={{ label: "Closet", widthFt: null, depthFt: null }}
          withLabel
          submitLabel="Add closet"
          onSave={(s, label) => {
            onChange({ ...edits, manualClosets: [...edits.manualClosets, { id: newId(), label, ...s }] });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <SecondaryButton onClick={() => setAdding(true)}>+ Add closet</SecondaryButton>
      )}
    </div>
  );
}
