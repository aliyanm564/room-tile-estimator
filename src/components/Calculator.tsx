"use client";

import { useMemo, useState, type FocusEvent } from "react";
import { CalcError, estimateRoom } from "@/lib/calc";
import { pricePerSqftToPerSqm } from "@/lib/calc/units";
import {
  PRICE_SOURCE_LABEL,
  formatArea,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRange,
} from "@/lib/format";
import {
  blurLength,
  blurPrice,
  editLength,
  editPrice,
  emptyLength,
  emptyPrice,
  priceDisplayText,
  switchLengthUnits,
  switchPriceUnits,
  type LengthField,
  type LengthPart,
} from "@/lib/measurement-input";
import type { FlooringProduct, Layout, RoomResult, Settings, UnitSystem } from "@/types";
import UnitsToggle from "./UnitsToggle";

interface Props {
  products: FlooringProduct[];
  settings: Settings;
}

const LAYOUT_LABELS: Record<Layout, string> = {
  straight: "Straight",
  diagonal: "Diagonal",
  herringbone: "Herringbone",
};

type Outcome = { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; result: RoomResult };

/** True when focus is moving to somewhere outside this element (not between its own inputs). */
const focusLeft = (e: FocusEvent<HTMLElement>) => !e.currentTarget.contains(e.relatedTarget as Node | null);

