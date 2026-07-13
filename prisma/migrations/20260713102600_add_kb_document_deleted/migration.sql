-- Hand-written: one more KB audit-action value (hard-delete of a document).
-- Separate migration because `ALTER TYPE ... ADD VALUE` and the prior migration
-- were already applied; never edit an applied migration.
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_DELETED';
