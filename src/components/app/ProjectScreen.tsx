"use client";

import { useState } from "react";
import { formatCostRange, formatCurrency, formatNumber } from "@/lib/format";
import {
  addRoom,
  deleteProject,
  houseTotal,
  newRoom,
  renameProject,
  roomOutcome,
  roomStatus,
  setProjectUnits,
  type StoredProject,
} from "@/lib/project/model";
import { photoStore } from "@/lib/project/photos";
import { projectStore } from "@/lib/project/store";
import { sqftToSqm } from "@/lib/calc/units";
import type { FlooringProduct, Settings, UnitSystem } from "@/types";
import UnitsToggle from "../UnitsToggle";
import { STATUS, boxLines, productName } from "./labels";
import { href, navigate } from "./router";
import { Badge, BackLink, Card, ConfirmDelete, Disclaimer, EditableName, LinkButton, Notice, PrimaryButton, SecondaryButton } from "./ui";

const area = (sqft: number, units: UnitSystem) =>
  units === "metric" ? `${formatNumber(sqftToSqm(sqft), 1)} m²` : `${formatNumber(sqft)} sq ft`;

export default function ProjectScreen({ project, products, settings }: { project: StoredProject; products: FlooringProduct[]; settings: Settings }) {
  const [adding, setAdding] = useState(false);
  const [roomName, setRoomName] = useState("");
  const units = project.units;

  const rooms = project.rooms.map((r) => {
    const outcome = roomOutcome(r, products, settings);
    return { room: r, outcome, status: roomStatus(outcome) };
  });
  const total = houseTotal(rooms.map(({ room, outcome }) => ({ productId: room.productId, outcome })));
  const flagged = rooms.filter((r) => STATUS[r.status].needsAction);

  function add() {
    const room = newRoom(roomName || `Room ${project.rooms.length + 1}`, { productId: products[0].id });
    projectStore.update((d) => addRoom(d, project.id, room));
    setAdding(false);
    setRoomName("");
    navigate({ name: "room", projectId: project.id, roomId: room.id });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href={href({ name: "projects" })} label="Projects" />
        <EditableName value={project.name} label="Project name" onSave={(v) => projectStore.update((d) => renameProject(d, project.id, v))} />
      </div>

      <UnitsToggle value={units} onChange={(u) => projectStore.update((d) => setProjectUnits(d, project.id, u))} />

      <Card aria-label="House total">
        <h2 className="text-base font-semibold text-stone-700">House total</h2>
        {total.cost ? (
          <>
            <p className="mt-1 text-4xl font-bold tabular-nums" data-testid="house-total">
              {formatCurrency(total.cost.likely)}
            </p>
            {total.cost.low !== total.cost.high && (
              <p className="text-sm text-stone-500 tabular-nums">Likely {formatCostRange(total.cost)}</p>
            )}
            <p className="mt-2 text-base text-stone-700">
              {area(total.sqftNeeded!.likely, units)} of flooring incl. waste · {total.includedRooms} of {project.rooms.length} room
              {project.rooms.length === 1 ? "" : "s"}
            </p>
            <ul aria-label="Boxes by flooring" className="mt-2 flex flex-col gap-0.5 text-base text-stone-800 tabular-nums">
              {boxLines(total.boxesByProduct, products).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {total.anyPlaceholderPrice && (
              <p className="mt-2 text-sm text-amber-800">Includes placeholder prices, not real quotes.</p>
            )}
            <Disclaimer className="mt-3" />
          </>
        ) : (
          <p className="mt-1 text-base text-stone-600">
            {project.rooms.length === 0 ? "Add a room to start the estimate." : "No room has an estimate yet."}
          </p>
        )}
      </Card>

      {flagged.length > 0 && (
        <Notice tone="warn">
          {flagged.length === 1 ? "1 room needs" : `${flagged.length} rooms need`} photos or measurements before it&apos;s included in the
          total: {flagged.map((f) => f.room.name).join(", ")}.
        </Notice>
      )}

      <section aria-label="Rooms" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Rooms</h2>
          {!adding && <PrimaryButton onClick={() => setAdding(true)}>+ Add room</PrimaryButton>}
        </div>

        {adding && (
          <Card>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <label className="flex flex-col gap-2">
                <span className="text-base font-semibold">Room name</span>
                <input
                  autoFocus
                  aria-label="Room name"
                  placeholder="e.g. Main bedroom"
                  value={roomName}
                  maxLength={80}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="min-h-12 rounded-xl px-3 text-lg ring-1 ring-stone-300"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton type="submit">Add room</PrimaryButton>
                <SecondaryButton onClick={() => setAdding(false)}>Cancel</SecondaryButton>
              </div>
            </form>
          </Card>
        )}

        {rooms.length === 0 && !adding && (
          <Card className="text-center">
            <p className="text-base text-stone-600">No rooms yet. Add the first room to measure or photograph it.</p>
          </Card>
        )}

        <ul className="flex flex-col gap-3">
          {rooms.map(({ room, outcome, status }) => {
            const r = outcome.status === "ok" ? outcome.estimate.result : null;
            return (
              <li key={room.id}>
                <a
                  href={href({ name: r ? "result" : "room", projectId: project.id, roomId: room.id })}
                  className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 active:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-semibold">{room.name}</p>
                      <div className="mt-1">
                        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                      </div>
                    </div>
                    {r && (
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold tabular-nums">{formatCurrency(r.cost.likely)}</p>
                        <p className="text-xs text-stone-500 tabular-nums">
                          {area(r.sqftNeeded.likely, units)} · {r.boxes.likely} box{r.boxes.likely === 1 ? "" : "es"}
                        </p>
                      </div>
                    )}
                  </div>
                  {r && <p className="mt-2 text-sm text-stone-600">{productName(products, room.productId)}</p>}
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:flex-wrap">
        <LinkButton href={href({ name: "print", projectId: project.id })}>Print / save as PDF</LinkButton>
        <ConfirmDelete
          label="Delete project"
          message={`Delete "${project.name}" and its ${project.rooms.length} room${project.rooms.length === 1 ? "" : "s"}? This can't be undone.`}
          onConfirm={() => {
            for (const r of project.rooms) photoStore.clearRoom(r.id);
            projectStore.update((d) => deleteProject(d, project.id));
            navigate({ name: "projects" });
          }}
        />
      </div>
    </div>
  );
}
