# HARI — contributor & agent guide

> `CLAUDE.md` imports this file, so this is the single guide for **both** Claude Code and other
> coding agents. `README.md` is the authoritative architecture story (stack rationale + mermaid
> diagrams for the chat sequence, RBAC, ERD, and RAG); this file is the working contract — the
> cross-file invariants and commands you need before touching anything.

HARI is a deliberately-minimal **starter** showing how to build one production-shaped, safe,
observable AI feature on a classic HR back-office (directory + leave + payslips) — "BambooHR + a
built-in assistant". The showcase is the `/chat` page: an assistant with RBAC-gated tools, handbook
RAG (pgvector), streaming reasoning, tool-call UI, and generative UI. The whole system is **one**
Next.js 16 App Router app (React 19): the browser talks only to Next.js, which talks to Postgres
(Prisma) and to AI providers (OpenRouter default / Vercel AI Gateway). There is **no separate
backend service**.

## Stack
Next.js 16 (App Router, React 19) · TypeScript · Tailwind v4 + shadcn/ui (base-nova on **Base UI**,
not Radix) · next-intl (EN/FR) · Vercel AI SDK v6 · OpenRouter (chat + embeddings) · Postgres +
pgvector (`halfvec` + HNSW) · Prisma · Auth.js v5.

> Next.js 16 / React 19 are recent majors — when an API surprises you, check the official docs
> for that version rather than assuming older behavior.

## Environment prerequisites
- **Node 22 is enforced, not advisory.** `package.json` `engines` requires `node >=22 <23` and
  `.npmrc` sets `engine-strict=true`, so `npm install` **fails** on the wrong major. `.nvmrc` pins
  `22` (`nvm install && nvm use`). See `NODE_VERSION.md`.
- `@prisma/client` / `prisma` are pinned to **exact** `6.19.3` (no caret) — a CI fix; don't loosen.
- The only `.env` value needed to exercise chat/RAG is **`OPENROUTER_API_KEY`** (one key powers both
  chat and embeddings). `AUTH_SECRET` ships as a working placeholder; the app boots without the key
  but chat/RAG stay inert. See `.env.example` for the full set (`DATABASE_URL`, `AUTH_URL`,
  `S3_*`/`MINIO_*`, `CRON_SECRET`, `COMPANY_NAME`).
- Secrets live in `.env` (git-ignored) and are read only in server code / Route Handlers.

## Commands

### Build / run / lint
- `docker compose up --build` — full stack: db (pgvector pg17) + adminer (`:8080`) + **minio**
  (`:9000` API / `:9001` console) + app (`:3000`). The app container runs
  `prisma migrate deploy` → best-effort `prisma db seed` → `npm run dev` on boot.
- `docker compose up -d db minio` — start only what `npm run dev` needs (Postgres `:5432`, MinIO `:9000`).
- `npm run dev` — app only (expects Postgres `:5432` + MinIO `:9000`).
- `npm run build` — `next build`; this is the whole-project typecheck and the CI non-regression gate.
- `npm run lint` — flat ESLint (`eslint-config-next` core-web-vitals + typescript).
- `npx tsc --noEmit` — typechecks translation keys against `en.json` and catches EN/FR drift.

### Database — schema is migration-driven, **never `db push`**
- `npm run db:migrate` (`migrate dev`) / `db:deploy` (apply committed migrations; used on boot & CI) /
  `db:reset` (drop + migrate + re-seed) / `db:seed` / `db:studio`.
- **After editing `prisma/handbook.ts` you must `db:reset`** — `db:seed` is idempotent by a per-section
  `count()` guard and will **not** re-embed if the handbook already exists.
- `db:seed` uploads KB collection covers to MinIO, so **MinIO must be up** when seeding.
- `npm run db:migrate-covers` — one-off: move legacy inline `data:` KB covers into MinIO.

### Tests
Two vitest configs share `vitest.shared.ts` (node env, `setupFiles: tests/setup.ts` which only loads
`dotenv/config`, `fileParallelism:false` because the integration tier hits one shared DB) so they
can't drift. The `@/*` → `./src/*` alias lives only in `tsconfig.json`; tests resolve it via
`vite-tsconfig-paths`. `server-only`/`client-only` are stubbed to a no-op for node.
- `npm test` — deterministic suite (`vitest run`, **excludes** `**/*.live.test.ts`). No network/keys,
  **but does need a running Postgres** for the integration tier (anything importing `@/lib/prisma`,
  e.g. `*.integration.test.ts`). Run `docker compose up -d db minio && npm run db:deploy && npm run db:seed` first.
