-- SCRUM-080: audit the HR decision (validate/reject) on a generated-document
-- request, consistent with the AuditLog trail already used for other
-- sensitive actions (leave decisions, offboarding). Additive enum values
-- only — not used in this migration, so adding them is transaction-safe.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_VALIDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_REJECTED';
