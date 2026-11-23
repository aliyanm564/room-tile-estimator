// Hash routes (#/p/<id>/r/<id>): back/forward work, links can be bookmarked, everything is client-side
// and works offline. No server routes needed for the screens.

import { useSyncExternalStore } from "react";

export type Route =
  | { name: "projects" }
  | { name: "project"; projectId: string }
  | { name: "room"; projectId: string; roomId: string }
  | { name: "result"; projectId: string; roomId: string }
  | { name: "print"; projectId: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "p" && parts[1]) {
    if (parts[2] === "print") return { name: "print", projectId: parts[1] };
    if (parts[2] === "r" && parts[3]) {
      return parts[4] === "result"
        ? { name: "result", projectId: parts[1], roomId: parts[3] }
        : { name: "room", projectId: parts[1], roomId: parts[3] };
    }
    return { name: "project", projectId: parts[1] };
  }
  return { name: "projects" };
}

export function href(route: Route): string {
  const e = encodeURIComponent;
  switch (route.name) {
    case "projects":
      return "#/";
    case "project":
      return `#/p/${e(route.projectId)}`;
    case "room":
      return `#/p/${e(route.projectId)}/r/${e(route.roomId)}`;
    case "result":
      return `#/p/${e(route.projectId)}/r/${e(route.roomId)}/result`;
    case "print":
      return `#/p/${e(route.projectId)}/print`;
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route);
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRouteHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}
