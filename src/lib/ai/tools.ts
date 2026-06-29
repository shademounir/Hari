// ─────────────────────────────────────────────────────────────────────────
// AI tools. Authorization is enforced in code, never in the prompt — full
// contract in docs/architecture/authorization-invariants.md. In short:
//   • Identity is the closed-over `caller` (from the session), never a tool
//     argument — "self" tools take no id.
//   • `buildHrTools` advertises ONLY the tools a role may use (TOOL_CATALOGUE),
//     so an out-of-scope tool is never offered. Per-tool can()/scope checks
//     below are defense in depth; every model-supplied id is authorized
//     server-side against the caller's scope.
//   • Scope refusals return `{ refused }` — silent: the agent works with the
//     authorized data and the UI shows nothing. Operational errors return
//     `{ error }` (shown). All reads go through the role-scoped lib/hr layer.
// ─────────────────────────────────────────────────────────────────────────
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can, PERMISSION_LABELS, type Permission, type Role } from "@/lib/rbac";
import {
  getEmployeeDirectory,
  getLeaveBalances,
  getPayslip,
  getPendingApprovals,
} from "@/lib/hr";
import { searchHandbook } from "@/lib/rag";

export type ToolCaller = {
  role: Role;
  employeeId: string | null;
  name: string;
};

// A scope refusal: the agent relays `message`, the UI renders nothing (vs.
// `{ error }`, an operational problem the UI does show).
type Refusal = { refused: true; message: string };
function refused(message: string): Refusal {
  return { refused: true, message };
}

// An operational error the UI DOES render. `error` is a readable English string
// the model can relay (it answers in the user's language); `errorCode` lets the
// UI render a localized card instead of the raw English (key: tools.errors.<code>).
type Failure = { error: string; errorCode: string };
function fail(errorCode: string, message: string): Failure {
  return { error: message, errorCode };
}

/**
 * Run `fn` only if the caller holds `permission`, else return a silent refusal.
 * Defense in depth: `buildHrTools` already declines to advertise a tool the role
 * can't use, so for a correctly-configured role this branch is never reached.
 */
function withPermission<I, O>(
  caller: ToolCaller,
  permission: Permission,
  fn: (input: I) => Promise<O>,
): (input: I) => Promise<O | Refusal> {
  return async (input: I) => {
    if (!can(caller.role, permission)) {
      return refused(`That action isn't available to your role (needs "${PERMISSION_LABELS[permission]}").`);
    }
    return fn(input);
  };
}

// Case-insensitive enum: models sometimes emit "vacation"/"approve" — uppercase
// before validating so we don't hand the user a spurious tool error.
function ciEnum<const T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase() : v),
    z.enum(values),
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Parse a strict YYYY-MM-DD at UTC midnight, or null for a non-date OR an
// impossible calendar date. V8 silently ROLLS bad days forward ("2026-06-31"
// → Jul 1, "2026-02-30" → Mar 2) and only rejects bad months, so we round-trip
// the result and reject anything that didn't survive unchanged.
function parseUtcDate(s: string): Date | null {
  if (!ISO_DATE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10) === s ? d : null;
}

// Inclusive day count, or an error string if the range is malformed/reversed —
// so a model passing a non-date or swapped dates fails loudly instead of
// silently recording a 1-day request.
function leaveDays(start: string, end: string): number | Failure {
  const startD = parseUtcDate(start);
  const endD = parseUtcDate(end);
  if (!startD || !endD) {
    return fail("date_invalid", "Dates must be a valid calendar date in YYYY-MM-DD.");
  }
  if (endD < startD) {
    return fail("date_range_reversed", "End date must be on or after the start date.");
  }
  return Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1;
}

/**
 * The full tool surface for a caller. NOT exported — callers go through
 * `buildHrTools`, which advertises only the subset the role may use.
 */
