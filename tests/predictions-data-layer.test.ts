import { describe, expect, it } from "vitest";
import {
  jobProfileBaseline,
  DEFAULT_JOB_PROFILE_BASELINE,
} from "@/lib/predictive/data-layer";

// Pure, order-dependent lookup that feeds every risk score. A reorder of the
// JOB_PROFILE_BASELINES array silently changes baselines, so pin the behavior.
describe("jobProfileBaseline", () => {
  it("matches case-insensitively as a substring", () => {
    expect(jobProfileBaseline("Senior SALES Executive")).toBe(0.45);
    expect(jobProfileBaseline("designer")).toBe(0.5);
  });

  it("returns the first array hit, not the longest match", () => {
    // "engineer" (index 0) beats "data" (index 2), so a Data Engineer scores 0.6.
    expect(jobProfileBaseline("Data Engineer")).toBe(0.6);
  });

  it("falls back to the default for an unknown title", () => {
    expect(jobProfileBaseline("Chief Vibes Officer")).toBe(DEFAULT_JOB_PROFILE_BASELINE);
  });
});
