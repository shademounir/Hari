-- AI observability + guardrails (SCRUM-062 / SCRUM-063): AiEvent trace table and
-- actionable Alert table (both metadata-only — no message content / PII).
--
-- Hand-edited to drop the diff-noise Prisma emits against the raw-SQL columns it
-- can't model on HandbookChunk (the halfvec/HNSW + generated tsvector/GIN): the
-- generator added `DROP INDEX handbook_embedding_idx`, `DROP INDEX
-- handbook_content_tsv_idx`, and `ALTER COLUMN "contentTsv" DROP DEFAULT` — all
-- spurious. Same convention as add_collection_image / add_assistant_access:
-- this migration touches only the new tables.

-- CreateEnum
CREATE TYPE "AiEventKind" AS ENUM ('TURN', 'TOOL_CALL', 'REFUSAL', 'GUARD_BLOCK', 'CONVERSATION_CLOSED', 'ERROR');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('AI_REFUSAL', 'AI_GUARD_BLOCK', 'AI_ERROR', 'CONVERSATION_CLOSED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "AiEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role" NOT NULL,
    "kind" "AiEventKind" NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "stepCount" INTEGER,
    "finishReason" TEXT,
    "toolName" TEXT,
    "errorCode" TEXT,
    "guardRule" TEXT,
    "reasonCode" TEXT,
    "meta" JSONB,

    CONSTRAINT "AiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "titleKey" TEXT NOT NULL,
    "params" JSONB,
    "href" TEXT,
    "subjectId" TEXT,
    "aiEventId" TEXT,
    "ackById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEvent_conversationId_idx" ON "AiEvent"("conversationId");

-- CreateIndex
CREATE INDEX "AiEvent_createdAt_idx" ON "AiEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AiEvent_kind_idx" ON "AiEvent"("kind");

-- CreateIndex
CREATE INDEX "AiEvent_userId_idx" ON "AiEvent"("userId");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_kind_idx" ON "Alert"("kind");

-- AddForeignKey
ALTER TABLE "AiEvent" ADD CONSTRAINT "AiEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_aiEventId_fkey" FOREIGN KEY ("aiEventId") REFERENCES "AiEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ackById_fkey" FOREIGN KEY ("ackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
