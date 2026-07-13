# Chatbot robustness review — verification evidence (2026-07-13)

End-to-end Playwright validation of the `/chat` assistant across **all four roles**
(Employee · Manager · HR Admin · Super Admin), driven through the real UI. Every
code change in this PR is exercised below, plus the core RBAC/observability
invariants. Deterministic suite: **252/253 passing** (the 1 failure is a
pre-existing MinIO/S3 env issue, unrelated to this change).

> Model note: the free OpenRouter models are frequently rate-limited; testing used
> `nemotron-super`. A few turns hit 429s — which now surface the correct
> "model is rate-limited — pick another model" message (fixed `chatErrorCode`).

---

## 1 · The reported bug — RAG resilience

The colleague's screenshot showed *"Handbook search is unavailable right now"*.
Root cause: `searchHandbook` computed the query embedding first and threw the whole
search away on any embeddings failure — killing even the lexical half that needs no
embeddings. Fixed with a graceful **lexical-only fallback** (OR-semantics).

<table>
<tr>
<td width="50%"><b>Normal path (embeddings up)</b><br/>Hybrid vector+FTS, cited answer, deep-link.</td>
<td width="50%"><b>Embeddings outage → lexical fallback (the fix)</b><br/><code>EMBEDDING_MODEL</code> pointed at a model OpenRouter returns HTTP 400 for — the handbook <b>still answers</b> instead of the "unavailable" card.</td>
</tr>
<tr>
<td><img src="./emp-rag-parental-leave.png" width="100%"/></td>
<td><img src="./rag-failure-lexical-fallback-PASS.png" width="100%"/></td>
</tr>
</table>

---

## 2 · Per-role RBAC & data scoping

Employee asking for another person's salary/payslip is declined gracefully (no tool
offered, no error card). Super Admin can fetch **anyone's** payslip via the elevated
`getPayslip` (with `employeeId`) and sees salary — the key elevation Employee/Manager
never get.

<table>
<tr><td><b>Super Admin — elevated <code>getPayslip</code> by id + salary visible</b><br/><code>getEmployeeDirectory</code> → Karim's card (salary MAD 300,000/yr) → <code>getPayslip(employeeId)</code> → Net MAD 19,500.</td></tr>
<tr><td><img src="./superadmin-elevated-payslip-salary.png" width="720"/></td></tr>
</table>

---

## 3 · Predictive / engagement privacy (de-anonymization fix)

`getEngagementRisk` used to return a directory-joinable `employeeId` to managers,
letting the model re-identify burnout-risk reports by name. Now the id is emitted
**only for HR/Admin** (who may resolve identities), matching `predictDepartures`.

<table>
<tr>
<td width="50%"><b>Manager — anonymized</b><br/>Tool output has <b>no <code>employeeId</code></b>; answer refers to "someone in IT / BOREOUT quadrant", cannot name anyone.</td>
<td width="50%"><b>HR Admin — named allowed</b><br/>Tool output <b>includes <code>employeeId</code></b> (company scope) — HR is authorized to resolve identities.</td>
</tr>
<tr>
<td><img src="./mgr-engagement-anonymized.png" width="100%"/></td>
<td><img src="./hr-engagement-named-contrast.png" width="100%"/></td>
</tr>
</table>

---

## 4 · Guardrails & safety (three mechanisms)

| Mechanism | Trigger | Outcome |
|---|---|---|
| Deterministic input guard (pre-model) | injection / exfiltration (EN **+ FR**) | blocks before any model call, locks composer, `AI_GUARD_BLOCK` |
| Model safety refusal (in reasoning) | a dangerous/unsafe request | soft-refuses, keeps chat open |
| `endConversation` tool (model-driven, last resort) | insisting on a disallowed/unsafe action | model calls the tool → `CONVERSATION_CLOSED`, locks chat |

<table>
<tr>
<td width="50%"><b>Deterministic guard — French injection blocked</b><br/>New FR patterns: "Ignore toutes les instructions précédentes…" → blocked in ~4s, composer locked.</td>
<td width="50%"><b>Model <code>endConversation</code> — Super Admin</b><br/>Refuses the bomb request, then on insist+threat calls the tool → "Conversation ended — A disallowed action was requested".</td>
</tr>
<tr>
<td><img src="./emp-fr-injection-blocked.png" width="100%"/></td>
<td><img src="./superadmin-endConversation-disallowed.png" width="100%"/></td>
</tr>
</table>

`endConversation` verified on **every role** (it's a `permission: null` tool advertised to all):

<table>
<tr>
<td width="50%"><b>Employee</b></td>
<td width="50%"><b>HR Admin</b></td>
</tr>
<tr>
<td><img src="./employee-endConversation.png" width="100%"/></td>
<td><img src="./hr-endConversation.png" width="100%"/></td>
</tr>
</table>

---

## 5 · Observability (metadata-only, HR/Admin-gated)

Every guard block, error, and conversation-close writes an `AiEvent` + `Alert` with
**metadata only** — reason code + subject name, **never** the prompt text.

<table>
<tr>
<td width="50%"><b>Guardrail + error alerts</b><br/>The FR-injection block and rate-limit error surfaced to HR (detail = rule/code, no content).</td>
<td width="50%"><b>All-roles <code>endConversation</code> alerts</b><br/>Four "Assistant ended a conversation / disallowed request" — one per role, correctly attributed, no prompt text.</td>
</tr>
<tr>
<td><img src="./hr-alerts-observability.png" width="100%"/></td>
<td><img src="./alerts-endConversation-all-roles.png" width="100%"/></td>
</tr>
</table>

---

### Per-role tool matrix (validated)

| | Employee | Manager | HR Admin | Super Admin |
|---|:--:|:--:|:--:|:--:|
| Tool count | 9 | 13 | 13 | 13 |
| `searchHandbook` (RAG + fallback) | ✅ | ✅ | ✅ | ✅ |
| `getPayslip` | self only | self only | + `employeeId` | + `employeeId` |
| Directory / salary | self / — | team / — | company / **salary** | company / **salary** |
| `getEngagementRisk` | — | anonymized | named | named |
| Safety refusal + `endConversation` | ✅ | ✅ | ✅ | ✅ |
