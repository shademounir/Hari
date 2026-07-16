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

`caller` is built once per request in `lib/session.ts` (`requireUser` /
`getApiCaller`) and captured by `buildHrTools(caller)`. A tool closure cannot see
anything the session didn't put there.

It is a **`Subject`**: `{ role, permissions }`, with the permissions already
resolved against the live matrix, so `can(caller, …)` stays synchronous (it runs
inside client renders and Prisma where-builders, neither of which can await).

**The JWT carries identity only.** Role and permissions are read from the database
on every request, because a role claim on a 30-day token cannot be revoked —
Auth.js's `updateAge` re-signs the token without re-running `authorize`, so a
stale role would simply be copied forward and a demotion would take up to a month
to apply. One indexed read (deduped by React `cache()`) buys a demotion that takes
effect on the caller's next request. `role` and `employeeId` are deliberately
absent from the Session type, so reading a stale one is a compile error.

## The invariants

1. **Identity from the session, never from the model.** Tools read
   `caller.employeeId`; they do not accept it as input. (`route.ts`, `tools.ts`)

2. **One RBAC matrix gates everything — and it is data.** `lib/rbac.ts` defines
   the permission *vocabulary* (`PERMISSIONS`) and the built-in *defaults*
   (`DEFAULT_ROLE_PERMISSIONS`). The **effective** matrix is resolved from the
   `Role` table by `lib/rbac-server.ts` (`getRbacMatrix`), which a super admin
   edits at `/settings/roles`. Whatever it resolves to gates the UI/sidebar, the
   dashboard pages, and the AI tools alike — there is still exactly one matrix.

   Two properties keep that safe:
   - **Roles are data; permissions are code.** Every permission is read by a
     literal somewhere that enforces it, so one no code reads would enforce
     nothing. `Permission` stays a compile-time union, and the resolver filters
     every DB-sourced list through `isPermission` — so an admin **cannot invent a
     permission through a form**. This is what preserves the
     `engagement:read:self` prohibition by construction rather than vigilance.
   - **Resolution only narrows.** A built-in row with `permissions = NULL` means
     "use the code defaults"; unknown strings are dropped; an unknown role slug
     resolves to **no permissions at all** (never the defaults). Fail closed.

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
      If the permission is **new**, add it to `PERMISSIONS` and to the built-in
      roles in `DEFAULT_ROLE_PERMISSIONS`, plus a `permissions.<key>` label in
      **both** message catalogs. Existing custom-role rows simply won't list it —
      the resolver only honors what a row names, so a new permission is opt-in for
      custom roles and default-on for the built-ins that declare it.
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

## Knowledge base (HARI-58/59/62)

The KB extends the same model, with three governance axes:

- **`status`** (DRAFT / PUBLISHED / ARCHIVED) — only PUBLISHED docs are chunked &
  embedded (`src/lib/kb/ingest.ts`), so a draft has *zero* RAG chunks and is
  invisible to the chatbot. Retrieval also filters `status='PUBLISHED'` as belt-and-suspenders.
- **`visibility`** (ALL_EMPLOYEES / MANAGERS / HR_ONLY) — mapped to roles by
  `visibleDocTiers(role)` in `lib/rbac.ts`, derived from the directory permissions
  so KB access tracks the rest of the app.
- **Assistant access** (`KbCollection.assistantEnabled` + `HrDocument.assistantEnabled`
  override) — a super-admin (`admin:settings`) policy for which content the AI
  assistant may use, resolved as `COALESCE(doc, collection)`. It is **additive-only**:
  it can withhold content from the assistant but never widens access beyond status +
  tier, and it does **not** affect the reader. See `knowledge-base.md` →
  *Assistant access*.

Enforcement points (all server-side):

- **Reading** is gated by `handbook:read` (every role). Both retrieval
  (`searchHandbook` → `lib/rag.ts`) and the reader/data layer (`lib/kb.ts`) filter
  by `visibleDocTiers(role)` + PUBLISHED, so the chatbot can never surface a
  document the reader wouldn't show that role. Retrieval additionally filters by the
  assistant-access policy (`COALESCE(doc, collection).assistantEnabled`), which can
  only narrow it further. Direct-URL access to a hidden/draft article (`getArticle`)
  resolves to `null` → `notFound()` (IDOR-safe).
- **Configuring assistant access** is gated by `admin:settings` (SUPER_ADMIN). The
  Settings panel and every setter in `lib/kb.ts` re-check it; the `kb:manage`
  authoring forms cannot change it (separation of duties).
