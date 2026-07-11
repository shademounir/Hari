// SCRUM-099 — engagement demo data. Backfills 4 weeks of EngagementSnapshot per
// active employee (so momentum sparklines work immediately) plus QualitativeSignal
// rows from managers. Quadrants are deliberately distributed (mostly ENGAGED, a
// few BURNOUT / BOREOUT / STRAINED), and each snapshot's factor JSON comes from the
// REAL scorer so the XAI waterfall reconciles. Deterministic (seeded PRNG) +
// idempotent (guarded on the snapshot count).
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  computeEngagement,
  DEFAULT_ENGAGEMENT_CONFIG,
  type EngagementInput,
} from "../src/lib/engagement/engagement";

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Band from a score, matching the pure core's thresholds.
function bandOf(score: number): "GREEN" | "YELLOW" | "ORANGE" | "RED" {
  const t = DEFAULT_ENGAGEMENT_CONFIG.thresholds;
  if (score >= t.greenMin) return "GREEN";
  if (score >= t.yellowMin) return "YELLOW";
  if (score >= t.orangeMin) return "ORANGE";
  return "RED";
}

type Persona = "ENGAGED" | "BURNOUT" | "BOREOUT" | "STRAINED";

// [min,max] range per signal, per persona. Verified to land in the target quadrant.
type Range = [number, number];
type PersonaSpec = {
  absenceSpike: Range;
  unplannedLeaveCount: Range;
  taskLatencyRatio: Range;
  afterHoursRatio: Range;
  unusedPtoRatio: Range;
  assistantUsageDrop: Range;
  daysSinceLastOneOnOne: Range;
  monthsInRole: Range;
  workQuality: Range;
  participation: Range;
  peerInteraction: Range;
  /** Weekly momentum: negative = declining (past scores were higher). */
  trend: Range;
};

const SPECS: Record<Persona, PersonaSpec> = {
  ENGAGED: {
    absenceSpike: [0, 0.2], unplannedLeaveCount: [0, 1], taskLatencyRatio: [1.0, 1.1],
    afterHoursRatio: [0.03, 0.15], unusedPtoRatio: [0.05, 0.25], assistantUsageDrop: [0, 0.2],
    daysSinceLastOneOnOne: [7, 24], monthsInRole: [3, 20], workQuality: [4, 5],
    participation: [4, 5], peerInteraction: [4, 5], trend: [-1, 3],
  },
  BURNOUT: {
    absenceSpike: [0.6, 1.0], unplannedLeaveCount: [2, 5], taskLatencyRatio: [1.5, 2.0],
    afterHoursRatio: [0.4, 0.6], unusedPtoRatio: [0.6, 0.9], assistantUsageDrop: [0.5, 0.8],
    daysSinceLastOneOnOne: [85, 130], monthsInRole: [30, 55], workQuality: [2, 3],
    participation: [2, 3], peerInteraction: [2, 3], trend: [-6, -2],
  },
  BOREOUT: {
    absenceSpike: [0, 0.2], unplannedLeaveCount: [0, 1], taskLatencyRatio: [1.0, 1.1],
    afterHoursRatio: [0.03, 0.15], unusedPtoRatio: [0.1, 0.3], assistantUsageDrop: [0.6, 0.85],
    daysSinceLastOneOnOne: [90, 130], monthsInRole: [48, 72], workQuality: [3, 3],
    participation: [2, 3], peerInteraction: [2, 3], trend: [-2, 0.5],
  },
  STRAINED: {
    absenceSpike: [0.6, 0.9], unplannedLeaveCount: [2, 4], taskLatencyRatio: [1.5, 1.9],
    afterHoursRatio: [0.45, 0.6], unusedPtoRatio: [0.6, 0.85], assistantUsageDrop: [0, 0.2],
    daysSinceLastOneOnOne: [7, 24], monthsInRole: [3, 18], workQuality: [4, 5],
    participation: [4, 5], peerInteraction: [4, 5], trend: [-4, -1],
  },
};

/** Distribution: a colorful but realistic spread (majority ENGAGED). */
function pickPersona(roll: number): Persona {
  if (roll < 0.1) return "BURNOUT";
  if (roll < 0.2) return "BOREOUT";
  if (roll < 0.32) return "STRAINED";
  return "ENGAGED";
}