export default function Calculator({ products, settings }: Props) {
  const [units, setUnits] = useState<UnitSystem>(settings.defaultUnits);
  const [length, setLength] = useState<LengthField>(emptyLength);
  const [width, setWidth] = useState<LengthField>(emptyLength);
  const [productId, setProductId] = useState(products[0].id);
  const [layout, setLayout] = useState<Layout>("straight");
  const [price, setPrice] = useState(emptyPrice);

  const product = products.find((p) => p.id === productId) ?? products[0];

  // All math reads canonical values (feet, $/sq ft) — never the display text.
  const outcome: Outcome = useMemo(() => {
    if (length.feet === null || width.feet === null) return { kind: "empty" };
    try {
      const result = estimateRoom(
        {
          unit: "ft",
          sections: [{ length: length.feet, width: width.feet }],
          layout,
          productId: product.id,
          priceOverridePerSqft: price.perSqft,
        },
        product,
        settings,
      );
      return { kind: "ok", result };
    } catch (e) {
      if (e instanceof CalcError) return { kind: "error", message: e.message };
      throw e;
    }
  }, [length.feet, width.feet, layout, product, price.perSqft, settings]);

  function switchUnits(next: UnitSystem) {
    if (next === units) return;
    setLength((f) => switchLengthUnits(f, next));
    setWidth((f) => switchLengthUnits(f, next));
    setPrice((f) => switchPriceUnits(f, next));
    setUnits(next);
  }

  const catalogPriceDisplay =
    units === "metric"
      ? `${formatCurrency(pricePerSqftToPerSqm(product.pricePerSqft))} / m²`
      : `${formatCurrency(product.pricePerSqft)} / sq ft`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <UnitsToggle value={units} onChange={switchUnits} />

        <LengthInput
          label="Room length"
          field={length}
          units={units}
          onEdit={(part, text) => setLength((f) => editLength(f, units, part, text))}
          onLeave={() => setLength((f) => blurLength(f, units))}
        />
        <LengthInput
          label="Room width"
          field={width}
          units={units}
          onEdit={(part, text) => setWidth((f) => editLength(f, units, part, text))}
          onLeave={() => setWidth((f) => blurLength(f, units))}
        />

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold">Flooring</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="min-h-12 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-stone-600">
            {formatNumber(product.sqftPerBox, 2)} sq ft per box · {catalogPriceDisplay}
            {!product.verified && " (placeholder)"}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold">Layout</span>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as Layout)}
            className="min-h-12 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300"
          >
            {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => (
              <option key={l} value={l}>
                {LAYOUT_LABELS[l]} — {formatPercent(settings.wasteFactors[l])} extra for cuts
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold">
            Your price <span className="font-normal text-stone-600">(optional)</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-lg text-stone-600">$</span>
            <input
              inputMode="decimal"
              aria-label={units === "metric" ? "Your price per square metre" : "Your price per square foot"}
              placeholder={priceDisplayText(product.pricePerSqft, units)}
              value={price.text}
              onChange={(e) => setPrice(editPrice(units, e.target.value))}
              onBlur={() => setPrice((f) => blurPrice(f, units))}
              className="min-h-12 w-full rounded-xl px-3 text-lg ring-1 ring-stone-300"
            />
            <span className="shrink-0 text-base text-stone-600">
              {units === "metric" ? "per m²" : "per sq ft"}
            </span>
          </div>
          <span className="text-sm text-stone-600">Leave blank to use the catalog price.</span>
        </label>
      </section>

      <Results outcome={outcome} units={units} />
    </div>
  );
}

function LengthInput({
  label,
  field,
  units,
  onEdit,
  onLeave,
}: {
  label: string;
  field: LengthField;
  units: UnitSystem;
  onEdit: (part: LengthPart, text: string) => void;
  onLeave: () => void;
}) {
  const inputClass = "min-h-12 w-full rounded-xl px-3 text-lg ring-1 ring-stone-300";
  const box = (part: LengthPart, unitLabel: string, ariaUnit: string, placeholder: string) => (
    <label className="flex items-center gap-2">
      <input
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
      <legend className="mb-2 text-base font-semibold">{label}</legend>
      {units === "imperial" ? (
        <div className="grid grid-cols-2 gap-2">
          {box("ft", "ft", "feet", "12")}
          {box("in", "in", "inches", "0")}
        </div>
      ) : (
        box("m", "m", "metres", "3.6")
      )}
    </fieldset>
  );
}

function Results({ outcome, units }: { outcome: Outcome; units: UnitSystem }) {
  if (outcome.kind === "empty") {
    return (
      <section className="rounded-2xl bg-stone-100 p-5 text-base text-stone-700">
        Enter the room&apos;s length and width to see how much flooring you need.
      </section>
    );
  }
  if (outcome.kind === "error") {
    return (
      <section role="alert" className="rounded-2xl bg-red-50 p-5 text-base text-red-800 ring-1 ring-red-200">
        {outcome.message}
      </section>
    );
  }

  const r = outcome.result;
  const placeholder = r.priceSource === "placeholder";

  return (
    <section aria-live="polite" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="mb-4 text-lg font-semibold">Estimate</h2>
      <dl className="flex flex-col divide-y divide-stone-200">
        <Row label="Floor area" value={formatArea(r.areaSqft, units)} />
        <Row
          label={`With ${formatPercent(r.wasteFactor)} extra for cuts`}
          value={formatArea(r.sqftNeeded, units)}
        />
        <Row
          label="Boxes to buy"
          value={formatRange(r.boxes)}
          note={`That's ${formatArea(r.purchasedSqft, units)} of flooring`}
          big
        />
        {r.approxPlanks && <Row label="Planks (approx.)" value={`≈ ${formatRange(r.approxPlanks)}`} />}
        <Row
          label="Material cost"
          value={formatRange(r.cost, (n) => formatCurrency(n, r.currency))}
          note={`${formatCurrency(
            units === "metric" ? pricePerSqftToPerSqm(r.pricePerSqft) : r.pricePerSqft,
            r.currency,
          )} ${units === "metric" ? "per m²" : "per sq ft"} · whole boxes`}
          big
        />
      </dl>
      <p
        className={`mt-4 rounded-xl p-3 text-sm ${
          placeholder ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-stone-100 text-stone-700"
        }`}
      >
        <strong>Price:</strong> {PRICE_SOURCE_LABEL[r.priceSource]}
      </p>
      <p className="mt-3 text-sm text-stone-600">
        Budget estimate for flooring material only. Doesn&apos;t include underlay, trim, installation, or tax.
      </p>
    </section>
  );
}

function Row({ label, value, note, big }: { label: string; value: string; note?: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-base text-stone-700">
        {label}
        {note && <span className="block text-sm text-stone-500">{note}</span>}
      </dt>
      <dd className={`shrink-0 text-right font-semibold tabular-nums ${big ? "text-2xl" : "text-lg"}`}>{value}</dd>
    </div>
  );
}
