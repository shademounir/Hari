-- SCRUM-094: extend GeneratedDocument beyond WORK_CERTIFICATE. Purely additive —
-- new enum values (Postgres requires one ADD VALUE per statement, and it cannot
-- run inside the same transaction as their first use, hence the separate
-- statement group below), two new nullable columns, and their FKs/indexes.
-- Nothing existing is altered or dropped.

-- AlterEnum
ALTER TYPE "GeneratedDocumentType" ADD VALUE 'LEAVE_CONFIRMATION';
ALTER TYPE "GeneratedDocumentType" ADD VALUE 'MUTATION_LETTER';
ALTER TYPE "GeneratedDocumentType" ADD VALUE 'RECOMMENDATION_LETTER';
ALTER TYPE "GeneratedDocumentType" ADD VALUE 'HR_SUMMARY';

-- AlterTable
ALTER TABLE "GeneratedDocument"
    ADD COLUMN "subjectId" TEXT,
    ADD COLUMN "leaveRequestId" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedDocument_subjectId_idx" ON "GeneratedDocument"("subjectId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_leaveRequestId_idx" ON "GeneratedDocument"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