- `npm run test:live` / `test:all` — live OpenRouter + RAG smoke (`tests/**/*.live.test.ts`,
  self-skips without `OPENROUTER_API_KEY`) / both.
- **Single test file:** `npx vitest run tests/rbac.test.ts` (default config auto-applies).
- **Single test by name:** `npx vitest run -t "admin can read salary"` (filters describe/test titles).
- **A single live file *requires* the config flag:**
  `npx vitest run --config vitest.live.config.ts tests/openrouter.live.test.ts` — under the default
  config a live path silently matches zero tests.

### Cron & exports (local)
- `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/predictive-scores`
  (engagement-scores also accepts POST).
- Analytics CSV: `GET /api/analytics/export?section=turnover&period=year`. Document PDF:
  `GET /api/documents/<id>/download`.

## Architecture — the invariants that span files

### One permission matrix, one data layer, one toolset (the core safety story)
`src/lib/rbac.ts` (`ROLES`, the `PERMISSIONS` list, cumulative `ROLE_PERMISSIONS`, `can()`,
`visibleDocTiers()`) is the **single source of truth** for authorization — pure data + pure
functions, client- and server-safe. Roles are strictly nested: `EMPLOYEE ⊂ MANAGER ⊂ HR_ADMIN ⊂
SUPER_ADMIN` (each built by spreading the lower role's array; `admin:settings` is the only thing
separating Super Admin from HR). The matrix gates four surfaces identically so rules can't drift:

1. **UI** — `src/lib/nav-items.ts` `NAV_ITEMS` (one nav source for sidebar + ⌘K + breadcrumb) hides
   links via `can()`; columns/cards gate too.
2. **Data layer** — `src/lib/hr.ts` is THE one role-scoped implementation of HR reads/writes,
   imported by BOTH the dashboard pages AND the AI tools. Because both channels share the same scoped
   queries, **the chatbot can never read more than the UI would show for that role.**
   `directoryWhere(caller)` is the single "who can this caller see" predicate; a null `employeeId`
   collapses to a `__none__` sentinel (fail-closed — never a global read). Scope is always the first
   `AND` clause.
3. **AI tools** — `src/lib/ai/tools.ts` `buildHrTools(caller)` filters `TOOL_CATALOGUE`
   (name → permission) by role, so **out-of-scope tools are never injected into the model context** —
   the model can't see, attempt, or be prompt-injected into calling them. This is the primary
   boundary. Per-tool `withPermission()` is defense-in-depth.

**Authorization is always server-side.** The acting identity is the closed-over
`caller = { role, employeeId, … }` derived once from the Auth.js session — never a tool argument or
client input. "Self" tools take no id; any model-supplied id (selection) is re-authorized against
`directoryWhere(caller)`. `getPayslip` is role-**shaped at the schema level**: only `payslip:read:any`
holders get an `employeeId` parameter, so an out-of-scope query isn't even expressible. Two result
contracts: scope refusals return silent `{ refused, message }` (UI renders nothing, agent works
around it — never a "denied" card, never a throw); operational failures return `{ error, errorCode }`
(UI shows a localized `tools.errors.<code>` card). Sensitive fields (salary) are stripped
server-side unless `salary:read:all`. **Full contract + add-a-tool checklist:**
`docs/architecture/authorization-invariants.md`.

> Doc drift: `docs/secu/SCRUM-096` and the French `besoins.md` predate the code (older permission
> set, a `{ denied }` card contract). Treat `rbac.ts` + README/code as source of truth.

