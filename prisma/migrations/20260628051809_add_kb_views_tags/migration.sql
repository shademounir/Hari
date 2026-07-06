-- DropIndex
DROP INDEX "handbook_embedding_idx";

-- AlterTable
ALTER TABLE "HrDocument" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- Recreate the HNSW index Prisma drops each migration (Unsupported halfvec column).
CREATE INDEX IF NOT EXISTS "handbook_embedding_idx"
  ON "HandbookChunk" USING hnsw (embedding halfvec_cosine_ops);
