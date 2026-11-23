"use client";

import { useMemo, useRef, useState } from "react";
import { pricePerSqftToPerSqm } from "@/lib/calc/units";
import { areaItems, buildEstimate, type AreaItem, type Walls } from "@/lib/estimate/merge";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  blurLength,
  blurPrice,
  editLength,
  editPrice,
  lengthDisplayText,
  priceDisplayText,
  switchLengthUnits,
  switchPriceUnits,
  type LengthField,
  type LengthPart,
  type PriceField,
} from "@/lib/measurement-input";
import { deleteRoom, resolveProduct, setProjectUnits, type StoredProject, type StoredRoom } from "@/lib/project/model";
import { photoStore, usePhotos } from "@/lib/project/photos";
import { projectStore } from "@/lib/project/store";
import type { FlooringProduct, Layout, Settings, UnitSystem } from "@/types";
import LengthInput from "../LengthInput";
import UnitsToggle from "../UnitsToggle";
import AreaItemsEditor from "./AreaItemsEditor";
import { LAYOUT_LABELS } from "./labels";
import PhotoChecklist from "./PhotoChecklist";
import { href, navigate } from "./router";
import { Badge, BackLink, Card, ConfirmDelete, EditableName, Notice, PrimaryButton, SecondaryButton } from "./ui";
import { useAnalyze } from "./useAnalyze";

const fieldFrom = (ft: number | null, units: UnitSystem): LengthField => ({ feet: ft, text: lengthDisplayText(ft, units) });
const priceFrom = (perSqft: number | null, units: UnitSystem): PriceField => ({ perSqft, text: priceDisplayText(perSqft, units) });
/** Only valid numbers are saved; text that isn't a number stays on screen as an error. */
const valid = (n: number | null) => (n !== null && Number.isFinite(n) && n > 0 ? n : null);

function safeItems(room: StoredRoom): AreaItem[] {
  try {
    return areaItems(room.analysis, room.areaEdits);
  } catch {
    return [];
  }
}

