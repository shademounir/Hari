-- Hardening migration: rate-limit counters + KB audit-action enum values.
-- Hand-written (NOT `migrate dev` output) so it touches ONLY these two additions
-- and leaves the raw-SQL objects Prisma can't model (the HandbookChunk FTS index,
-- the halfvec HNSW index, the generated `contentTsv` column) untouched.

-- AlterEnum: KB management actions for the sensitive-action audit trail.
ALTER TYPE "AuditAction" ADD VALUE 'KB_COLLECTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_COLLECTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_COLLECTION_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_UNPUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'KB_DOCUMENT_ARCHIVED';

-- CreateTable: fixed-window rate-limit counters.
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_bucket_key_windowStart_key" ON "RateLimit"("bucket", "key", "windowStart");
