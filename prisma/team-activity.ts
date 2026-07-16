// ─────────────────────────────────────────────────────────────────────────
// SCRUM-071 Increment A — rich, DETERMINISTIC team activity for the manager
// dashboard. Seeds ~6 months of LeaveRequest history and AiEvent volume for
// manager@hari.ma's existing direct reports (no new people — the integration
// suite hardcodes the directory counts). Idempotent: guarded on aiEvent.count.
//
// Anchored to the real "today" at seed time so the dashboard's rolling windows
// (aiTurns7d / aiRefusals7d, 90-day trend, now→+45d capacity) always land on
// fresh data. Values are PRNG-seeded, so a re-seed reproduces the same shape.
//
// AiEvent is metadata-only by schema: we write role/model/token counts/codes —
// NEVER names, message content, or salary.
// ─────────────────────────────────────────────────────────────────────────
import type { AiEventKind, LeaveStatus, LeaveType, PrismaClient } from "@prisma/client";
import type { Role } from "@/lib/rbac";
// Shared with the KPI layer + test factory (relative path — the seed already
// imports src modules this way and runs under tsx, which has no `@/` alias).
import { startOfDayUtc, addDays } from "../src/lib/kpi/time";
import { mulberry32 } from "../src/lib/kpi/prng";

// Deterministic marker on every AiEvent this seed writes, so the idempotency
// guard can tell "already team-seeded" from "a real chat turn happened".
const SEED_CONVO_PREFIX = "seed-conv-";

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

type Member = {
  employeeId: string;
  userId: string;
  role: Role;
  email: string;
  status: string;
};

/** AI-usage profile per member: how chatty, and whether they drive the refusal spike. */
const AI_PROFILES: Record<string, { tier: "high" | "medium" | "low"; spike?: boolean }> = {
  "manager@hari.ma": { tier: "medium" },
  "collaborateur@hari.ma": { tier: "high", spike: true }, // recent refusal spike lives here
  "a.elmarrouni@hari.ma": { tier: "high" },
  "s.amrani@hari.ma": { tier: "low" },
  "o.alaoui@hari.ma": { tier: "low" },
  "a.mansouri@hari.ma": { tier: "low" },
};

const EVENTS_PER_ACTIVE_DAY: Record<"high" | "medium" | "low", [number, number]> = {
  high: [15, 25],
  medium: [5, 10],
  low: [1, 3],
};
const ACTIVE_DAY_PROB: Record<"high" | "medium" | "low", number> = {
  high: 0.7,
  medium: 0.4,
  low: 0.25,
};

// Realistic, type-appropriate leave reasons (French, matching the seed's context)
// instead of placeholder text. Picked deterministically via the seeded PRNG.
const LEAVE_REASONS: Record<LeaveType, string[]> = {
  VACATION: [
    "Vacances en famille",
    "Voyage à l'étranger",
    "Congés annuels",
    "Week-end prolongé",
    "Repos personnel",
    "Vacances d'été",
  ],
  SICK: [
    "Rendez-vous médical",
    "Grippe saisonnière",
    "Repos sur avis médical",
    "Consultation chez un spécialiste",
    "Migraine sévère",
  ],
  PERSONAL: [
    "Démarches administratives",
    "Événement familial",
    "Affaires personnelles",
    "Déménagement",
    "Rendez-vous personnel",
  ],
};

