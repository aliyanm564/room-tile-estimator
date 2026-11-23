"use client";

import type { Confidence, Estimate, MainDimension } from "@/lib/estimate/merge";
import { pricePerSqftToPerSqm } from "@/lib/calc/units";
import {
  PRICE_SOURCE_LABEL,
  formatArea,
  formatAreaValue,
  formatCostRange,
  formatCurrency,
  formatHeadlineDims,
  formatLength,
  formatLengthRange,
  formatPercent,
  formatRange,
} from "@/lib/format";
import type { UnitSystem } from "@/types";
import { Badge, Disclaimer, SourceBadge, type BadgeTone } from "./app/ui";

const CONFIDENCE: Record<Confidence, { label: string; tone: BadgeTone }> = {
  measured: { label: "Measured", tone: "green" },
  high: { label: "High confidence", tone: "green" },
  medium: { label: "Medium confidence", tone: "amber" },
  low: { label: "Low confidence", tone: "orange" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Likely numbers are the headline; ranges are small secondary text. */
export default function EstimateResult({
  estimate: e,
  units,
  productName,
  layoutLabel,
}: {
  estimate: Estimate;
  units: UnitSystem;
  productName: string;
  layoutLabel: string;
}) {
  const r = e.result;
  const conf = CONFIDENCE[e.confidence];
  const priceUnit = units === "metric" ? "per m²" : "per sq ft";
  const price = units === "metric" ? pricePerSqftToPerSqm(r.pricePerSqft) : r.pricePerSqft;
  const items = e.items.filter((i) => !i.removed);

  return (
    <section aria-label="Estimate" className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={conf.tone}>{conf.label}</Badge>
          {e.roomType && <span className="text-sm text-stone-600">{capitalize(e.roomType)}</span>}
        </div>
        <h2 className="mt-1 text-2xl font-bold">
          {e.main ? formatHeadlineDims(e.main.longer.ft.likely, e.main.shorter.ft.likely, units) : `About ${formatAreaValue(e.mainAreaSqft.likely, units)}`}
        </h2>
        <p className="text-sm text-stone-600">{e.confidenceReason}</p>
      </div>

      <div className="rounded-xl bg-stone-50 p-4">
        <p className="text-sm text-stone-600">Material cost</p>
        <p className="text-4xl font-bold tabular-nums" data-testid="room-cost">
          {formatCurrency(r.cost.likely, r.currency)}
        </p>
        {r.isRange && <p className="text-sm text-stone-500 tabular-nums">Likely {formatCostRange(r.cost, r.currency)}</p>}
        <p className="mt-2 text-base text-stone-800">
          <strong className="tabular-nums">{r.boxes.likely}</strong> box{r.boxes.likely === 1 ? "" : "es"} of {productName}
          {r.isRange && r.boxes.low !== r.boxes.high && <span className="text-sm text-stone-500"> ({formatRange(r.boxes)})</span>}
        </p>
        <p className="text-sm text-stone-600">
          {formatCurrency(price, r.currency)} {priceUnit} · {layoutLabel} layout · whole boxes
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Floor area" value={formatAreaValue(r.areaSqft.likely, units)} range={r.isRange ? formatArea(r.areaSqft, units) : null} />
        <Stat label={`With ${formatPercent(r.wasteFactor)} for cuts`} value={formatAreaValue(r.sqftNeeded.likely, units)} range={r.isRange ? formatArea(r.sqftNeeded, units) : null} />
      </dl>

      {e.main && (
        <dl className="flex flex-col gap-2">
          <Dimension label="Longer wall (length)" dim={e.main.longer} units={units} />
          <Dimension label="Shorter wall (width)" dim={e.main.shorter} units={units} />
        </dl>
      )}

      {items.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Closets and built-ins</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {items.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {i.label} <SourceBadge source={i.source} />
                </span>
                <span className="tabular-nums text-stone-700">
                  {formatLength(i.widthFt.likely, units)} × {formatLength(i.depthFt.likely, units)} · {i.kind === "obstacle" ? "−" : "+"}
                  {formatAreaValue(i.areaSqft.likely, units)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={`rounded-xl p-3 text-sm ${r.priceSource === "placeholder" ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-stone-100 text-stone-700"}`}>
        <strong>Price:</strong> {PRICE_SOURCE_LABEL[r.priceSource]}
      </p>

      {e.scaleFrom.length > 0 && (
        <p className="text-sm text-stone-700">
          <strong>Scale from:</strong> {e.scaleFrom.join(", ")}
        </p>
      )}

      {e.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <h3 className="text-sm font-semibold text-amber-900">Check these</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
            {e.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {e.notes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Tips</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-stone-700">
            {e.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer />
    </section>
  );
}

function Stat({ label, value, range }: { label: string; value: string; range: string | null }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <dt className="text-sm text-stone-600">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {range && <dd className="text-xs text-stone-500 tabular-nums">{range}</dd>}
    </div>
  );
}

function Dimension({ label, dim, units }: { label: string; dim: MainDimension; units: UnitSystem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
      <dt className="text-sm text-stone-700">
        {label} <SourceBadge source={dim.source} />
      </dt>
      <dd className="text-right">
        <span className="text-lg font-semibold tabular-nums">{formatLength(dim.ft.likely, units)}</span>
        {dim.source === "estimated" && dim.ft.low !== dim.ft.high && (
          <span className="block text-xs text-stone-500 tabular-nums">{formatLengthRange(dim.ft, units)}</span>
        )}
      </dd>
    </div>
  );
}
