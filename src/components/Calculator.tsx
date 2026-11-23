"use client";

import { useMemo, useRef, useState } from "react";
import type { RoomAnalysis } from "@/lib/ai/schema";
import { pricePerSqftToPerSqm } from "@/lib/calc/units";
import { EstimateApiError, requestAnalysis } from "@/lib/estimate/api-client";
import { buildEstimate, type Walls } from "@/lib/estimate/merge";
import { createEstimateRunner } from "@/lib/estimate/run";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
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
} from "@/lib/measurement-input";
import type { FlooringProduct, Layout, Settings, UnitSystem } from "@/types";
import EstimateResult from "./EstimateResult";
import LengthInput from "./LengthInput";
import PhotoPicker from "./PhotoPicker";
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

const photosKey = (photos: File[]) => photos.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");

export default function Calculator({ products, settings }: Props) {
  const [units, setUnits] = useState<UnitSystem>(settings.defaultUnits);
  const [longer, setLonger] = useState<LengthField>(emptyLength);
  const [shorter, setShorter] = useState<LengthField>(emptyLength);
  const [productId, setProductId] = useState(products[0].id);
  const [layout, setLayout] = useState<Layout>("straight");
  const [price, setPrice] = useState(emptyPrice);
  const [photos, setPhotos] = useState<File[]>([]);

  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(null);
  const [analyzedPhotosKey, setAnalyzedPhotosKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One runner for the component's lifetime: guarantees one API call at a time (each costs money).
  const [run] = useState(() => createEstimateRunner<File>((p, km) => requestAnalysis(p, km)));
  const longerRef = useRef<HTMLInputElement>(null);
  const shorterRef = useRef<HTMLInputElement>(null);

  const product = products.find((p) => p.id === productId) ?? products[0];
  const walls: Walls = { longerFt: longer.feet, shorterFt: shorter.feet };
  const bothWalls = walls.longerFt !== null && walls.shorterFt !== null;
  const photosChanged = analysis !== null && analyzedPhotosKey !== photosKey(photos);

  // Pure merge: recalculates instantly on every edit. Never calls the API.
  const outcome = useMemo(
    () =>
      buildEstimate(
        {
          analysis,
          walls: { longerFt: longer.feet, shorterFt: shorter.feet },
          layout,
          priceOverridePerSqft: price.perSqft,
        },
        product,
        settings,
      ),
    [analysis, longer.feet, shorter.feet, layout, price.perSqft, product, settings],
  );

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = photosKey(photos);
    try {
      const res = await run({ walls, photos });
      if (res.analysis) {
        setAnalysis(res.analysis);
        setAnalyzedPhotosKey(key);
      }
    } catch (e) {
      setError(e instanceof EstimateApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchUnits(next: UnitSystem) {
    if (next === units) return;
    setLonger((f) => switchLengthUnits(f, next));
    setShorter((f) => switchLengthUnits(f, next));
    setPrice((f) => switchPriceUnits(f, next));
    setUnits(next);
  }

  function focusWall(which: "longer" | "shorter") {
    const el = (which === "longer" ? longerRef : shorterRef).current;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  const catalogPriceDisplay =
    units === "metric"
      ? `${formatCurrency(pricePerSqftToPerSqm(product.pricePerSqft))} / m²`
      : `${formatCurrency(product.pricePerSqft)} / sq ft`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <UnitsToggle value={units} onChange={switchUnits} />

        <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />

        <div className="flex flex-col gap-4">
          <LengthInput
            label="Longer wall"
            optional
            field={longer}
            units={units}
            inputRef={longerRef}
            onEdit={(part, text) => setLonger((f) => editLength(f, units, part, text))}
            onLeave={() => setLonger((f) => blurLength(f, units))}
          />
          <LengthInput
            label="Shorter wall"
            optional
            field={shorter}
            units={units}
            inputRef={shorterRef}
            onEdit={(part, text) => setShorter((f) => editLength(f, units, part, text))}
            onLeave={() => setShorter((f) => blurLength(f, units))}
          />
          <p className="-mt-2 text-sm text-stone-600">
            Measure wall to wall, not including closets. One wall makes the photo estimate much more accurate; both
            walls skip the photos entirely.
          </p>
        </div>

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
            <span className="shrink-0 text-base text-stone-600">{units === "metric" ? "per m²" : "per sq ft"}</span>
          </div>
          <span className="text-sm text-stone-600">Leave blank to use the catalog price.</span>
        </label>

        {bothWalls ? (
          <p className="rounded-xl bg-emerald-50 p-3 text-base font-medium text-emerald-900 ring-1 ring-emerald-200">
            Both walls measured, no photos needed.
          </p>
        ) : (
          <div>
            <button
              type="button"
              onClick={analyze}
              disabled={busy || photos.length === 0}
              aria-busy={busy}
              className="min-h-14 w-full rounded-xl bg-stone-900 px-4 text-lg font-semibold text-white disabled:bg-stone-300 disabled:text-stone-600"
            >
              {busy ? "Analyzing photos… about 15 seconds." : analysis ? "Re-analyze photos" : "Estimate"}
            </button>
            {photos.length === 0 && !busy && (
              <p className="mt-2 text-sm text-stone-600">Add at least one photo, or measure both walls.</p>
            )}
          </div>
        )}
      </section>

      {error && (
        <section role="alert" className="rounded-2xl bg-red-50 p-5 text-base text-red-900 ring-1 ring-red-200">
          <p>{error}</p>
          {!bothWalls && photos.length > 0 && (
            <button
              type="button"
              onClick={analyze}
              disabled={busy}
              className="mt-3 min-h-12 rounded-xl bg-white px-4 font-semibold text-red-900 ring-1 ring-red-300"
            >
              Try again
            </button>
          )}
        </section>
      )}

      {busy && !analysis ? (
        <section className="rounded-2xl bg-stone-100 p-5 text-base text-stone-700" role="status">
          Analyzing photos… about 15 seconds.
        </section>
      ) : outcome.status === "ok" ? (
        <EstimateResult
          estimate={outcome.estimate}
          units={units}
          onEdit={focusWall}
          onReanalyze={analyze}
          busy={busy}
          photosChanged={photosChanged && !bothWalls}
        />
      ) : outcome.status === "unusable" ? (
        <section role="alert" className="rounded-2xl bg-amber-50 p-5 text-base text-amber-950 ring-1 ring-amber-200">
          <h2 className="text-lg font-semibold">We couldn&apos;t estimate from these photos</h2>
          <ul className="mt-2 list-disc pl-5">
            {outcome.issues.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm">Fix the photos above and press Re-analyze, or measure both walls instead.</p>
        </section>
      ) : outcome.status === "invalid" ? (
        <section role="alert" className="rounded-2xl bg-red-50 p-5 text-base text-red-800 ring-1 ring-red-200">
          {outcome.message}
        </section>
      ) : (
        <section className="rounded-2xl bg-stone-100 p-5 text-base text-stone-700">
          {photos.length > 0
            ? "Press Estimate to analyze your photos."
            : outcome.status === "needs_photos"
              ? "Add photos so the other wall can be estimated, or measure both walls."
              : "Add photos of the room, or measure both walls, to see how much flooring you need."}
        </section>
      )}
    </div>
  );
}
