-- DropIndex
DROP INDEX "handbook_embedding_idx";

-- CreateTable
CREATE TABLE "KbFeedback" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbFeedback_documentId_voterId_key" ON "KbFeedback"("documentId", "voterId");

-- AddForeignKey
ALTER TABLE "KbFeedback" ADD CONSTRAINT "KbFeedback_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbFeedback" ADD CONSTRAINT "KbFeedback_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate the HNSW index Prisma drops each migration (Unsupported halfvec column).
CREATE INDEX IF NOT EXISTS "handbook_embedding_idx"
  ON "HandbookChunk" USING hnsw (embedding halfvec_cosine_ops);
