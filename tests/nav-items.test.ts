import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, NON_ROUTE_PATHS } from "@/lib/nav-items";

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

describe("route gates match the layout that wraps them", () => {
  const served = servedPaths(ROUTES_ROOT);

  it("nothing HR needs lives under /settings, whose layout is an admin:settings umbrella", () => {
    // The bug this pins: the people admin gated itself on `employee:manage`, but
    // sat at /settings/users — and (dashboard)/settings/layout.tsx redirects
    // anyone without `admin:settings`. So HR, the exact role it was written for,
    // was bounced to "/" and the page's own gate was dead code. A page's gate
    // can never be WIDER than the layout above it; the layout always wins.
    const settingsPages = served.filter((p) => p.startsWith("/settings"));
    expect(settingsPages.length).toBeGreaterThan(0);

    // Every nav entry pointing into /settings must be admin:settings-gated (or
    // inherit that from the /settings parent), never a broader permission.
    const strays = NAV_ITEMS.flatMap((i) => [i, ...(i.children ?? [])])
      .filter((i) => i.href.startsWith("/settings"))
      .filter((i) => i.permission && i.permission !== "admin:settings");
    expect(strays.map((s) => `${s.href} (${s.permission})`)).toEqual([]);
  });

  it("the people admin is reachable by the role that owns it", () => {
    // /people is HR's, gated like /offboarding — the other employee:manage
    // surface — and deliberately outside the settings shell.
    const people = NAV_ITEMS.find((i) => i.href === "/people");
    expect(people?.permission).toBe("employee:manage");
    expect(served).toContain("/people");
    expect(served.some((p) => p.startsWith("/settings/users"))).toBe(false);

    const offboarding = NAV_ITEMS.find((i) => i.href === "/offboarding");
    expect(people?.permission).toBe(offboarding?.permission);
  });
});
