-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocVisibility" AS ENUM ('ALL_EMPLOYEES', 'MANAGERS', 'HR_ONLY');

-- AlterTable
ALTER TABLE "HandbookChunk" ADD COLUMN     "anchor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "chunkIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "visibility" "DocVisibility" NOT NULL DEFAULT 'ALL_EMPLOYEES';

-- CreateTable
CREATE TABLE "KbCollection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrDocument" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "DocVisibility" NOT NULL DEFAULT 'ALL_EMPLOYEES',
    "version" INTEGER NOT NULL DEFAULT 1,
    "collectionId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbCollection_slug_key" ON "KbCollection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HrDocument_slug_key" ON "HrDocument"("slug");

-- CreateIndex
CREATE INDEX "HrDocument_collectionId_idx" ON "HrDocument"("collectionId");

-- CreateIndex
CREATE INDEX "HrDocument_status_idx" ON "HrDocument"("status");

-- CreateIndex
CREATE INDEX "HandbookChunk_documentId_idx" ON "HandbookChunk"("documentId");

-- AddForeignKey
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "KbCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandbookChunk" ADD CONSTRAINT "HandbookChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index for fast cosine similarity over the halfvec embedding column.
-- (Recreated here: a prior migration, 20260625211349_add_org_settings, dropped it
-- without restoring it. Prisma can't model an index on an Unsupported column, so
-- it lives in hand-written migration SQL — see docs/architecture/hr-rag-architecture.md.)
CREATE INDEX IF NOT EXISTS "handbook_embedding_idx"
  ON "HandbookChunk" USING hnsw (embedding halfvec_cosine_ops);
