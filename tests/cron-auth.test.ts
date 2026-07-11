import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Mock the data layer so importing the route (which pulls Prisma via the data layer)
// doesn't require a DB — we only exercise the pure isAuthorized gate here.
import { vi } from "vitest";
vi.mock("@/lib/predictive/data-layer", () => ({ runDailyRiskScoring: vi.fn() }));

import { isAuthorized } from "@/app/api/cron/predictive-scores/route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/predictive-scores", {
    headers: auth ? { authorization: auth } : {},
  });

describe("cron predictive-scores — isAuthorized (fail-closed secret gate)", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cr3t-value-1234567890";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("rejects when CRON_SECRET is unset (fails closed)", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorized(req("Bearer s3cr3t-value-1234567890"))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isAuthorized(req())).toBe(false);
  });

  it("rejects a wrong secret of the same length without throwing", () => {
    expect(isAuthorized(req("Bearer s3cr3t-value-0000000000"))).toBe(false);
  });

  it("rejects a header of a different length (no timingSafeEqual throw)", () => {
    expect(() => isAuthorized(req("Bearer short"))).not.toThrow();
    expect(isAuthorized(req("Bearer short"))).toBe(false);
  });

  it("accepts the correct Bearer secret", () => {
    expect(isAuthorized(req("Bearer s3cr3t-value-1234567890"))).toBe(true);
  });
});