export async function seedTeamActivity(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<void> {
  // Idempotent guard on a marker only THIS seed writes — not any AiEvent, since a
  // real chat turn writes those too (keying off them would skip seeding on a
  // chatted-but-unseeded DB). The atomic write below sets the marker iff it fully
  // committed.
  const alreadySeeded = await prisma.aiEvent.count({
    where: { conversationId: { startsWith: SEED_CONVO_PREFIX } },
  });
  if (alreadySeeded > 0) {
    console.log("• Team activity already seeded — skipping.");
    return;
  }

  const manager = await prisma.employee.findFirst({
    where: { user: { email: "manager@hari.ma" } },
    select: { id: true, userId: true, user: { select: { role: true, email: true } } },
  });
  if (!manager) {
    console.warn("⚠ manager@hari.ma not found — skipping team activity seed.");
    return;
  }

  const reportRows = await prisma.employee.findMany({
    where: { managerId: manager.id },
    select: { id: true, userId: true, status: true, user: { select: { role: true, email: true } } },
  });

  const team: Member[] = [
    { employeeId: manager.id, userId: manager.userId, role: manager.user.role, email: manager.user.email, status: "ACTIVE" },
    ...reportRows.map((r) => ({
      employeeId: r.id,
      userId: r.userId,
      role: r.user.role,
      email: r.user.email,
      status: r.status,
    })),
  ];

  const byEmail = (email: string) => team.find((m) => m.email === email);
  const rand = mulberry32(20260703);
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pickReason = (type: LeaveType) => {
    const pool = LEAVE_REASONS[type];
    return pool[randInt(0, pool.length - 1)];
  };
  // Realistic approver notes so the /team decision-note UI has content to show.
  const REJECTION_NOTES = [
    "Période de forte activité — merci de reporter après la clôture trimestrielle.",
    "Trop de chevauchements dans l'équipe sur ces dates ; couverture insuffisante.",
    "Solde de congés insuffisant pour la durée demandée.",
    "Demande reçue trop tard pour être validée à temps.",
    "Un collègue est déjà absent sur la même semaine.",
  ];
  const APPROVAL_NOTES = [
    "Validé — pensez à documenter la passation avant votre départ.",
    "Accordé exceptionnellement, la couverture est assurée par l'équipe.",
  ];
  const pickNote = (status: LeaveStatus): string | null => {
    if (status === "REJECTED") return REJECTION_NOTES[randInt(0, REJECTION_NOTES.length - 1)];
    // A minority of approvals carry a note too.
    if (status === "APPROVED" && rand() < 0.25) return APPROVAL_NOTES[randInt(0, APPROVAL_NOTES.length - 1)];
    return null;
  };
  const today = startOfDayUtc(now);

  // ── Leave requests ────────────────────────────────────────────────────
  // Non-terminated reports are the pool for realistic leave activity.
  const leavePool = team.filter(
    (m) => m.email !== "manager@hari.ma" && m.status !== "TERMINATED",
  );
  const types: LeaveType[] = ["VACATION", "SICK", "PERSONAL"];
  const leave: {
    employeeId: string;
    type: LeaveType;
    startDate: Date;
    endDate: Date;
    days: number;
    reason: string | null;
    status: LeaveStatus;
    decisionNote: string | null;
    approverId: string | null;
    createdAt: Date;
  }[] = [];

  const pushLeave = (
    m: Member,
    type: LeaveType,
    start: Date,
    lengthDays: number,
    status: LeaveStatus,
    reason: string | null,
    decisionNote: string | null = null,
  ) => {
    const end = addDays(start, lengthDays - 1);
    leave.push({
      employeeId: m.employeeId,
      type,
      startDate: start,
      endDate: end,
      days: lengthDays,
      reason,
      status,
      // Rejections always carry a note (schema/UX contract); some approvals do too.
      decisionNote: decisionNote ?? pickNote(status),
      approverId: status === "APPROVED" || status === "REJECTED" ? manager.id : null,
      // requested ~2 weeks before it starts, but never in the future
      createdAt: new Date(Math.min(addDays(start, -14).getTime(), today.getTime())),
    });
  };

  // 1) Scattered past history per member: 2–3 requests, mostly decided.
  for (const m of leavePool) {
    const count = randInt(2, 3);
    for (let i = 0; i < count; i++) {
      const startOffset = -randInt(20, 170); // 3 weeks–~6 months ago
      const len = randInt(1, 4);
      const type = types[randInt(0, 2)];
      const roll = rand();
      const status: LeaveStatus = roll < 0.65 ? "APPROVED" : roll < 0.85 ? "REJECTED" : "PENDING";
      pushLeave(m, type, addDays(today, startOffset), len, status, pickReason(type));
    }
  }

  // 2) Past holiday cluster ~3 months back: 3 members overlap the same week (APPROVED).
  const pastCluster = addDays(today, -90);
  for (const email of ["collaborateur@hari.ma", "a.elmarrouni@hari.ma", "s.amrani@hari.ma"]) {
    const m = byEmail(email);
    if (m) pushLeave(m, "VACATION", addDays(pastCluster, randInt(0, 1)), randInt(3, 5), "APPROVED", "Congé de fin d'année");
  }

  // 3) Edge case: a request from an employee whose status is ON_LEAVE, spanning today.
  const onLeave = leavePool.find((m) => m.status === "ON_LEAVE");
  if (onLeave) pushLeave(onLeave, "SICK", addDays(today, -3), 8, "APPROVED", "Arrêt maladie prolongé");

  // 4) Near-future APPROVED cluster overlapping now→+45d: 4 members share a week
  //    → 4/8 = 50% out, well above the 30% capacity risk threshold (heatmap fodder).
  const futureCluster = addDays(today, randInt(14, 21));
  for (const email of ["collaborateur@hari.ma", "a.elmarrouni@hari.ma", "s.amrani@hari.ma", "o.alaoui@hari.ma"]) {
    const m = byEmail(email);
    if (m) pushLeave(m, "VACATION", addDays(futureCluster, randInt(0, 1)), randInt(4, 6), "APPROVED", "Congés programmés");
  }

  // 5) Recent PENDING requests so the approvals queue + pendingRequests KPI are non-empty.
  for (const email of ["collaborateur@hari.ma", "s.amrani@hari.ma", "a.elmarrouni@hari.ma"]) {
    const m = byEmail(email);
    if (m) {
      const ty = types[randInt(0, 2)];
      pushLeave(m, ty, addDays(today, randInt(3, 25)), randInt(1, 3), "PENDING", pickReason(ty));
    }
  }

  // ── AiEvents (metadata only) ──────────────────────────────────────────
  type EventRow = {
    conversationId: string;
    userId: string;
    role: Role;
    kind: AiEventKind;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    stepCount: number;
    finishReason: string;
    toolName: string | null;
    errorCode: string | null;
    createdAt: Date;
  };
  const events: EventRow[] = [];
  let convo = 0;
  const TOOLS = ["getEmployeeDirectory", "getPendingApprovals", "getPayslip", "getLeaveBalance"];

  const emit = (m: Member, when: Date, kind: AiEventKind) => {
    const input = randInt(200, 1400);
    const output = randInt(80, 900);
    events.push({
      conversationId: `${SEED_CONVO_PREFIX}${convo++}`,
      userId: m.userId,
      role: m.role,
      kind,
      model: "gpt-oss-120b",
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      latencyMs: randInt(350, 4200),
      stepCount: kind === "TOOL_CALL" ? randInt(2, 4) : 1,
      finishReason: kind === "TOOL_CALL" ? "tool-calls" : kind === "ERROR" ? "error" : "stop",
      toolName: kind === "TOOL_CALL" || kind === "REFUSAL" ? TOOLS[randInt(0, TOOLS.length - 1)] : null,
      errorCode: kind === "ERROR" ? "rate_limited" : null,
      createdAt: when,
    });
  };

  const kindForRoll = (r: number): AiEventKind =>
    r < 0.8 ? "TURN" : r < 0.92 ? "TOOL_CALL" : r < 0.97 ? "REFUSAL" : "ERROR";

  for (let offset = -180; offset <= 0; offset++) {
    const day = addDays(today, offset);
    if (isWeekend(day)) continue;
    for (const m of team) {
      const profile = AI_PROFILES[m.email];
      if (!profile) continue;
      if (rand() >= ACTIVE_DAY_PROB[profile.tier]) continue; // not an active day
      const [lo, hi] = EVENTS_PER_ACTIVE_DAY[profile.tier];
      const n = randInt(lo, hi);
      for (let i = 0; i < n; i++) {
        // spread events through working hours; keep them within the same UTC day
        const when = new Date(day.getTime() + randInt(8, 18) * 3600_000 + randInt(0, 59) * 60_000);
        emit(m, when, kindForRoll(rand()));
      }
    }
  }

  // Deliberate REFUSAL spike in the last 10 days for the flagged high-volume user,
  // so the anomaly engine + refusal-rate badge (Increment D) have a real signal.
  const spiker = team.find((m) => AI_PROFILES[m.email]?.spike);
  if (spiker) {
    for (let offset = -9; offset <= 0; offset++) {
      const day = addDays(today, offset);
      if (isWeekend(day)) continue;
      const n = randInt(2, 4);
      for (let i = 0; i < n; i++) {
        emit(spiker, new Date(day.getTime() + randInt(9, 17) * 3600_000), "REFUSAL");
      }
    }
    // Guarantee a couple of very recent TURN + REFUSAL events (last 7d windows).
    emit(spiker, new Date(today.getTime() + 10 * 3600_000), "TURN");
    emit(spiker, new Date(today.getTime() + 11 * 3600_000), "REFUSAL");
  }

  // Atomic write: leaves + all AiEvent batches commit together, so an interrupted
  // run leaves nothing (no half-seed to duplicate leaves on re-run). The AiEvents
  // carry the SEED_CONVO_PREFIX marker the guard above checks.
  await prisma.$transaction([
    prisma.leaveRequest.createMany({ data: leave }),
    ...Array.from({ length: Math.ceil(events.length / 1000) }, (_, i) =>
      prisma.aiEvent.createMany({ data: events.slice(i * 1000, i * 1000 + 1000) }),
    ),
  ]);

  console.log(
    `• Seeded team activity: ${leave.length} leave requests, ${events.length} AI events ` +
      `for ${team.length} team members (manager@hari.ma).`,
  );
}