const SNAPSHOT_DAYS = 28; // 4 weeks
const SNAPSHOT_EVERY = 2; // one snapshot every 2 days → 14 points

export async function seedEngagement(prisma: PrismaClient): Promise<void> {
  if ((await prisma.engagementSnapshot.count()) > 0) {
    console.log("• Engagement data already seeded — skipping.");
    return;
  }

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, startDate: true, manager: { select: { userId: true } } },
  });
  if (employees.length === 0) {
    console.log("• No active employees — skipping engagement seed.");
    return;
  }

  const NOW = new Date();
  const snapshots: Prisma.EngagementSnapshotCreateManyInput[] = [];
  const quals: Prisma.QualitativeSignalCreateManyInput[] = [];
  const period = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
  const bandTally: Record<string, number> = {};

  for (const e of employees) {
    const rng = mulberry32(hashSeed(`eng:${e.id}`));
    const pick = ([lo, hi]: Range) => lo + rng() * (hi - lo);
    const persona = pickPersona(rng());
    const spec = SPECS[persona];

    const tenureDays = Math.max(0, (NOW.getTime() - e.startDate.getTime()) / DAY_MS);
    const wq = Math.round(pick(spec.workQuality));
    const pa = Math.round(pick(spec.participation));
    const pi = Math.round(pick(spec.peerInteraction));

    // The CURRENT (latest) reading — computed by the REAL scorer so factors match.
    const input: EngagementInput = {
      tenureDays,
      absenceSpike: Number(pick(spec.absenceSpike).toFixed(2)),
      unplannedLeaveCount: Math.round(pick(spec.unplannedLeaveCount)),
      taskLatencyRatio: Number(pick(spec.taskLatencyRatio).toFixed(2)),
      afterHoursRatio: Number(pick(spec.afterHoursRatio).toFixed(2)),
      unusedPtoRatio: Number(pick(spec.unusedPtoRatio).toFixed(2)),
      assistantUsageDrop: Number(pick(spec.assistantUsageDrop).toFixed(2)),
      daysSinceLastOneOnOne: Math.round(pick(spec.daysSinceLastOneOnOne)),
      monthsInRole: Math.round(pick(spec.monthsInRole)),
      workQuality: wq,
      participation: pa,
      peerInteraction: pi,
    };
    const base = computeEngagement(input, DEFAULT_ENGAGEMENT_CONFIG);
    const trend = Number(pick(spec.trend).toFixed(1)); // points/week

    // 4 weeks of history. The latest (daysAgo=0) is `base.score`; earlier days
    // follow the trend + a little noise so the sparkline reads realistically.
    for (let daysAgo = SNAPSHOT_DAYS; daysAgo >= 0; daysAgo -= SNAPSHOT_EVERY) {
      const noise = (rng() - 0.5) * 4;
      const score = clamp(Math.round(base.score - (trend / 7) * daysAgo + noise), 0, 100);
      const computedAt = new Date(NOW.getTime() - daysAgo * DAY_MS);
      snapshots.push({
        employeeId: e.id,
        score,
        band: bandOf(score),
        exhaustion: base.exhaustion,
        disengagement: base.disengagement,
        quadrant: base.quadrant,
        factors: base.factors as unknown as Prisma.InputJsonValue,
        momentum: trend,
        confidence: base.confidence,
        dataCoverage: base.dataCoverage,
        weightVersion: 0,
        computedAt,
      });
    }

    // Qualitative rating from the employee's manager (proves the qualitative layer).
    if (e.manager?.userId) {
      quals.push({
        employeeId: e.id,
        raterId: e.manager.userId,
        period,
        workQuality: wq,
        participation: pa,
        peerInteraction: pi,
      });
    }

    bandTally[base.band] = (bandTally[base.band] ?? 0) + 1;
  }

  await prisma.engagementSnapshot.createMany({ data: snapshots });
  if (quals.length) await prisma.qualitativeSignal.createMany({ data: quals });

  console.log(
    `• Seeded engagement: ${snapshots.length} snapshots for ${employees.length} employees ` +
      `(GREEN ${bandTally.GREEN ?? 0} / YELLOW ${bandTally.YELLOW ?? 0} / ORANGE ${bandTally.ORANGE ?? 0} / RED ${bandTally.RED ?? 0}), ` +
      `${quals.length} qualitative ratings.`,
  );
}
