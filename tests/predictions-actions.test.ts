import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/rbac";

// Server actions read identity from the session and gate on the real RBAC matrix.
// Mock the session (to drive the role) and Prisma/data-layer (so the valid
// save path needs no DB); the AI SDK is never reached on the paths we assert.
const requireUser = vi.fn();
vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "en") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const createConfig = vi.fn(async () => ({ version: 3 }));
const updateMany = vi.fn(async () => ({ count: 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ predictiveWeightConfig: { updateMany, create: createConfig } }),
    ),
  },
}));
vi.mock("@/lib/predictive/data-layer", () => ({
  getActiveModelConfig: vi.fn(async () => ({
    weights: {},
    thresholds: { medium: 40, high: 70 },
    version: 2,
  })),
}));

import {
  saveWeightConfigAction,
  simulateRecruitmentAction,
  generateTransitionPlan,
} from "@/app/(dashboard)/analytics/predictions/actions";
import type { RiskWeights } from "@/lib/predictive/departure-risk";

function asRole(role: Role) {
  requireUser.mockResolvedValue({ id: "u1", role, employeeId: null, email: "x@hari.ma", name: "X" });
}

// Ten equal weights → sum 1.0 (valid); scale to break the sum.
const evenWeights = (): RiskWeights => ({
  seniority: 0.1,
  absenteeism: 0.1,
  review: 0.1,
  salary: 0.1,
  turnover: 0.1,
  jobProfile: 0.1,
  burnout: 0.1,
  roleStagnation: 0.1,
  dominoEffect: 0.1,
  engagement: 0.1,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveWeightConfigAction — predictions:manage + weight-sum invariant", () => {
  it("forbids a role without predictions:manage (MANAGER)", async () => {
    asRole("MANAGER");
    expect(await saveWeightConfigAction(evenWeights())).toEqual({ ok: false, error: "forbidden" });
    expect(createConfig).not.toHaveBeenCalled();
  });

  it("rejects weights that don't sum to 1 (even for HR)", async () => {
    asRole("HR_ADMIN");
    const bad = { ...evenWeights(), seniority: 0.5 }; // sum 1.4
    expect(await saveWeightConfigAction(bad)).toEqual({ ok: false, error: "invalid" });
    expect(createConfig).not.toHaveBeenCalled();
  });

  it("accepts valid weights and returns the new version", async () => {
    asRole("HR_ADMIN");
    const res = await saveWeightConfigAction(evenWeights());
    expect(res).toEqual({ ok: true, version: 3 });
    expect(updateMany).toHaveBeenCalledOnce(); // deactivates the prior active row
    expect(createConfig).toHaveBeenCalledOnce();
  });
});

describe("predictive AI actions — dashboard:read:company gate", () => {
  it("simulateRecruitmentAction forbids an unprivileged role before any model call", async () => {
    asRole("EMPLOYEE");
    const res = await simulateRecruitmentAction({
      department: "Engineering",
      count: 1,
      seniority: "MID",
      budget: 100000,
      urgency: "NORMAL",
    });
    expect(res).toEqual({ ok: false, error: "forbidden" });
  });

  it("generateTransitionPlan forbids an unprivileged role", async () => {
    asRole("MANAGER");
    const res = await generateTransitionPlan({
      incumbentTitle: "Engineering Manager",
      incumbentRisk: "HIGH",
      successors: [],
    });
    expect(res).toEqual({ ok: false, error: "forbidden" });
  });
});
