// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — 12-month departure projection. PURE + dependency-free (no Prisma,
// no server-only) so it unit-tests in isolation. Kept separate from the
// server-only dashboard read layer, which re-exports it for the page.
// ─────────────────────────────────────────────────────────────────────────

export type ProjectionPoint = { monthIndex: number; expected: number; cumulative: number };
export type Projection = { points: ProjectionPoint[]; totalExpected: number };

/** Minimum active headcount before the projection is statistically meaningful. */
export const PROJECTION_MIN_HEADCOUNT = 20;

/**
 * Project expected departures month-by-month from current risk scores. Each score
 * is read as an annual departure probability p = score/100; that converts to a
 * constant monthly hazard h = 1−(1−p)^(1/12), applied to a decaying survival curve
 * so higher-risk people weight earlier months. Expected departures in a month =
 * Σ survivorᵢ·hazardᵢ. Transparent and dependency-free (no black box).
 */
export function projectDepartures(scores: number[], months = 12): Projection {
  const survivors = scores.map(() => 1);
  const hazards = scores.map((s) => {
    const p = Math.max(0, Math.min(1, s / 100));
    return 1 - Math.pow(1 - p, 1 / 12);
  });

  const points: ProjectionPoint[] = [];
  let cumulative = 0;
  for (let m = 1; m <= months; m++) {
    let expected = 0;
    for (let i = 0; i < scores.length; i++) {
      const dep = survivors[i] * hazards[i];
      expected += dep;
      survivors[i] -= dep;
    }
    cumulative += expected;
    points.push({ monthIndex: m, expected, cumulative });
  }
  return { points, totalExpected: cumulative };
}