function buildAllHrTools(caller: ToolCaller, timezone = "UTC") {
  // Only callers who can read anyone's pay get a target parameter; everyone else
  // gets a self-only payslip tool with no `employeeId` field — so the agent
  // can't even attempt to query another person's payslip.
  const canReadAnyPayslip = can(caller.role, "payslip:read:any");

  // Running citation counter, shared across every searchHandbook call in THIS
  // request (the tools object lives for the whole multi-step stream). It makes
  // `ref` globally unique within a turn — so two handbook searches yield 1..4
  // then 5..8, the model cites distinct numbers, and the inline [n] links and the
  // source cards can never collide on a reused number.
  let citationBase = 0;

  return {
    // ── Calendar utilities (no auth, no UI — deterministic date helpers) ─
    getCurrentDateTime: tool({
      description:
        "Get the current date, time, and weekday in the organization's timezone. The date is also in your system prompt; use this if you need the live time or want to double-check.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        // Everything is reported in the ORG timezone — the same zone the system
        // prompt declares as the source of truth for "today" — so the model never
        // sees a date/weekday/zone that contradicts the prompt. en-CA → YYYY-MM-DD.
        return {
          date: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now),
          weekday: now.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone }),
          time: now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone,
          }),
          timeZone: timezone,
        };
      },
    }),

    getDateInfo: tool({
      description:
        "Get the weekday and weekend status of a specific calendar date. Use it to VERIFY the day of week before stating it (e.g. confirm '2026-06-29' really is a Monday).",
      inputSchema: z.object({
        date: z.string().describe("A date in YYYY-MM-DD."),
      }),
      execute: async ({ date }) => {
        const d = parseUtcDate(date);
        if (!d) return { error: "Date must be a valid calendar date in YYYY-MM-DD." };
        const dow = d.getUTCDay();
        return {
          date,
          weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
          isWeekend: dow === 0 || dow === 6,
        };
      },
    }),

    businessDaysBetween: tool({
      description:
        "Count working days (Mon–Fri, inclusive of both ends) in a date range, alongside the total calendar days. Use it to tell the user how many working days a leave range actually spans.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date, YYYY-MM-DD"),
        endDate: z.string().describe("End date, YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const start = parseUtcDate(startDate);
        const end = parseUtcDate(endDate);
        if (!start || !end) {
          return { error: "Dates must be a valid calendar date in YYYY-MM-DD." };
        }
        if (end < start) return { error: "End date must be on or after the start date." };

        let businessDays = 0;
        const cur = new Date(start);
        while (cur <= end) {
          const dow = cur.getUTCDay();
          if (dow !== 0 && dow !== 6) businessDays++;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        const calendarDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        return { startDate, endDate, calendarDays, businessDays };
      },
    }),

    // ── RAG over the handbook ───────────────────────────────────────────
    searchHandbook: tool({
      description:
        "Search the company employee handbook for POLICIES and rules (leave, benefits, conduct, remote work, etc.). Use this for any 'what is our policy / are we allowed to / how does X work' question, and cite the returned sections. This returns company-wide rules — NOT the current user's personal data (for their own balance use getLeaveBalances, for their pay use getPayslip).",
      inputSchema: z.object({
        query: z.string().describe("The policy question or topic to look up."),
      }),
      execute: withPermission(caller, "handbook:read", async ({ query }) => {
        try {
          const hits = await searchHandbook(query, 4, caller);
          // Attach a stable, turn-global citation number and the canonical reader
          // URL (built server-side from the DB) so the UI can render
          // hallucination-proof deep links — the model only ever emits the number.
          const results = hits.map((h, i) => ({
            ...h,
            ref: citationBase + i + 1,
            url: `/kb/${h.collectionSlug}/${h.articleSlug}${h.anchor ? `#${h.anchor}` : ""}`,
          }));
          citationBase += results.length; // next search continues the sequence
          return { query, results };
        } catch (e) {
          console.error("searchHandbook failed:", e);
          // Omit `results` entirely on failure: a JSON-reading model must not mistake
          // an outage for an empty handbook (and answer from memory). Distinguish a
          // model/dimension misconfig from a missing key / unseeded handbook.
          const msg = e instanceof Error ? e.message : String(e);
          const dimMismatch = /dimension/i.test(msg);
          return dimMismatch
            ? fail(
                "handbook_dim_mismatch",
                "Handbook search is misconfigured: the embedding model's output size doesn't match the database. Check EMBEDDING_MODEL.",
              )
            : fail(
                "handbook_unavailable",
                "Handbook search is unavailable — check the embedding provider key and re-seed.",
              );
        }
      }),
    }),

    // ── Directory (role-scoped rows) ────────────────────────────────────
    getEmployeeDirectory: tool({
      description:
        "List PEOPLE the current user is allowed to see (self, team, or whole company depending on role) — with their title, department, location, manager, and contact details. Optionally filter by name, department, or title. Use this for 'who is / who reports to / how do I contact / show me the team' questions. Returns people/org info only — NOT leave balances (getLeaveBalances) or pay (getPayslip).",
      inputSchema: z.object({
        filter: z
          .string()
          .nullish()
          .describe("Optional case-insensitive substring to filter by."),
      }),
      execute: withPermission(caller, "directory:read:self", async ({ filter }) => {
        let people = await getEmployeeDirectory(caller);
        if (filter) {
          const f = filter.toLowerCase();
          people = people.filter((p) =>
            [p.name, p.department, p.title].some((v) =>
              v.toLowerCase().includes(f),
            ),
          );
        }
        return { count: people.length, people };
      }),
    }),

    // ── Leave balances ──────────────────────────────────────────────────
    getLeaveBalances: tool({
      description:
        "Get the current user's remaining time-off balances — how many vacation, sick, and personal days they have left. Use this for ANY question about vacation/PTO/leave days remaining or used (e.g. \"how many vacation days do I have left?\").",
      inputSchema: z.object({}),
      execute: withPermission(caller, "leave:read:self", async () => {
        if (!caller.employeeId) return { balances: [] };
        const balances = await getLeaveBalances(caller.employeeId);
        return { balances };
      }),
    }),

    // ── Request time off ────────────────────────────────────────────────
    requestTimeOff: tool({
      description:
        "Submit (create) a NEW time-off request for the current user. Dates are YYYY-MM-DD. This is a write action — it does NOT show existing balances (use getLeaveBalances to check days left first). Confirm the exact dates and type with the user before submitting.",
      inputSchema: z.object({
        type: ciEnum(["VACATION", "SICK", "PERSONAL"]),
        startDate: z.string().describe("Start date, YYYY-MM-DD"),
        endDate: z.string().describe("End date, YYYY-MM-DD"),
        reason: z.string().nullish(),
      }),
      execute: withPermission(
        caller,
        "leave:request",
        async ({ type, startDate, endDate, reason }) => {
          if (!caller.employeeId)
            return fail("no_employee_profile", "No employee profile linked to this account.");
          const days = leaveDays(startDate, endDate);
          if (typeof days !== "number") return days; // { error, errorCode }
          const created = await prisma.leaveRequest.create({
            data: {
              employeeId: caller.employeeId,
              type,
              startDate: new Date(startDate),
              endDate: new Date(endDate),
              days,
              reason,
              status: "PENDING",
            },
          });
          return {
            request: {
              id: created.id,
              type,
              startDate,
              endDate,
              days,
              reason: reason ?? null,
              status: "PENDING" as const,
            },
          };
        },
      ),
    }),

    // ── List pending approvals (manager / HR) ───────────────────────────
    listPendingApprovals: tool({
      description:
        "List OTHER people's time-off requests that are awaiting the current user's approval (their direct reports, or everyone for HR/admins). This is for reviewing/approving OTHERS' requests — not the current user's own balance (getLeaveBalances) or for submitting their own request (requestTimeOff).",
      inputSchema: z.object({}),
      execute: withPermission(caller, "leave:approve", async () => {
        const pending = await getPendingApprovals(caller);
        return { count: pending.length, pending };
      }),
    }),

    // ── Approve / reject (manager / HR) ─────────────────────────────────
    approveLeave: tool({
      description:
        "Approve or reject a pending time-off request by id. Use listPendingApprovals first to get ids.",
      inputSchema: z.object({
        requestId: z.string(),
        decision: ciEnum(["APPROVE", "REJECT"]),
      }),
      execute: withPermission(caller, "leave:approve", async ({ requestId, decision }) => {
        const req = await prisma.leaveRequest.findUnique({
          where: { id: requestId },
          include: { employee: { include: { user: { select: { name: true } } } } },
        });
        if (!req) return fail("request_not_found", "Request not found.");

        // Managers may only act on their own reports. (A manager is offered this
        // tool, but a requestId outside their team is still refused here.)
        const companyWide = can(caller.role, "directory:read:all");
        if (!companyWide && req.employee.managerId !== caller.employeeId) {
          return refused("That request is for someone outside your team, so you can't action it.");
        }

        // Only act on PENDING requests — re-approving would double-deduct the
        // balance, and reverting an APPROVED request would need a refund path.
        if (req.status !== "PENDING") {
          return fail(
            "request_not_pending",
            `Request is already ${req.status.toLowerCase()} and can't be changed.`,
          );
        }

        const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
        await prisma.leaveRequest.update({
          where: { id: requestId },
          data: { status, approverId: caller.employeeId },
        });

        // Deduct balance on approval.
        if (status === "APPROVED") {
          await prisma.leaveBalance.updateMany({
            where: { employeeId: req.employeeId, type: req.type },
            data: { usedDays: { increment: req.days } },
          });
        }

        return {
          result: {
            id: req.id,
            employeeName: req.employee.user.name,
            type: req.type,
            days: req.days,
            status,
          },
        };
      }),
    }),

    // ── Payslip ─────────────────────────────────────────────────────────
    // Role-aware: elevated callers get an `employeeId` target; everyone else
    // gets a self-only tool with no target field, so the agent only ever has
    // access to its own pay — no out-of-scope query is even expressible.
    getPayslip: canReadAnyPayslip
      ? tool({
          description:
            "Get a PAY summary (gross pay, tax, net pay — money only, NOT leave/vacation balances) for an employee you can see. Omit employeeId for your own; to view someone else's, pass an employeeId returned by getEmployeeDirectory (never a guessed one).",
          inputSchema: z.object({
            employeeId: z
              .string()
              .nullish()
              .describe("An employeeId returned by getEmployeeDirectory — omit for your own."),
          }),
          // Wrapped in withPermission like every other data tool (defense in depth);
          // the data layer additionally enforces the self-vs-any distinction.
          execute: withPermission(caller, "payslip:read:self", async ({ employeeId }) => {
            const result = await getPayslip(caller, employeeId);
            if (result.ok) return { payslip: result.payslip };
            return refused("No payslip found for an employee you can view.");
          }),
        })
      : tool({
          description:
            "Get the current user's own PAY summary: gross pay, tax, and net pay (money only — NOT vacation or leave balances; use getLeaveBalances for those).",
          inputSchema: z.object({}),
          execute: withPermission(caller, "payslip:read:self", async () => {
            const result = await getPayslip(caller); // self only — no target accepted
            if (result.ok) return { payslip: result.payslip };
            return refused("No payslip is linked to your account.");
          }),
        }),
  };
}

