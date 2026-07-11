# Jira replies — AI observability + guardrails

Both tickets ship in one PR: **https://github.com/shademounir/Hari/pull/36** (targets `develop`, CI green).

---

## HARI-72 / SCRUM-062 — Créer le modèle AiEvent

Done, in review: **https://github.com/shademounir/Hari/pull/36**

`AiEvent` traces every chat turn — model, token counts, latency, finish reason, step count, and codes for tool calls, refusals, errors, guard blocks, and closes. Metadata only: no prompt/response text, employee names, or salary (the column set has nowhere to put them). Written from the `streamText` callbacks in `api/chat/route.ts` via `lib/ai/events.ts`. Shipped alongside the `Alert` model (SCRUM-063) in the same PR. CI green, targets `develop`.

---

## HARI-73 / SCRUM-063 — Créer le modèle Alert

Done, in review: **https://github.com/shademounir/Hari/pull/36**

`Alert` raises actionable items for Admin/HR behind a new `alerts:read` permission (HR_ADMIN + SUPER_ADMIN). They surface in the notification bell and on a new `/alerts` page with acknowledge/resolve. Alerts fire on guard blocks, assistant errors, forced conversation closes, and repeated refusals. Stores an i18n key plus non-sensitive params, so no PII, consistent with `AiEvent` (SCRUM-062, same PR). Screenshots and the axe pass are in the PR. CI green, targets `develop`.
