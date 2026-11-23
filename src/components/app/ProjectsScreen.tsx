"use client";

import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { addProject, createProject, houseTotal, newId, roomOutcome, type AppData } from "@/lib/project/model";
import { photoStore } from "@/lib/project/photos";
import { createSampleProject } from "@/lib/project/sample";
import { projectStore } from "@/lib/project/store";
import type { FlooringProduct, Settings } from "@/types";
import { href, navigate } from "./router";
import { Card, ConfirmDelete, PrimaryButton, SecondaryButton } from "./ui";

export default function ProjectsScreen({ data, products, settings }: { data: AppData; products: FlooringProduct[]; settings: Settings }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function create() {
    const id = newId();
    projectStore.update((d) => createProject(d, name || "New project", settings.defaultUnits, id));
    setCreating(false);
    setName("");
    navigate({ name: "project", projectId: id });
  }

  function loadSample() {
    const sample = createSampleProject(products, settings, settings.defaultUnits);
    projectStore.update((d) => addProject(d, sample));
    navigate({ name: "project", projectId: sample.id });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Projects</h1>
        {!creating && <PrimaryButton onClick={() => setCreating(true)}>+ New project</PrimaryButton>}
      </div>

      {creating && (
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="text-base font-semibold">Project name</span>
              <input
                autoFocus
                aria-label="Project name"
                placeholder="e.g. 24 Maple Street"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="min-h-12 rounded-xl px-3 text-lg ring-1 ring-stone-300"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit">Create project</PrimaryButton>
              <SecondaryButton onClick={() => setCreating(false)}>Cancel</SecondaryButton>
            </div>
          </form>
        </Card>
      )}

      {data.projects.length === 0 && !creating ? (
        <Card className="text-center">
          <h2 className="text-lg font-semibold">No projects yet</h2>
          <p className="mt-1 text-base text-stone-600">
            Create a project for each house or job, then add its rooms one by one.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <PrimaryButton onClick={() => setCreating(true)}>+ New project</PrimaryButton>
            <SecondaryButton onClick={loadSample}>Load sample project</SecondaryButton>
          </div>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Projects">
          {data.projects.map((p) => {
            const total = houseTotal(p.rooms.map((r) => ({ productId: r.productId, outcome: roomOutcome(r, products, settings) })));
            return (
              <li key={p.id}>
                <a
                  href={href({ name: "project", projectId: p.id })}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 active:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="break-words text-lg font-semibold">{p.name}</p>
                    <p className="text-sm text-stone-600">
                      {p.rooms.length === 0 ? "No rooms yet" : `${p.rooms.length} room${p.rooms.length === 1 ? "" : "s"}`}
                      {total.pendingRooms > 0 && p.rooms.length > 0 && ` · ${total.pendingRooms} need${total.pendingRooms === 1 ? "s" : ""} input`}
                      {` · updated ${new Date(p.updatedAt).toLocaleDateString("en-CA")}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {total.cost ? (
                      <>
                        <p className="text-lg font-bold tabular-nums">{formatCurrency(total.cost.likely)}</p>
                        <p className="text-xs text-stone-500">{formatNumber(total.sqftNeeded!.likely)} sq ft</p>
                      </>
                    ) : (
                      <span className="text-sm text-stone-500">No estimate yet</span>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {data.projects.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t border-stone-200 pt-4">
          <SecondaryButton onClick={loadSample}>Load sample project</SecondaryButton>
          <ConfirmDelete
            label="Delete all saved data"
            message="Delete every project and room saved in this browser? This can't be undone."
            onConfirm={() => {
              photoStore.clearAll();
              projectStore.resetAll();
            }}
          />
        </div>
      )}
    </div>
  );
}
