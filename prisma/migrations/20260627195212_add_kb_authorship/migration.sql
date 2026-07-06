-- DropIndex
DROP INDEX "handbook_embedding_idx";

-- AlterTable
ALTER TABLE "HrDocument" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AddForeignKey
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrDocument" ADD CONSTRAINT "HrDocument_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recreate the HNSW index Prisma drops each migration (it can't model an index on
-- the Unsupported halfvec column). See docs/architecture/hr-rag-architecture.md.
CREATE INDEX IF NOT EXISTS "handbook_embedding_idx"
  ON "HandbookChunk" USING hnsw (embedding halfvec_cosine_ops);
