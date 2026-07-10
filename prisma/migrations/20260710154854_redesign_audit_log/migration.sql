-- SCRUM-064/65/66/67: redesign the AuditLog scaffold added by
-- 20260704105431_add_audit_log before it had any callers (recordAudit was never
-- invoked from actions.ts/page.tsx/route.ts), so it is safe to drop and recreate
-- rather than migrate data. New shape: audit now covers AI refusals (guard block
-- + tool refusal), alert status changes, and alerts-console access; actor/AiEvent
-- become real FKs (SetNull on delete, so the trail survives account deletion);
-- `alertId` is dropped in favor of the generic targetType/targetId pair already
-- used elsewhere in this trail. Gated by the new `audit:read` permission
-- (SUPER_ADMIN only — stricter than `alerts:read`).

-- DropTable
DROP TABLE "AuditLog";

-- DropEnum
DROP TYPE "AuditAction";

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('AI_REFUSAL', 'ALERT_STATUS_CHANGE', 'ADMIN_ALERTS_ACCESS');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "aiEventId" TEXT,
    "meta" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_aiEventId_fkey" FOREIGN KEY ("aiEventId") REFERENCES "AiEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
