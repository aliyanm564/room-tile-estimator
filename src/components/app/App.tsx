"use client";

import { useEffect, useState } from "react";
import type { Branding } from "@/lib/catalog";
import { projectStore, useAppState } from "@/lib/project/store";
import type { FlooringProduct, Settings } from "@/types";
import PrintScreen from "./PrintScreen";
import ProjectScreen from "./ProjectScreen";
import ProjectsScreen from "./ProjectsScreen";
import ResultScreen from "./ResultScreen";
import RoomScreen from "./RoomScreen";
import { href, parseHash, useRouteHash } from "./router";
import { BackLink, Card, Notice } from "./ui";

export default function App({ products, settings, branding }: { products: FlooringProduct[]; settings: Settings; branding: Branding }) {
  useState(() => projectStore.configure(products, settings));
  const state = useAppState();
  const hash = useRouteHash();
  const route = parseHash(hash);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  const header = (
    <header className="border-b border-stone-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <a href={href({ name: "projects" })} className="flex min-h-11 items-center gap-2">
          {branding.logoPath && (
            // eslint-disable-next-line @next/next/no-img-element -- static brand logo from public/
            <img src={branding.logoPath} alt="" className="h-8 w-auto" />
          )}
          <span className="text-lg font-bold text-[var(--brand)]">{branding.appName}</span>
        </a>
      </div>
    </header>
  );

  let body: React.ReactNode;
  if (!state) {
    body = <p className="text-base text-stone-600">Loading your projects…</p>;
  } else {
    const project = "projectId" in route ? state.data.projects.find((p) => p.id === route.projectId) : undefined;
    const room = project && "roomId" in route ? project.rooms.find((r) => r.id === route.roomId) : undefined;
    const notFound = (what: string, back: string, label: string) => (
      <div className="flex flex-col gap-3">
        <BackLink href={back} label={label} />
        <Card>
          <p className="text-base">This {what} doesn&apos;t exist anymore. It may have been deleted.</p>
        </Card>
      </div>
    );

    if (route.name === "projects") body = <ProjectsScreen data={state.data} products={products} settings={settings} />;
    else if (!project) body = notFound("project", href({ name: "projects" }), "Projects");
    else if (route.name === "project") body = <ProjectScreen project={project} products={products} settings={settings} />;
    else if (route.name === "print") body = <PrintScreen project={project} products={products} settings={settings} branding={branding} />;
    else if (!room) body = notFound("room", href({ name: "project", projectId: project.id }), project.name);
    else if (route.name === "room") body = <RoomScreen key={`${room.id}-${project.units}`} project={project} room={room} products={products} settings={settings} />;
    else body = <ResultScreen project={project} room={room} products={products} settings={settings} />;
  }

  return (
    <>
      {header}
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 print:max-w-none print:p-0">
        {state?.problem && (
          <Notice tone="warn" onDismiss={() => projectStore.dismissProblem()}>
            {state.problem}
          </Notice>
        )}
        {state?.saveError && <Notice tone="error">{state.saveError}</Notice>}
        {body}
      </main>
    </>
  );
}
