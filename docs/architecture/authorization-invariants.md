# Authorization invariants: where identity and ids must live

> The contract every AI tool (and data-layer function) must uphold. If you add a
> tool, a permission, or a data helper, check it against this. Companion to the
> [sequence diagram](./authorized-ai-chat-sequence.md), which shows the runtime
> flow. This doc states the rules that flow must not break.

## The trust boundary

Guardrails exist at two levels, but only one of them is the security boundary.

**Prompt level (guidance).** The agent is told which tools it has for its role, so
it knows what it can do and answers gracefully when asked for something out of
scope. This is for quality, not security. The model can be wrong, hallucinate ids,
or be steered by a prompt-injection hidden in a handbook chunk.

**Code level (the boundary).** The server enforces access. `buildHrTools` only
injects the tools a role may use, `can()` re-checks before every run, and the
role-scoped `lib/hr` layer scopes every read. You could delete every prompt
guideline and no role could reach data it shouldn't.

The two stay in sync by construction: the prompt's capability list and the injected
toolset both come from `TOOL_CATALOGUE`, so they can't disagree.

One consequence is worth stating plainly. A correctly-configured role never hits a
"permission denied". Out-of-scope tools aren't offered, so they can't be called.
Where a parameter would only ever be out of scope for a role, it's dropped from
that role's tool schema, so the query can't even be expressed (see `getPayslip`).
The few refusals that remain return `{ refused, message }`: the agent relays it in
prose and the UI renders nothing.

## The two kinds of identifier

| Kind | Question it answers | Where it comes from | Why |
|---|---|---|---|
| **Identity** | "Who is acting?" | The session, via the closed-over `caller`. Never a tool argument. | If the model could pass `employeeId` it could act as anyone, so "self" tools (`getLeaveBalance`, self-`getPayslip`, `requestTimeOff`) take no id. |
| **Selection** | "Which record?" | A tool argument, but one the server authorizes against the caller's scope. | Viewing another person's payslip or a leave request legitimately needs an id; the server re-checks the id is reachable for this caller. |

`caller` is built once in `src/app/api/chat/route.ts` from the Auth.js session
(`{ role, employeeId, name }`) and captured by `buildHrTools(caller)`. A tool
closure cannot see anything the session didn't put there.

## The invariants

1. **Identity from the session, never from the model.** Tools read
   `caller.employeeId`; they do not accept it as input. (`route.ts`, `tools.ts`)

2. **One RBAC matrix gates everything.** `lib/rbac.ts` (`ROLE_PERMISSIONS` +
   `can()`) is the only source of "who may do what". It gates the UI/sidebar, the
   dashboard pages, and the AI tools alike.

3. **Tools are advertised per role; irrelevant tools are never injected.**
   `buildHrTools(caller)` returns only the tools whose gating permission the role
   holds, driven by `TOOL_CATALOGUE`. The model never sees an out-of-scope tool, so
   it can't call or be tricked into one. This is the primary guardrail; the
   per-tool checks below are defense in depth.

4. **One role-scoped data layer.** All reads go through `lib/hr.ts`, used by both
   the dashboard pages and the tools, so the chatbot can never return more than the
   UI would for that role. `directoryWhere(caller)` is the single "who can this
   caller see" predicate, shared by `getDirectory` and `getPayslip`.

5. **Every model-supplied id is authorized server-side.** A `requestId` or target
   `employeeId` from the model is validated against the caller's scope before any
   data is returned:
   - `getPayslip` resolves the target with one query that ANDs the id with
     `directoryWhere(caller)`, so a guessed or out-of-scope id resolves to nothing.
   - `approveLeave` re-checks `req.employee.managerId === caller.employeeId`
     (unless the caller is company-wide HR), so a manager can't approve a
     non-report's request even though they hold `leave:approve`.

   Both are locked by tests in `tests/tools.integration.test.ts`.

6. **Fail closed, and quietly.** There is no free-form, SQL, or fetch tool to
   escalate through. A correctly-configured role never hits a denial (invariant
   #3); the target-scoped refusals that remain return `{ refused, message }`. The
   model reads it and works with the authorized data, and the tool does not throw,
   render a card, or touch the database. Operational problems like bad dates or a
   handbook outage still return `{ error }`, which the UI does show, since those are
   worth surfacing. There is no separate "alert" channel; refusing is the alert.

## Checklist: adding a new AI tool

When you add a tool, verify each line:

- [ ] **Add a `TOOL_CATALOGUE` row** with the permission that gates advertising it.
      That alone makes it appear only for roles that hold the permission, and both
      the prompt's capability list and the injected toolset update automatically.
- [ ] **Identity is not an input.** If the tool acts on the current user, read
      `caller.employeeId`; don't add an `employeeId` parameter for self-actions.
- [ ] **Re-check the permission before running** (defense in depth): wrap with
      `withPermission(caller, perm, …)`, or for per-target logic (self vs. any)
      check `can()` inline before any query.
- [ ] **Reads go through `lib/hr.ts`.** Don't query `prisma` directly for reads in
      the tool; add or reuse a role-scoped helper so the UI and the tool share one
      scoping implementation. (Writes may live in the tool, but still re-check the
      target. See `approveLeave`.)
- [ ] **Any id argument is authorized against the caller's scope** before returning
      data. Don't trust that the model "got it from a prior tool". Resolve it
      through `directoryWhere(caller)` or an equivalent scoped query.
- [ ] **Scope refusals return `{ refused, message }`** (not `{ error }`, not a
      throw, not `{ denied: true }`), so the agent relays it and the UI shows
      nothing. Better still: if a parameter is only ever out of scope for the role,
      drop it from that role's schema so the query can't be expressed.
- [ ] **Add tests** for per-role exposure (whether the tool is offered) and, if it
      takes an id, the out-of-scope-id path.

## What is intentionally not here

- **Opaque id handles / capability tokens.** A mature multi-tenant system might hand
  the model short session-scoped handles instead of raw cuids, to prevent id
  enumeration and hide internal ids. We don't, because invariant #4 already makes a
  guessed id useless (it resolves to nothing), and the indirection layer would add
  machinery without closing a real hole in a starter. If this goes to production
  with untrusted tenants, that's the first upgrade to make; it slots in at the tool
  boundary and the `lib/hr` resolution step.
- **Audit logging / real alerting.** Refusals are silent today. If added, the single
  choke point is `withPermission`, plus the inline checks in `getPayslip` and
  `approveLeave`, since every refusal already passes through there.
