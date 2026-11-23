"use client";

import { resolveProduct, roomOutcome, type StoredProject, type StoredRoom } from "@/lib/project/model";
import { usePhotos } from "@/lib/project/photos";
import type { FlooringProduct, Settings } from "@/types";
import EstimateResult from "../EstimateResult";
import { LAYOUT_LABELS, productName } from "./labels";
import { href } from "./router";
import { BackLink, Card, LinkButton, Notice, PrimaryButton } from "./ui";
import { useAnalyze } from "./useAnalyze";

export default function ResultScreen({
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
  const outcome = roomOutcome(room, products, settings);
  const photos = usePhotos(room.id);
  const { analyze, phase, progress, error, busy } = useAnalyze(project.id, room.id);
  const { missing } = resolveProduct(products, room.productId);
  const roomHref = href({ name: "room", projectId: project.id, roomId: room.id });
  const projectHref = href({ name: "project", projectId: project.id });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href={projectHref} label={project.name} />
        <h1 className="break-words text-2xl font-bold">{room.name}</h1>
      </div>

      {missing && <Notice tone="warn">This room&apos;s flooring is no longer in the catalog; the first product is used. Choose another on the room screen.</Notice>}

      {outcome.status === "ok" ? (
        <>
          {outcome.estimate.reanalyzeWith && (
            <Card>
              <p className="text-base">
                Your measurement is applied. Re-analyzing lets the photo analyzer use it as a ruler for the other wall, which is usually
                more accurate.
              </p>
              {photos.length > 0 && photos.some((p) => p.slot === 1) ? (
                <PrimaryButton className="mt-3 w-full" disabled={busy} onClick={() => analyze(room.walls, photos)}>
                  {busy
                    ? phase === "uploading"
                      ? `Uploading photos… ${Math.round(progress * 100)}%`
                      : "Analyzing photos… about 15 seconds."
                    : "Re-analyze with this measurement"}
                </PrimaryButton>
              ) : (
                <p className="mt-2 text-sm text-stone-600">
                  Photos aren&apos;t saved. <a href={roomHref} className="font-semibold text-sky-800 underline">Re-add photos to re-analyze</a>.
                </p>
              )}
              {error && (
                <div className="mt-3">
                  <Notice tone="error">{error}</Notice>
                </div>
              )}
            </Card>
          )}
          <EstimateResult
            estimate={outcome.estimate}
            units={project.units}
            productName={productName(products, room.productId)}
            layoutLabel={LAYOUT_LABELS[room.layout]}
          />
        </>
      ) : (
        <Card>
          {outcome.status === "unusable" ? (
            <>
              <h2 className="text-lg font-semibold">We couldn&apos;t estimate from these photos</h2>
              <ul className="mt-2 list-disc pl-5 text-base">
                {outcome.issues.map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-stone-600">Retake the photos and re-analyze, or measure both walls instead.</p>
            </>
          ) : outcome.status === "invalid" ? (
            <p className="text-base text-red-800">{outcome.message}</p>
          ) : (
            <p className="text-base text-stone-700">
              {outcome.status === "needs_photos"
                ? "This room needs photos, or the other wall measurement, before it can be estimated."
                : "This room has no measurements or photos yet."}
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <LinkButton href={roomHref} primary={outcome.status !== "ok"}>
          Edit room
        </LinkButton>
        <LinkButton href={projectHref}>Back to project</LinkButton>
      </div>
    </div>
  );
}
