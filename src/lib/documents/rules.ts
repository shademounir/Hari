// ─────────────────────────────────────────────────────────────────────────
// SCRUM-094: pure authorization/workflow rules for GeneratedDocument, kept
// separate from the DB-touching orchestration in `lib/documents.ts` so they
// are directly unit-testable (no Postgres needed). `can()` from `lib/rbac.ts`
// remains the single source of truth for what a role holds — these functions
// only add the per-document-type scoping on top of it.
// ─────────────────────────────────────────────────────────────────────────
import { can, type Role } from "@/lib/rbac";
import type { GeneratedDocumentType } from "@prisma/client";

// Types that never wait on a human validator: LEAVE_CONFIRMATION is decided by
// the linked LeaveRequest's own APPROVED status (checked at request time, not
// here — see requestDocument in lib/documents.ts); HR_SUMMARY is AI-generated
// with no approval step at all.
const NO_VALIDATION_TYPES: ReadonlySet<GeneratedDocumentType> = new Set([
  "LEAVE_CONFIRMATION",
  "HR_SUMMARY",
]);

/** Does this document type ever go through a human HR/manager validation step? */
export function requiresValidation(type: GeneratedDocumentType): boolean {
  return !NO_VALIDATION_TYPES.has(type);
}

export type RequestTarget = {
  /** The document is about the actor themselves. */
  isSelf: boolean;
  /** The target employee reports (directly) to the actor. Irrelevant when isSelf. */
  reportsToActor: boolean;
};

/**
 * May `actor` submit a request of `type` for `target`?
 *
 * MUTATION_LETTER is never self-service — it's requested by a manager about a
 * report (or by HR/Admin about anyone). Every other type is self-service by
 * default; HR/Admin may additionally request any type on behalf of anyone
 * (`directory:read:all`), matching their company-wide reach elsewhere.
 */
export function canRequestType(
  actor: { role: Role },
  type: GeneratedDocumentType,
  target: RequestTarget,
): boolean {
  if (can(actor.role, "directory:read:all")) return true;

  if (type === "MUTATION_LETTER") {
    return !target.isSelf && target.reportsToActor && can(actor.role, "documents:request:team");
  }

  return target.isSelf && can(actor.role, "documents:request");
}

/**
 * May `actor` validate/reject a pending request of `type`?
 *
 * RECOMMENDATION_LETTER and WORK_CERTIFICATE require HR/Admin — a manager
 * never validates these even though they hold `documents:validate` (that
 * permission alone only unlocks MUTATION_LETTER for their own reports).
 * MUTATION_LETTER may be validated by either the subject's direct manager or
 * HR/Admin (single-step "either" workflow — see plan decision).
 */
export function canValidateType(
  actor: { role: Role },
  type: GeneratedDocumentType,
  isManagerOfSubject: boolean,
): boolean {
  if (!can(actor.role, "documents:validate")) return false;
  if (can(actor.role, "directory:read:all")) return true; // HR_ADMIN / SUPER_ADMIN — any type

  if (type === "MUTATION_LETTER") return isManagerOfSubject;
  return false; // MANAGER cannot validate WORK_CERTIFICATE / RECOMMENDATION_LETTER
}
