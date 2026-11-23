"use client";

import type { Branding } from "@/lib/catalog";
import { formatCostRange, formatCurrency, formatLength, formatNumber } from "@/lib/format";
import { houseTotal, roomOutcome, type StoredProject } from "@/lib/project/model";
import { sqftToSqm } from "@/lib/calc/units";
import type { FlooringProduct, Settings, UnitSystem } from "@/types";
import { LAYOUT_LABELS, productName } from "./labels";
import { href } from "./router";
import { BackLink, Disclaimer, PrimaryButton } from "./ui";

const area = (sqft: number, units: UnitSystem) => (units === "metric" ? `${formatNumber(sqftToSqm(sqft), 1)} m²` : `${formatNumber(sqft)} sq ft`);
const tag = (source: string) => <span className="whitespace-nowrap text-xs text-stone-500">({source})</span>;

/** Project summary for printing / "Save as PDF" (browser print; no PDF library). */
export default function PrintScreen({
  project,
  products,
  settings,
  branding,
}: {
  project: StoredProject;
  products: FlooringProduct[];
  settings: Settings;
  branding: Branding;
}) {
  const units = project.units;
  const rooms = project.rooms.map((room) => ({ room, outcome: roomOutcome(room, products, settings) }));
  const total = houseTotal(rooms.map(({ room, outcome }) => ({ productId: room.productId, outcome })));
  const pending = rooms.filter((r) => r.outcome.status !== "ok");
  const today = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col gap-5 print:gap-3" data-testid="print-view">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={href({ name: "project", projectId: project.id })} label={project.name} />
        <PrimaryButton onClick={() => window.print()}>Print / Save as PDF</PrimaryButton>
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-stone-300 pb-3">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)] print:text-black">{branding.appName}</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-stone-600">Flooring estimate · {today}</p>
        </div>
        {branding.logoPath && (
          // eslint-disable-next-line @next/next/no-img-element -- static brand logo from public/
          <img src={branding.logoPath} alt="" className="h-12 w-auto" />
        )}
      </header>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-b-2 border-stone-400 text-left">
              <th className="py-2 pr-3">Room</th>
              <th className="py-2 pr-3">Size</th>
              <th className="py-2 pr-3">Flooring</th>
              <th className="py-2 pr-3 text-right">Incl. waste</th>
              <th className="py-2 pr-3 text-right">Boxes</th>
              <th className="py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(({ room, outcome }) => {
              if (outcome.status !== "ok") return null;
              const e = outcome.estimate;
              const r = e.result;
              const items = e.items.filter((i) => !i.removed);
              return (
                <tr key={room.id} className="border-b border-stone-200 align-top" style={{ breakInside: "avoid" }}>
                  <td className="py-2 pr-3 font-semibold">{room.name}</td>
                  <td className="py-2 pr-3">
                    {e.main ? (
                      <>
                        {formatLength(e.main.longer.ft.likely, units)} {tag(e.main.longer.source)} ×{" "}
                        {formatLength(e.main.shorter.ft.likely, units)} {tag(e.main.shorter.source)}
                      </>
                    ) : (
                      <>About {area(e.mainAreaSqft.likely, units)} {tag("estimated")}</>
                    )}
                    {items.map((i) => (
                      <div key={i.key} className="text-xs text-stone-600">
                        {i.kind === "obstacle" ? "− " : "+ "}
                        {i.label}: {formatLength(i.widthFt.likely, units)} × {formatLength(i.depthFt.likely, units)} ({i.source})
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-3">
                    {productName(products, room.productId)}
                    <div className="text-xs text-stone-600">
                      {LAYOUT_LABELS[room.layout]}
                      {r.priceSource === "placeholder" ? " · placeholder price" : r.priceSource === "user" ? " · your price" : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{area(r.sqftNeeded.likely, units)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.boxes.likely}</td>
                  <td className="py-2 text-right tabular-nums">
                    <span className="font-semibold">{formatCurrency(r.cost.likely)}</span>
                    {r.isRange && <div className="text-xs text-stone-500">{formatCostRange(r.cost)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {total.cost && (
            <tfoot>
              <tr className="border-t-2 border-stone-400 font-bold">
                <td className="py-2 pr-3" colSpan={3}>
                  House total ({total.includedRooms} room{total.includedRooms === 1 ? "" : "s"})
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{area(total.sqftNeeded!.likely, units)}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 text-right tabular-nums">
                  <span className="text-lg">{formatCurrency(total.cost.likely)}</span>
                  {total.cost.low !== total.cost.high && <div className="text-xs font-normal text-stone-500">{formatCostRange(total.cost)}</div>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!total.cost && <p className="text-base text-stone-700">No room in this project has an estimate yet.</p>}
      {pending.length > 0 && (
        <p className="text-sm text-stone-700">
          Not included yet (need photos or measurements): {pending.map((p) => p.room.name).join(", ")}.
        </p>
      )}
      {total.anyPlaceholderPrice && <p className="text-sm text-stone-700">Some prices are placeholders, not real quotes.</p>}
      <p className="text-sm text-stone-700">
        &ldquo;Measured&rdquo; = entered by hand. &ldquo;Estimated&rdquo; = from photos; the small numbers are the likely range.
      </p>
      <Disclaimer className="font-medium text-stone-800" />
    </div>
  );
}
