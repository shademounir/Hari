-- HARI-RBAC (1/2): new enum values only.
--
-- Split out from the structural change in the next migration on purpose:
-- PostgreSQL forbids USING a value added by `ALTER TYPE ... ADD VALUE` in the
-- same transaction that added it, and Prisma wraps each migration in one. Adding
-- them here leaves the next migration (and the app) free to reference them.
-- `20260713102600_add_kb_document_deleted` stands alone for the same reason.
-- Purely additive: no existing value is renamed or removed.

-- AlterEnum: configurable RBAC (admin:settings). Editing a role rewrites what
-- every holder of it may do, so these are the most sensitive actions on the trail.
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ROLE_DELETED';

-- AlterEnum: user management (employee:manage). Roles are codes, not PII, so a
-- role change records meta: { from, to } — never the target's name or email.
ALTER TYPE "AuditAction" ADD VALUE 'USER_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_REACTIVATED';

-- AlterEnum: an invited account sets its first password with a one-time token.
-- Provisioning still happens server-side — sign-in never creates an account.
ALTER TYPE "AuthTokenType" ADD VALUE 'INVITE';
