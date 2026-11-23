"use client";

import type { Confidence, Estimate, EstimateWarning, MainDimension } from "@/lib/estimate/merge";
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

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  measured: { label: "Measured", className: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  high: { label: "High confidence", className: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  medium: { label: "Medium confidence", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  low: { label: "Low confidence", className: "bg-orange-50 text-orange-900 ring-orange-200" },
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function EstimateResult({
  estimate: e,
  units,
  onEdit,
  onReanalyze,
  busy,
  photosChanged,
}: {
  estimate: Estimate;
  units: UnitSystem;
  onEdit: (wall: "longer" | "shorter") => void;
  onReanalyze: () => void;
  busy: boolean;
  photosChanged: boolean;
}) {
  const r = e.result;
  const conf = CONFIDENCE_STYLE[e.confidence];
  const priceUnit = units === "metric" ? "per m²" : "per sq ft";
  const price = units === "metric" ? pricePerSqftToPerSqm(r.pricePerSqft) : r.pricePerSqft;

  return (
    <section aria-live="polite" aria-label="Estimate" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${conf.className}`}>{conf.label}</span>
        {e.roomType && <span className="text-sm text-stone-600">{capitalize(e.roomType)}</span>}
      </div>
      <h2 className="text-2xl font-bold">
        {e.main
          ? formatHeadlineDims(e.main.longer.ft.likely, e.main.shorter.ft.likely, units)
          : `About ${formatAreaValue(e.mainAreaSqft.likely, units)}`}
      </h2>
      <p className="mt-1 text-sm text-stone-600">{e.confidenceReason}</p>

      {photosChanged && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Your photos changed since this estimate. Press <strong>Re-analyze photos</strong> below to update it.
        </p>
      )}

      {e.main && (
        <dl className="mt-4 flex flex-col gap-2">
          <Dimension label="Longer wall" dim={e.main.longer} units={units} onEdit={() => onEdit("longer")} />
          <Dimension label="Shorter wall" dim={e.main.shorter} units={units} onEdit={() => onEdit("shorter")} />
        </dl>
      )}

      {e.reanalyzeWith && (
        <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
          <p className="text-sm text-sky-900">
            Your measurement is applied. Re-analyzing lets the photo analyzer use it as a ruler for the other wall,
            which is usually more accurate.
          </p>
          <button
            type="button"
            onClick={onReanalyze}
            disabled={busy}
            className="mt-2 min-h-12 w-full rounded-xl bg-sky-700 px-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Analyzing photos… about 15 seconds" : "Re-analyze with this measurement"}
          </button>
        </div>
      )}

      <dl className="mt-4 flex flex-col divide-y divide-stone-200">
        <Row label="Floor area" value={formatAreaValue(r.areaSqft.likely, units)} range={r.isRange ? formatArea(r.areaSqft, units) : undefined} />
        {e.closetAreaSqft && (
          <Row
            label={`Includes ${e.closetCount === 1 ? "closet" : `${e.closetCount} closets`} (estimated)`}
            value={formatAreaValue(e.closetAreaSqft.likely, units)}
            small
          />
        )}
        {e.otherAreaSqft && <Row label="Includes other areas (estimated)" value={formatAreaValue(e.otherAreaSqft.likely, units)} small />}
        {e.obstacleAreaSqft && (
          <Row label={`Minus built-ins: ${e.obstacleLabels.join(", ")} (estimated)`} value={`−${formatAreaValue(e.obstacleAreaSqft.likely, units)}`} small />
        )}
        <Row
          label={`With ${formatPercent(r.wasteFactor)} extra for cuts`}
          value={formatAreaValue(r.sqftNeeded.likely, units)}
          range={r.isRange ? formatArea(r.sqftNeeded, units) : undefined}
        />
        <Row
          label="Boxes to buy"
          value={String(r.boxes.likely)}
          range={r.isRange && r.boxes.low !== r.boxes.high ? `${formatRange(r.boxes)} boxes` : undefined}
          big
        />
        {r.approxPlanks && <Row label="Planks (approx.)" value={`≈ ${r.approxPlanks.likely}`} small />}
        <Row
          label="Material cost"
          value={formatCurrency(r.cost.likely, r.currency)}
          range={r.isRange ? `Likely ${formatCostRange(r.cost, r.currency)}` : undefined}
          note={`${formatCurrency(price, r.currency)} ${priceUnit} · whole boxes`}
          big
        />
      </dl>

      <p
        className={`mt-4 rounded-xl p-3 text-sm ${
          r.priceSource === "placeholder" ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-stone-100 text-stone-700"
        }`}
      >
        <strong>Price:</strong> {PRICE_SOURCE_LABEL[r.priceSource]}
      </p>

      {e.scaleFrom.length > 0 && (
        <p className="mt-3 text-sm text-stone-700">
          <strong>Scale from:</strong> {e.scaleFrom.join(", ")}
        </p>
      )}

      {e.warnings.length > 0 && <Warnings warnings={e.warnings} />}

      {e.notes.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-stone-800">Tips</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-stone-700">
            {e.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm text-stone-600">
        Budget estimate for flooring material only. Doesn&apos;t include underlay, trim, installation, or tax.
      </p>
    </section>
  );
}

function Dimension({ label, dim, units, onEdit }: { label: string; dim: MainDimension; units: UnitSystem; onEdit: () => void }) {
  const measured = dim.source === "measured";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-sm text-stone-600">
          {label}{" "}
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${measured ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}
          >
            {measured ? "measured" : "estimated"}
          </span>
        </dt>
        <dd className="text-lg font-semibold tabular-nums">
          {formatLength(dim.ft.likely, units)}
          {!measured && dim.ft.low !== dim.ft.high && (
            <span className="block text-sm font-normal text-stone-500">{formatLengthRange(dim.ft, units)}</span>
          )}
        </dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="min-h-11 shrink-0 rounded-lg px-3 text-base font-semibold text-sky-800 ring-1 ring-sky-300 active:bg-sky-50"
      >
        {measured ? "Edit" : "Enter"}
      </button>
    </div>
  );
}

function Warnings({ warnings }: { warnings: EstimateWarning[] }) {
  return (
    <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <h3 className="text-sm font-semibold text-amber-900">Check these</h3>
      <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
        {warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  range,
  note,
  big,
  small,
}: {
  label: string;
  value: string;
  range?: string;
  note?: string;
  big?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className={`min-w-0 ${small ? "text-sm text-stone-600" : "text-base text-stone-700"}`}>
        {label}
        {note && <span className="block text-sm text-stone-500">{note}</span>}
      </dt>
      <dd className="shrink-0 text-right">
        <span className={`font-semibold tabular-nums ${big ? "text-2xl" : small ? "text-base" : "text-lg"}`}>{value}</span>
        {range && <span className="block text-sm text-stone-500 tabular-nums">{range}</span>}
      </dd>
    </div>
  );
}
