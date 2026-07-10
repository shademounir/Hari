-- SCRUM-080: audit the HR decision (approve/reject) on a generated-document
-- request. Additive enum values only — not used in this migration, so adding
-- them is transaction-safe.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_VALIDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_REJECTED';
