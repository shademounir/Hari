// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — Read models for the /analytics/predictions dashboard (HR-only).
// Server-only. Every function returns a privacy-safe view model: names/titles
// are fine here (the route is gated to HR/Admin), but NO salary figures ever
// appear — only the derived factor contributions that drove a score.
// ─────────────────────────────────────────────────────────────────────────
import "server-only";
import { prisma } from "@/lib/prisma";
import type { FactorContribution, RiskBand } from "./departure-risk";
import {
  getActiveModelConfig,
  getPredictionCandidates,
  scoreCandidates,
} from "./data-layer";

// The projection math is pure (unit-tested in isolation); re-exported here so the
// page/components keep a single import surface for the dashboard read layer.
export {
  projectDepartures,
  PROJECTION_MIN_HEADCOUNT,
  type Projection,
  type ProjectionPoint,
} from "./projection";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

// ── Section 1: Risk map ─────────────────────────────────────────────────

export type RiskMapRow = {
  employeeId: string;
  name: string;
  title: string;
  department: string;
  score: number;
  band: RiskBand;
  factors: FactorContribution[];
  computedAt: Date | null; // null when computed live (no snapshot yet)
};

export type RiskMap = {
  rows: RiskMapRow[]; // sorted by descending score
  /** "snapshot" = read from the nightly cron; "live" = computed now (pre-first-run). */
  source: "snapshot" | "live";
  activeCount: number;
};

/**
 * The current risk board: the latest snapshot per active employee. Before the
 * first cron run there are no snapshots, so we compute the board live once (reusing
 * the same scoring path) — the dashboard is useful immediately, and the nightly
 * job takes over persistence afterward.
 */
export async function getRiskMap(asOf: Date = new Date()): Promise<RiskMap> {
  const activeCount = await prisma.employee.count({ where: { status: "ACTIVE" } });

  // Latest snapshot per employee: order by (employeeId, computedAt desc) then take
  // the first row of each employeeId group via Prisma `distinct`.
  const snaps = await prisma.departureRiskSnapshot.findMany({
    where: { employee: { status: "ACTIVE" } },
    distinct: ["employeeId"],
    orderBy: [{ employeeId: "asc" }, { computedAt: "desc" }],
    select: {
      employeeId: true,
      score: true,
      band: true,
      factors: true,
      computedAt: true,
      employee: { select: { title: true, department: true, user: { select: { name: true } } } },
    },
  });

  let rows: RiskMapRow[];
  let source: RiskMap["source"];

  if (snaps.length > 0) {
    source = "snapshot";
    rows = snaps.map((s) => ({
      employeeId: s.employeeId,
      name: s.employee.user.name,
      title: s.employee.title,
      department: s.employee.department,
      score: s.score,
      band: s.band,
      factors: (s.factors as unknown as FactorContribution[]) ?? [],
      computedAt: s.computedAt,
    }));
  } else if (activeCount > 0) {
    source = "live";
    const candidates = await getPredictionCandidates({ role: "SUPER_ADMIN", employeeId: null });
    const config = await getActiveModelConfig();
    const scored = await scoreCandidates(candidates, { asOf, config });
    rows = scored.map((s) => ({
      employeeId: s.employeeId,
      name: s.name,
      title: s.title,
      department: s.department,
      score: s.score,
      band: s.band,
      factors: s.factors,
      computedAt: null,
    }));
  } else {
    source = "live";
    rows = [];
  }

  rows.sort((a, b) => b.score - a.score);
  return { rows, source, activeCount };
}

// ── Section 3 helper: department list for the simulator ─────────────────

export async function getDepartments(): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    distinct: ["department"],
    select: { department: true },
    orderBy: { department: "asc" },
  });
  return rows.map((r) => r.department);
}

// ── Section 4: Succession planning ──────────────────────────────────────

export type SuccessionSuccessor = {
  name: string;
  title: string;
  tenureMonths: number;
  band: RiskBand;
};

export type SuccessionEntry = {
  incumbentId: string;
  incumbentName: string;
  roleTitle: string;
  department: string;
  /** Best internal successor, or null when none is obvious (→ show an alert badge). */
  successor: SuccessionSuccessor | null;
};

/**
 * For each people-manager (an active employee with active direct reports), pick
 * the strongest internal successor among their reports. Fitness rewards tenure
 * and penalizes departure risk (a flight-risk successor is no succession plan).
 * A report only qualifies if they aren't themselves HIGH-risk and have ≥12 months
 * tenure; otherwise the role has no obvious successor. Takes the score map from
 * `getRiskMap` so it doesn't recompute scores.
 */
export async function getSuccessionPlan(
  scoreByEmployee: Map<string, { score: number; band: RiskBand }>,
  asOf: Date = new Date(),
): Promise<SuccessionEntry[]> {
  const managers = await prisma.employee.findMany({
    where: { status: "ACTIVE", reports: { some: { status: "ACTIVE" } } },
    orderBy: [{ department: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      department: true,
      user: { select: { name: true } },
      reports: {
        where: { status: "ACTIVE" },
        select: { id: true, title: true, startDate: true, user: { select: { name: true } } },
      },
    },
  });

  return managers.map((m) => {
    const ranked = m.reports
      .map((r) => {
        const risk = scoreByEmployee.get(r.id);
        const tenureMonths = Math.round(monthsBetween(r.startDate, asOf));
        const score = risk?.score ?? 0;
        return {
          name: r.user.name,
          title: r.title,
          tenureMonths,
          band: risk?.band ?? ("LOW" as RiskBand),
          fitness: tenureMonths - score, // simple, explainable: seniority minus risk
        };
      })
      .sort((a, b) => b.fitness - a.fitness);

    const best = ranked[0];
    const qualifies = best && best.band !== "HIGH" && best.tenureMonths >= 12;

    return {
      incumbentId: m.id,
      incumbentName: m.user.name,
      roleTitle: m.title,
      department: m.department,
      successor: qualifies
        ? { name: best.name, title: best.title, tenureMonths: best.tenureMonths, band: best.band }
        : null,
    };
  });
}
