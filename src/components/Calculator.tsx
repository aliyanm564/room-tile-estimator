"use client";

import { useMemo, useState } from "react";
import { CalcError, estimateRoom } from "@/lib/calc";
import {
  feetAndInchesToFeet,
  feetToMeters,
  metersToFeet,
  pricePerSqftToPerSqm,
  pricePerSqmToPerSqft,
} from "@/lib/calc/units";
import {
  PRICE_SOURCE_LABEL,
  formatArea,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRange,
} from "@/lib/format";
import type { FlooringProduct, Layout, RoomResult, Settings, UnitSystem } from "@/types";

interface Props {
  products: FlooringProduct[];
  settings: Settings;
}

/** A length typed by the user: feet + inches (imperial) or metres (metric). */
interface LengthField {
  ft: string;
  in: string;
  m: string;
}

const emptyLength: LengthField = { ft: "", in: "", m: "" };

const LAYOUT_LABELS: Record<Layout, string> = {
  straight: "Straight",
  diagonal: "Diagonal",
  herringbone: "Herringbone",
};

/** Parse a number field. Empty → undefined; garbage → NaN (caught by calc validation). */
function parseField(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  return t === "" ? undefined : Number(t);
}

/** Field → feet. Returns undefined if nothing entered yet. */
function lengthToFeet(f: LengthField, units: UnitSystem): number | undefined {
  if (units === "metric") {
    const m = parseField(f.m);
    return m === undefined ? undefined : metersToFeet(m);
  }
  const ft = parseField(f.ft);
  const inches = parseField(f.in);
  if (ft === undefined && inches === undefined) return undefined;
  return feetAndInchesToFeet(ft ?? 0, inches ?? 0);
}

/** Re-express a field in the other unit system so toggling keeps the same room size. */
function convertField(f: LengthField, from: UnitSystem): LengthField {
  const feet = lengthToFeet(f, from);
  if (feet === undefined || !Number.isFinite(feet)) return emptyLength;
  if (from === "imperial") {
    return { ...emptyLength, m: String(Number(feetToMeters(feet).toFixed(2))) };
  }
  const whole = Math.floor(feet);
  const inches = Number(((feet - whole) * 12).toFixed(1));
  return { ...emptyLength, ft: String(whole), in: inches ? String(inches) : "" };
}

type Outcome = { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; result: RoomResult };

export default function Calculator({ products, settings }: Props) {
  const [units, setUnits] = useState<UnitSystem>(settings.defaultUnits);
  const [length, setLength] = useState<LengthField>(emptyLength);
  const [width, setWidth] = useState<LengthField>(emptyLength);
  const [productId, setProductId] = useState(products[0].id);
  const [layout, setLayout] = useState<Layout>("straight");
  const [priceOverride, setPriceOverride] = useState("");

  const product = products.find((p) => p.id === productId) ?? products[0];

  const outcome: Outcome = useMemo(() => {
    const lengthFt = lengthToFeet(length, units);
    const widthFt = lengthToFeet(width, units);
    if (lengthFt === undefined || widthFt === undefined) return { kind: "empty" };

    const overrideRaw = parseField(priceOverride);
    const overridePerSqft =
      overrideRaw === undefined
        ? null
        : units === "metric"
          ? pricePerSqmToPerSqft(overrideRaw)
          : overrideRaw;

    try {
      const result = estimateRoom(
        {
          unit: "ft",
          sections: [{ length: lengthFt, width: widthFt }],
          layout,
          productId: product.id,
          priceOverridePerSqft: overridePerSqft,
        },
        product,
        settings,
      );
      return { kind: "ok", result };
    } catch (e) {
      if (e instanceof CalcError) return { kind: "error", message: e.message };
      throw e;
    }
  }, [length, width, units, layout, product, priceOverride, settings]);

  function switchUnits(next: UnitSystem) {
    if (next === units) return;
    setLength(convertField(length, units));
    setWidth(convertField(width, units));
    const p = parseField(priceOverride);
    if (p !== undefined && Number.isFinite(p)) {
      const converted = next === "metric" ? pricePerSqftToPerSqm(p) : pricePerSqmToPerSqft(p);
      setPriceOverride(String(Number(converted.toFixed(2))));
    }
    setUnits(next);
  }

  const catalogPriceDisplay =
    units === "metric"
      ? `${formatCurrency(pricePerSqftToPerSqm(product.pricePerSqft))} / m²`
      : `${formatCurrency(product.pricePerSqft)} / sq ft`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <fieldset>
          <legend className="mb-2 text-base font-semibold">Units</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["imperial", "metric"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={units === u}
                onClick={() => switchUnits(u)}
                className={`min-h-12 rounded-xl text-base font-medium ring-1 ${
                  units === u
                    ? "bg-stone-900 text-white ring-stone-900"
                    : "bg-white text-stone-800 ring-stone-300"
                }`}
              >
                {u === "imperial" ? "Feet & inches" : "Metres"}
              </button>
            ))}
          </div>
        </fieldset>

        <LengthInput label="Room length" value={length} onChange={setLength} units={units} />
        <LengthInput label="Room width" value={width} onChange={setWidth} units={units} />

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
              placeholder={
                units === "metric"
                  ? String(Number(pricePerSqftToPerSqm(product.pricePerSqft).toFixed(2)))
                  : String(product.pricePerSqft)
              }
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
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
  value,
  onChange,
  units,
}: {
  label: string;
  value: LengthField;
  onChange: (v: LengthField) => void;
  units: UnitSystem;
}) {
  const inputClass = "min-h-12 w-full rounded-xl px-3 text-lg ring-1 ring-stone-300";
  return (
    <fieldset>
      <legend className="mb-2 text-base font-semibold">{label}</legend>
      {units === "imperial" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input
              inputMode="decimal"
              aria-label={`${label} feet`}
              placeholder="12"
              value={value.ft}
              onChange={(e) => onChange({ ...value, ft: e.target.value })}
              className={inputClass}
            />
            <span className="text-base text-stone-600">ft</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              inputMode="decimal"
              aria-label={`${label} inches`}
              placeholder="0"
              value={value.in}
              onChange={(e) => onChange({ ...value, in: e.target.value })}
              className={inputClass}
            />
            <span className="text-base text-stone-600">in</span>
          </label>
        </div>
      ) : (
        <label className="flex items-center gap-2">
          <input
            inputMode="decimal"
            aria-label={`${label} metres`}
            placeholder="3.6"
            value={value.m}
            onChange={(e) => onChange({ ...value, m: e.target.value })}
            className={inputClass}
          />
          <span className="text-base text-stone-600">m</span>
        </label>
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