- **Managing** is gated by `kb:manage` (HR_ADMIN/SUPER_ADMIN). Admin pages redirect
  non-holders; every server action **and** every `lib/kb.ts` admin function
  re-checks `can(caller,"kb:manage")` (defense in depth), and form inputs (slug,
  visibility, status) are validated against allowed values before any write.
- Citation URLs are built **server-side from the DB** (article/collection slug +
  heading anchor); the model only emits a `[n]` number, so a citation can never
  point somewhere the model invented.

## Roles & users (HARI-RBAC)

Roles are rows, not an enum, and the matrix is editable. The same shape as the KB
section above: a governed overlay on a code-defined vocabulary.

- **The vocabulary is closed.** `PERMISSIONS` in `lib/rbac.ts` is the only set of
  strings the app enforces. `isPermission` is the single filter every DB-sourced
  permission list passes through, so a form cannot introduce one.
- **`permissions = NULL` on a built-in = the code defaults.** So `lib/rbac.ts`
  stays the one source of truth for the shipped matrix, the migration that seeds
  the table cannot drift from it, and "Reset to defaults" is just writing NULL
  back (`Prisma.DbNull` — a JSON `null` would read as "a role with no permissions"
  and silently strip them all).
- **Nesting is no longer global.** `EMPLOYEE ⊂ MANAGER ⊂ HR_ADMIN ⊂ SUPER_ADMIN`
  holds for the built-in DEFAULTS (pinned by `tests/rbac.test.ts`) and nowhere
  else: a custom role breaks containment by design. The editor treats it as
  advisory.
- **`visibleDocTiers` couples KB access to `directory:read:*`.** Granting
  "view the whole company" also grants HR_ONLY handbook articles, to the reader
  and the assistant alike. The role editor says so inline, at the checkbox — it is
  the least obvious consequence of an edit and the UI is the only place a human
  meets it.

Enforcement points (all server-side, in the data layer — the UI only mirrors them,
because a hand-crafted POST never sees it):

- **Editing roles / the matrix** is gated by `admin:settings` (Super Admin) in
  `lib/roles.ts`. **Managing people** — invite, edit, re-role, deactivate — is
  gated by `employee:manage` (HR) in `lib/users.ts`. That split is the separation
  of duties.
- **No escalation.** A caller may only **grant** a permission, or **assign** a
  role, whose permissions are a subset of their own. Revoking is always allowed —
  the matrix may narrow, never widen past the person editing it. Without this the
  split above is decoration: HR could mint a super admin and become one.
- **No lockout.** `SUPER_ADMIN` always keeps `admin:settings`, and no save, role
  change, or deactivation may leave zero **active** users holding it. `/settings`
  is the only door to the editor.
- **No self-modification.** You cannot change your own role or deactivate
  yourself (mirrors the no-self-rating guard in `team/engagement/actions.ts`).
- **Built-ins persist.** Their slug is immutable and they cannot be deleted; a
  custom role cannot shadow one. A role with holders cannot be deleted — the
  `ON DELETE RESTRICT` FK guarantees that even if a check is missed.
- **Sensitive fields follow the READ rules.** `salary` is only writable by a
  caller holding `salary:read:all`; the field is omitted from the write rather
  than zeroed, so someone who never saw it cannot wipe it.
- **Every mutation is audited** (`ROLE_*`, `USER_*`). Role slugs and permission
  keys are **codes, not PII**, so `meta: { from, to }` is contract-compliant — a
  name or email there would not be.

`AiEvent.role` and `AuditLog.actorRole` are plain strings with **no FK**: they are
denormalized precisely so history survives deletion, and an FK would break the
trail the moment a custom role is removed. Readers fall back to the raw slug.

## What is intentionally not here

- **Opaque id handles / capability tokens.** A mature multi-tenant system might hand
  the model short session-scoped handles instead of raw cuids, to prevent id
  enumeration and hide internal ids. We don't, because invariant #4 already makes a
  guessed id useless (it resolves to nothing), and the indirection layer would add
  machinery without closing a real hole in a starter. If this goes to production
  with untrusted tenants, that's the first upgrade to make; it slots in at the tool
  boundary and the `lib/hr` resolution step.
- **Audit logging of REFUSALS.** Sensitive *actions* are on the trail
  (`lib/audit.ts` — including every role and user change), but a refusal is still
  silent. If you want them, the single choke point is `withPermission`, plus the
  inline checks in `getPayslip` and `approveLeave`, since every refusal already
  passes through there.
- **Per-permission delegation.** A caller may only grant what they hold (below),
  which is a coarse rule: it cannot express "HR may assign MANAGER but not
  HR_ADMIN" when HR holds everything MANAGER does. If that distinction matters,
  it slots into `canAssignRole` in `lib/users.ts`.
