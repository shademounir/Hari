-- HARI-88 / SCRUM-078: GeneratedDocument model — additive migration.
-- Adds two enums and one table. No existing table or column is modified.
-- File belongs at: prisma/migrations/20260708000000_add_generated_documents/migration.sql

-- CreateEnum
CREATE TYPE "GeneratedDocumentType" AS ENUM ('WORK_CERTIFICATE');

-- CreateEnum
CREATE TYPE "GeneratedDocumentStatus" AS ENUM ('REQUESTED', 'VALIDATED', 'GENERATED', 'DOWNLOADED', 'REJECTED');

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "type" "GeneratedDocumentType" NOT NULL,
    "status" "GeneratedDocumentStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "validatedById" TEXT,
    "rejectionNote" TEXT,
    "pdfUrl" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedDocument_requestedById_idx" ON "GeneratedDocument"("requestedById");

-- CreateIndex
CREATE INDEX "GeneratedDocument_validatedById_idx" ON "GeneratedDocument"("validatedById");

-- CreateIndex
CREATE INDEX "GeneratedDocument_status_idx" ON "GeneratedDocument"("status");

-- CreateIndex
CREATE INDEX "GeneratedDocument_type_idx" ON "GeneratedDocument"("type");

-- CreateIndex
CREATE INDEX "GeneratedDocument_createdAt_idx" ON "GeneratedDocument"("createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
