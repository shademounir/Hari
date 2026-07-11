-- SCRUM-100: extend the audit trail with further significant actions and access
-- to the audit console itself. Additive enum values only — not used in this
-- migration, so adding them is transaction-safe.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'AUDIT_CONSOLE_VIEWED';
