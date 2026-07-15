import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_ROUTE_PATHS } from "@/lib/nav-items";

const ROUTES_ROOT = join(process.cwd(), "src/app/(dashboard)");

// Every URL path under (dashboard) that actually serves a page, derived from the
// route tree itself. Route groups like "(dashboard)" don't appear in the URL.
function servedPaths(dir: string, url = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const here = entries.some((e) => e.isFile() && /^page\.tsx?$/.test(e.name)) ? [url || "/"] : [];
  const nested = entries
    .filter((e) => e.isDirectory())
    .flatMap((e) =>
      servedPaths(join(dir, e.name), e.name.startsWith("(") ? url : `${url}/${e.name}`),
    );
  return [...here, ...nested];
}

// The crumbs the top bar builds for a path are its ancestors: "/kb/admin/documents/new"
// yields "/kb/admin/documents", "/kb/admin", "/kb".
function ancestors(path: string): string[] {
  const segs = path.split("/").filter(Boolean);
  return segs.slice(0, -1).map((_, i) => `/${segs.slice(0, i + 1).join("/")}`);
}

describe("NON_ROUTE_PATHS", () => {
  const served = new Set(servedPaths(ROUTES_ROOT));

  it("covers every breadcrumb ancestor that has no page, so no crumb links to a 404", () => {
    const dead = [...served]
      .flatMap(ancestors)
      .filter((p) => !served.has(p) && !NON_ROUTE_PATHS.has(p));

    expect([...new Set(dead)]).toEqual([]);
  });

  it("lists no path that actually serves a page, which would drop a real link", () => {
    expect([...NON_ROUTE_PATHS].filter((p) => served.has(p))).toEqual([]);
  });

  it("lists no path that is not a breadcrumb ancestor at all", () => {
    const reachable = new Set([...served].flatMap(ancestors));
    expect([...NON_ROUTE_PATHS].filter((p) => !reachable.has(p))).toEqual([]);
  });
});
