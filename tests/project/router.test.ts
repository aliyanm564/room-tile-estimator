import { describe, expect, it } from "vitest";
import { href, parseHash, type Route } from "@/components/app/router";

describe("hash routes", () => {
  it("round-trips every route", () => {
    const routes: Route[] = [
      { name: "projects" },
      { name: "project", projectId: "p1" },
      { name: "room", projectId: "p1", roomId: "r 2" },
      { name: "result", projectId: "p1", roomId: "r2" },
      { name: "print", projectId: "p1" },
    ];
    for (const r of routes) expect(parseHash(href(r))).toEqual(r);
  });

  it("unknown or empty hashes go to the projects list", () => {
    expect(parseHash("")).toEqual({ name: "projects" });
    expect(parseHash("#/nonsense/x")).toEqual({ name: "projects" });
    expect(parseHash("#/p/")).toEqual({ name: "projects" });
  });
});