export default function RoomScreen({
  project,
  room,
  products,
  settings,
}: {
  project: StoredProject;
  room: StoredRoom;
  products: FlooringProduct[];
  settings: Settings;
}) {
  const units = project.units;
  const [longer, setLonger] = useState(() => fieldFrom(room.walls.longerFt, units));
  const [shorter, setShorter] = useState(() => fieldFrom(room.walls.shorterFt, units));
  const [price, setPrice] = useState(() => priceFrom(room.priceOverridePerSqft, units));
  const longerRef = useRef<HTMLInputElement>(null);
  const photos = usePhotos(room.id);
  const { analyze, phase, progress, error, busy } = useAnalyze(project.id, room.id);
  const { product, missing } = resolveProduct(products, room.productId);

  // What's on screen right now (incl. text that doesn't parse yet, which shows as an error).
  const walls: Walls = { longerFt: longer.feet, shorterFt: shorter.feet };
  const bothWalls = walls.longerFt !== null && walls.shorterFt !== null;
  const outcome = useMemo(
    () =>
      buildEstimate(
        { analysis: room.analysis, walls: { longerFt: longer.feet, shorterFt: shorter.feet }, layout: room.layout, priceOverridePerSqft: room.priceOverridePerSqft, areaEdits: room.areaEdits },
        product,
        settings,
      ),
    [room.analysis, longer.feet, shorter.feet, room.layout, room.priceOverridePerSqft, room.areaEdits, product, settings],
  );
  const items = safeItems(room);
  const slot1 = photos.some((p) => p.slot === 1);
  const reanalyzeWith = outcome.status === "ok" ? outcome.estimate.reanalyzeWith : null;

  const save = (patch: Parameters<typeof projectStore.updateRoom>[2]) => projectStore.updateRoom(project.id, room.id, patch);

  function editWall(which: "longer" | "shorter", part: LengthPart, text: string) {
    const current = which === "longer" ? longer : shorter;
    const next = editLength(current, units, part, text);
    (which === "longer" ? setLonger : setShorter)(next);
    save({ walls: { ...room.walls, [which === "longer" ? "longerFt" : "shorterFt"]: valid(next.feet) } });
  }

  function switchUnits(next: UnitSystem) {
    if (next === units) return;
    setLonger((f) => switchLengthUnits(f, next));
    setShorter((f) => switchLengthUnits(f, next));
    setPrice((f) => switchPriceUnits(f, next));
    projectStore.update((d) => setProjectUnits(d, project.id, next));
  }

  async function estimate() {
    if (await analyze({ longerFt: valid(longer.feet), shorterFt: valid(shorter.feet) }, photos)) {
      navigate({ name: "result", projectId: project.id, roomId: room.id });
    }
  }

  const goResult = () => navigate({ name: "result", projectId: project.id, roomId: room.id });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href={href({ name: "project", projectId: project.id })} label={project.name} />
        <EditableName value={room.name} label="Room name" onSave={(v) => save({ name: v })} />
      </div>

      <Card aria-label="Walls">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Measure the walls</h2>
          <Badge tone="green">Recommended</Badge>
        </div>
        <p className="mt-1 text-base text-stone-700">One measurement makes the estimate much more accurate.</p>
        <p className="mb-3 text-sm text-stone-600">Measure wall to wall, not including closets. Both walls skip the photos entirely.</p>
        <div className="flex flex-col gap-4">
          <UnitsToggle value={units} onChange={switchUnits} />
          <LengthInput
            label="Longer wall (length)"
            optional
            field={longer}
            units={units}
            inputRef={longerRef}
            onEdit={(p, t) => editWall("longer", p, t)}
            onLeave={() => setLonger((f) => blurLength(f, units))}
          />
          <LengthInput
            label="Shorter wall (width)"
            optional
            field={shorter}
            units={units}
            onEdit={(p, t) => editWall("shorter", p, t)}
            onLeave={() => setShorter((f) => blurLength(f, units))}
          />
        </div>
      </Card>

      <Card aria-label="Photos">
        <h2 className="mb-2 text-lg font-bold">Photos {bothWalls && <span className="text-sm font-normal text-stone-600">(optional: they find closets and built-ins)</span>}</h2>
        {room.analysis && photos.length === 0 && (
          <div className="mb-3">
            <Notice tone="info">
              This room was analyzed from {room.analysisPhotoCount || "earlier"} photo{room.analysisPhotoCount === 1 ? "" : "s"}. Photos aren&apos;t saved, so{" "}
              <strong>re-add photos to re-analyze</strong>.
            </Notice>
          </div>
        )}
        <PhotoChecklist roomId={room.id} photosRequired={!bothWalls} disabled={busy} />
      </Card>

      <Card aria-label="Closets and built-ins">
        <h2 className="text-lg font-bold">Closets and built-ins</h2>
        <p className="mb-3 text-sm text-stone-600">Closets get flooring too; built-ins like islands are subtracted. Sizes you enter are exact.</p>
        <AreaItemsEditor items={items} edits={room.areaEdits} units={units} onChange={(areaEdits) => save({ areaEdits })} />
      </Card>

      <Card aria-label="Flooring">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-base font-semibold">Flooring</span>
            <select value={product.id} onChange={(e) => save({ productId: e.target.value })} className="min-h-12 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-stone-600">
              {formatNumber(product.sqftPerBox, 2)} sq ft per box ·{" "}
              {units === "metric" ? `${formatCurrency(pricePerSqftToPerSqm(product.pricePerSqft))} / m²` : `${formatCurrency(product.pricePerSqft)} / sq ft`}
              {!product.verified && " (placeholder price)"}
            </span>
            {missing && <Notice tone="warn">The flooring saved for this room is no longer in the catalog. Choose one above.</Notice>}
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-semibold">Layout</span>
            <select value={room.layout} onChange={(e) => save({ layout: e.target.value as Layout })} className="min-h-12 rounded-xl bg-white px-3 text-base ring-1 ring-stone-300">
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
                onChange={(e) => {
                  const next = editPrice(units, e.target.value);
                  setPrice(next);
                  save({ priceOverridePerSqft: valid(next.perSqft) });
                }}
                onBlur={() => setPrice((f) => blurPrice(f, units))}
                className="min-h-12 w-full min-w-0 rounded-xl px-3 text-lg ring-1 ring-stone-300"
              />
              <span className="shrink-0 text-base text-stone-600">{units === "metric" ? "per m²" : "per sq ft"}</span>
            </div>
            <span className="text-sm text-stone-600">Leave blank to use the catalog price.</span>
          </label>
        </div>
      </Card>

      <Card aria-label="Estimate">
        {outcome.status === "invalid" && <Notice tone="error">{outcome.message}</Notice>}
        {busy ? (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-base font-semibold">
              {phase === "preparing" && "Getting photos ready…"}
              {phase === "uploading" && `Uploading photos… ${Math.round(progress * 100)}%`}
              {phase === "analyzing" && "Analyzing photos… about 15 seconds."}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full bg-[var(--brand)] transition-all"
                style={{ width: `${phase === "preparing" ? 5 : phase === "uploading" ? 5 + progress * 45 : 75}%` }}
              />
            </div>
          </div>
        ) : bothWalls ? (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium text-emerald-900">Both walls measured, no photos needed.</p>
            <PrimaryButton onClick={goResult} disabled={outcome.status !== "ok"}>
              See result
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {photos.length > 0 ? (
              <>
                {!slot1 && <p className="text-sm text-amber-800">Add photo 1 (a corner view) to continue.</p>}
                <PrimaryButton onClick={estimate} disabled={!slot1}>
                  {reanalyzeWith ? "Re-analyze with your measurement" : room.analysis ? "Re-analyze photos" : "Estimate"}
                </PrimaryButton>
              </>
            ) : (
              !room.analysis && (
                <>
                  <p className="text-sm text-stone-600">Add photos (start with a corner view), or measure both walls.</p>
                  <PrimaryButton disabled>Estimate</PrimaryButton>
                </>
              )
            )}
            {room.analysis && outcome.status === "ok" && <SecondaryButton onClick={goResult}>See result</SecondaryButton>}
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </Card>

      <div className="border-t border-stone-200 pt-4">
        <ConfirmDelete
          label="Delete room"
          message={`Delete "${room.name}"? This can't be undone.`}
          onConfirm={() => {
            photoStore.clearRoom(room.id);
            projectStore.update((d) => deleteRoom(d, project.id, room.id));
            navigate({ name: "project", projectId: project.id });
          }}
        />
      </div>
    </div>
  );
}
