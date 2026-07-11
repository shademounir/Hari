-- SCRUM-064: minimal audit trail of sensitive admin/security actions. Purely
-- additive (enum + table + indexes). Prisma's dev diff also emitted spurious
-- drift statements for the raw-SQL-managed HandbookChunk generated column and
-- the pgvector/FTS indexes — removed here so they are never touched.

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'ALERT_REOPENED', 'ALERTS_CONSOLE_VIEWED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorRole" "Role" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "alertId" TEXT,
    "aiEventId" TEXT,
    "meta" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