type AllHrTools = ReturnType<typeof buildAllHrTools>;
type ToolName = keyof AllHrTools;

/**
 * The tool catalogue: every tool and the permission that gates ADVERTISING it.
 * The single source of "which tools does each role get" — used to expose tools
 * per role (below) and to document the surface (settings page / docs). To add a
 * tool: define it in buildAllHrTools and add one row here. `permission: null`
 * marks a utility tool with no data access (e.g. the calendar) that every role
 * always gets. The human-readable summary lives in i18n (`tools.summary.<name>`),
 * not here, so it stays translatable and has a single source.
 */
export const TOOL_CATALOGUE = [
  { name: "getCurrentDateTime", permission: null },
  { name: "getDateInfo", permission: null },
  { name: "businessDaysBetween", permission: null },
  { name: "searchHandbook", permission: "handbook:read" },
  { name: "getEmployeeDirectory", permission: "directory:read:self" },
  { name: "getLeaveBalances", permission: "leave:read:self" },
  { name: "requestTimeOff", permission: "leave:request" },
  { name: "listPendingApprovals", permission: "leave:approve" },
  { name: "approveLeave", permission: "leave:approve" },
  // `payslip:read:self` gates ADVERTISING the tool; the elevated variant's
  // `employeeId` target is unlocked separately by `payslip:read:any` (above).
  { name: "getPayslip", permission: "payslip:read:self" },
] as const satisfies readonly { name: ToolName; permission: Permission | null }[];

/** Does this role get the catalogue entry? `null` permission = always (utility). */
function roleHasTool(role: Role, permission: Permission | null): boolean {
  return permission === null || can(role, permission);
}

/** Tool names a role is offered — handy for the settings UI and tests. */
export function toolsForRole(role: Role): ToolName[] {
  return TOOL_CATALOGUE.filter((t) => roleHasTool(role, t.permission)).map((t) => t.name);
}

/**
 * Tools advertised to the model for this caller: ONLY the ones the role can use.
 * Irrelevant tools are never injected, so the model can't see, attempt, or be
 * tricked into calling something out of scope — and no "permission denied" ever
 * needs to surface. This is the primary guardrail; the per-tool checks inside
 * each tool are defense in depth.
 */
export function buildHrTools(
  caller: ToolCaller,
  opts: { timezone?: string } = {},
): Partial<AllHrTools> {
  const all = buildAllHrTools(caller, opts.timezone);
  const allowed = TOOL_CATALOGUE.filter((t) => roleHasTool(caller.role, t.permission)).map(
    (t) => [t.name, all[t.name]] as const,
  );
  return Object.fromEntries(allowed) as Partial<AllHrTools>;
}

export type HrTools = Partial<AllHrTools>;