### Auth — Auth.js v5, JWT sessions (`src/lib/auth.ts`, `src/lib/session.ts`)
JWT strategy (Credentials providers can't use DB sessions). `role`+`employeeId` ride on the JWT and
project onto `session.user` with no DB round-trip, so RBAC scopes per-request. **There is NO
middleware** — auth is enforced per-page/route by `requireUser()` (redirects to `/login`) or
`await auth()`; the `(dashboard)` layout is the umbrella gate and each API route re-checks. Sign-in
methods (password via bcrypt, passwordless magic link + email OTP, Google OAuth env-gated by
`AUTH_GOOGLE_ID/SECRET`, password reset) all resolve to **pre-provisioned** users — **sign-in never
creates an account** (Google's callback rejects unknown emails). One-time secrets
(`src/lib/auth/tokens.ts`, `flows.ts`, `email.ts`) share one `AuthToken` table: SHA-256 hash only,
single-use, short per-type TTL, constant-time compare, OTP lockout after repeated failures,
anti-enumeration (always a generic `{ ok }`), issuance rate-limited. Secret-bearing emails derive
origin from `AUTH_URL` (not the request Host) to prevent link poisoning, and log bodies only in dev.
Demo accounts (`collaborateur@` / `manager@` / `rh@` / `admin@hari.ma`) intentionally share
`password123` — a documented demo shortcut, not a defect. Details in `docs/auth.md`.

### The /chat pipeline (`src/app/api/chat/route.ts` + `src/lib/ai/*`)
One turn: `auth()` → `classifyRequest` (sensitivity *label* only) → `inspectConversation`
(deterministic input guard) → `buildHrTools(caller)` → `streamText` (agent loop, stops at a step cap
or when the model calls `endConversation`) → UI stream. The system prompt's capability list is
generated **from** the injected tools object, so prompt and toolset can never disagree; the prompt is
UX-only, never the enforcement point. Reasoning `<think>` tokens surface into a collapsible panel via
`extractReasoningMiddleware` (`providers.ts`); tools return typed JSON that
`components/chat/generative/*` render as cards. Model registry `DEFAULT_MODEL_ID` is `gpt-oss-120b`
(free, tool-calling + reasoning); resolve any client `modelKey` through `getAvailableChatModels()` so
an unavailable gateway model falls back rather than 503s.

**Three guardrail layers:** (1) per-role tool advertising above; (2) `guardrails.ts` — a pure regex
check over *every* user message in the turn (the whole client-controlled `messages[]` reaches the
model) plus a count cap; on block it records a `GUARD_BLOCK` AiEvent + alert and locks the composer
**before** spending a model call; (3) `endConversation` — a safety-valve tool the model calls to
decline + lock the chat. Separately, `prompt-guard.ts` `sanitizeRetrievedContent()` scrubs injection
verbs from every RAG chunk in `rag.ts` before it reaches the model. **Keep these regexes tight and
anchored to an override verb** (broad patterns rewrote legitimate handbook text); the shared list has
no `g` flag on purpose.

**Observability & alerts** (`events.ts`, `alerts.ts`): every turn writes an `AiEvent` — **metadata
ONLY** (role, model, token counts, latency, finish reason, tool name, refusal/error/guard/reason
codes). **Never** prompt/response text, names, or salary; this no-PII contract is non-negotiable
(SCRUM-062/063, CNDP). Writes are fire-and-forget — never `await` them in a way that stalls the
stream. `onStepFinish` buffers per-tool events; `onFinish` flushes them + a TURN event and fires
alerts; `onError` raises a CRITICAL `AI_ERROR`. Alert triggers (`AI_GUARD_BLOCK`,
`CONVERSATION_CLOSED`, `AI_REFUSAL` — edge-triggered at repeated refusals per user in 24h, keyed by
**userId** so a rotating conversationId can't evade it, `AI_ERROR`) surface only to `alerts:read`
holders in the bell + `/alerts`. Predictive/engagement AI tools anonymize for managers **in code**
(department + score + factor *keys* only, never name/id/salary). `classifyRequest`/`cndp.ts` are
detection signals only — never gate a reply on them (`cndp.ts` is not yet wired into any runtime path).

### Knowledge Base + RAG (`src/lib/rag.ts`, `src/lib/kb/*`, `src/lib/ai/embeddings.ts`)
Handbook chunks store **`pgvector halfvec(384)`** (16-bit floats) with an HNSW index. **The 384
dimension is fixed by the migration.** `EMBEDDING_MODEL` is env-selectable (default
`all-MiniLM-L6-v2`) but `EMBEDDING_DIMENSIONS` is hardcoded to 384 and `embed()` throws a loud
mismatch error on a wrong-width vector. Swapping to another 384-dim model = `EMBEDDING_MODEL` +
`db:reset`; changing the dimension = a new migration ALTERing `halfvec(N)` + rebuilding the index +
updating `EMBEDDING_DIMENSIONS` in lock-step. Ingest runs **only on publish** (`kb/ingest.ts` splits
at `<h2>/<h3>`, embeds in one batch, atomic delete+insert in a `$transaction`); a DRAFT has zero RAG
chunks. Keyless-safe: without a key it still inserts chunks (lexical half works) and skips vectors.

Retrieval is **hybrid** — a vector CTE (cosine `<=>`) FULL OUTER JOIN a Postgres FTS CTE (a
`GENERATED STORED` tsvector, GIN index), fused by Reciprocal Rank Fusion; the query is a bound
parameter (injection-safe). **Tier gating lives in the SQL, not the prompt:**
`visibility = ANY(visibleDocTiers(role))` + `status='PUBLISHED'` + `COALESCE(doc,collection).assistantEnabled`
(an **additive-only** super-admin org policy — can hide from the assistant but never widen past
tier+status; doesn't affect the reader). The ⌘K reader (`/api/kb/search`) reuses the exact same path,
so search and chat are scoped identically. **Citations are hallucination-proof:** the tool builds
canonical `/kb/{collection}/{article}#{anchor}` URLs server-side from the DB; the model only emits
`[n]`. `searchHandbook` failures omit the `results` key entirely so a JSON-reading model can't
mistake an outage for an empty handbook. **KB cover images** live in a PRIVATE MinIO/S3 bucket
(`lib/storage.ts`); uploads are `kb:manage`-gated, size-capped, and rasterized to WebP with sharp
(strips SVG scripts); `KbCollection.image` stores an `/api/kb/images/…` proxy path served
same-origin. The browser never talks to MinIO. Deep dives: `docs/architecture/hr-rag-architecture.md`,
`knowledge-base.md`, and the KB governance section of `authorization-invariants.md`.

### Analytics, predictive, engagement, KPI dashboards
Each subsystem follows the same shape: **one server-side scope authority + a pure, dependency-free
scorer.**
- **Analytics** (`lib/analytics/`): `getHrAnalytics` assembles the dashboard; `resolveAnalyticsScope`
  is the single authority — `analytics:full` sees company + payroll, `analytics:team` sees self +
  reports and **never payroll**. Scope deliberately **includes terminated employees** (turnover /
  historical payroll need them — don't "fix" to active-only). CSV export reuses `getHrAnalytics`
  (same gate); `toCsv` neutralizes spreadsheet formula-injection.
- **Predictive** (`lib/predictive/`): a PURE multi-factor `departure-risk` scorer (no Prisma, no
  `Date.now`, explainable `factors[]`) + a server-only N+1-free batch data layer that emits only
  derived signals (salary *growth ratio*, never absolute salary).
- **Engagement** (`lib/engagement/`): a 2-D exhaustion/disengagement scorer with **unconditional
  self-exclusion at the query level — no one, not even HR, sees their own engagement score**
  (`engagement:read:self` deliberately does not exist; a test in `tests/rbac.test.ts` forbids it).
  Absenteeism signals **exclude protected leave** (SICK/PERSONAL per Moroccan Labor Code).
- **KPI dashboards** (`lib/kpi/`): resolve scope once via `hr.ts` `getTeamScope`, then compose
  KPIs/trends/anomaly/capacity; DB helpers never compute their own scope.
- Config-override rows (`PredictiveWeightConfig` / `EngagementSignalConfig`, version 0 = built-in
  defaults) are validated key-by-key so a partial JSON row can't NaN a score.

### Leave, documents, audit, onboarding/offboarding, rate limiting, cron
- **Leave**: balance deduction happens in EXACTLY one place — `bulkDecideLeaveRequests` (`hr.ts`),
  in a `$transaction` in the same atomic unit as the status flip; both the dashboard action and the
  `approveLeave` tool route through it. Idempotent under races (only PENDING rows; non-PENDING hard-
  refuse with `request_not_pending`). Managers approve only their reports (`directoryWhere`-scoped, so
  an out-of-scope id mutates zero rows). `parseUtcDate` round-trips the ISO string to reject
  V8-rolled invalid dates (`2026-06-31`).
- **Documents/PDF** (`lib/documents.ts`, `lib/pdf/work-certificate.ts`): a PURE pdf-lib renderer
  (already-localized strings, no Prisma/i18n) split from orchestration; the certificate renders in the
  **requester's** locale (captured at request time). State machine REQUESTED/VALIDATED → GENERATED →
  DOWNLOADED / REJECTED. `pdfUrl` stores a MinIO object **key** (not a URL), served via
  `api/documents/[id]/download` (IDOR-quiet 404s) — same private-bucket pattern as KB covers.
- **Audit** (`lib/audit.ts`): metadata-only trail (actor id/role, action, target ids, small code
  `meta`) for actions `AiEvent` doesn't cover (alert triage, document validate/reject, offboarding);
  best-effort, `alerts:read`-gated.
- **Offboarding** (`lib/offboarding.ts`, `employee:manage`): completion **archives** the employee
  (status → TERMINATED, **never delete**) atomically in a `$transaction`. Onboarding
  (`lib/onboarding.ts`) is a self-service checklist seeded lazily/idempotently; step keys are stable
  i18n keys.
- **Rate limiter** (`lib/rate-limit.ts`): Postgres fixed-window, **fails open by design** (RBAC/auth
  are the real guardrails); `rateLimitPeek` rejects before expensive work (e.g. bcrypt). Buckets:
  login, auth-issue, chat, kb-search, kb-upload.
- **Cron** (`vercel.json`): predictive-scores `0 3 * * *`, engagement-scores `0 4 * * *` (UTC). Each
  route authenticates `Authorization: Bearer $CRON_SECRET` via `timingSafeEqual` and **fails closed**
  if the secret is unset — never add an unauthenticated fallback. Both de-duplicate alerts per subject.

### Data model & migrations (`prisma/schema.prisma`, `prisma/migrations/`)
Migrations are the source of truth (`db push` is forbidden). pgvector/FTS objects are Prisma
`Unsupported()` types, so `CREATE EXTENSION`, the `halfvec(384)` column, the HNSW index, and the
generated tsvector + GIN index live in **raw migration SQL**. The HNSW index is fragile — Prisma's
generated diffs keep trying to DROP it, so hand-written migrations recreate it with `IF NOT EXISTS`
and strip spurious `DROP INDEX` / `ALTER COLUMN DROP DEFAULT` drift against `HandbookChunk`. Auth
(`User`) and HR data (`Employee`, 1:1) are split; the org chart is self-referential (`managerId`).

### i18n — mandatory (`src/i18n/*`, `docs/i18n.md`)
next-intl in **cookie mode** (`NEXT_LOCALE`, no URL prefixes, no middleware). **Every user-facing
string** (labels, placeholders, aria-labels) is a key in BOTH `messages/en.json` and
`messages/fr.json` — never a literal. `en.json` is the typed source of truth (`global.d.ts`), the two
catalogs are kept at exact parity, and `npx tsc --noEmit` catches EN/FR drift. `routing.ts` is the
single source of supported locales. The AI answers in the active locale (instructed in
`api/chat/route.ts`), but **tool result strings stay English at the data layer** (asserted in
`tools.integration.test.ts`) and are translated only on model relay. Currency/timezone come from
`OrgSettings` (defaults MAD/UTC), formatted via `formatCurrency` — never hand-rolled `toLocaleString`.

### Frontend conventions (`docs/frontend.md`)
Tailwind v4 configured entirely in CSS (no `tailwind.config`); theme is next-themes (`class`/system).
Use **semantic tokens only** (`bg-background`, `text-foreground`, `bg-primary`, …) — never
`bg-white`/`text-black`/hex (breaks dark mode); a few "always-branded" tokens are defined identically
in `:root` and `.dark` on purpose. shadcn/ui uses the **base-nova style built on Base UI
(`@base-ui/react`), NOT Radix** — compose primitives with the `render` prop, not `asChild` (`asChild`
is dead here). Before a UI PR, clear the `docs/frontend.md` checklist: light+dark, ~375px + desktop
with no horizontal page scroll, tokens not hex, keyboard-operable with visible focus, aria-labels on
icon-only controls, `npm run lint` + `npx tsc --noEmit` clean.

### CI/CD & branching (`CONTRIBUTING.md`, `.github/workflows/`)
Branch model: `main` (production, merge from `develop` only) ← `develop` ← `feature/[HARI-xxx]` |
`fix/[HARI-xxx]` (cut from `develop`). Commit convention `type(scope): titre` is **load-bearing**:
`release.yml` (on push to `main`) parses `BREAKING CHANGE` (body) / `feat(` (subject) / else → semver
bump + tag + GitHub Release, so a mislabeled commit produces the wrong bump. `test.yml` runs on every
PR: pgvector + MinIO services + `db:deploy`/`db:seed` → `npm run build` → `npm test`. Rebase on
`origin/develop` and push `--force-with-lease` before a PR. The shipped Dockerfile is dev-oriented
(single-stage) — a documented pre-prod shortcut, like the demo password and placeholder `AUTH_SECRET`.

## Where the deep docs live
`docs/` numbers the project phases `01-cadrage` → `07-deploiement` (mostly **French**; README + code
are English), plus `docs/architecture/` (the authz contract + chat/RAG deep dives), `docs/secu/`
(threat model, RBAC matrix, guardrails), and `docs/compliance/CNDP.md` (Moroccan law 09-08 no-PII
mapping). Load-bearing: `docs/architecture/authorization-invariants.md`,
`authorized-ai-chat-sequence.md`, `hr-rag-architecture.md`, `knowledge-base.md`, `docs/auth.md`,
`docs/i18n.md`, `docs/frontend.md`. **Where a phase/secu doc conflicts with code, trust code + README
+ `test.yml`** (known stale spots: `SCRUM-096` RBAC set, `besoins.md` `{denied}` card,
`deploiement.md` example emails / missing MinIO).
