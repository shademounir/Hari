-- Lexical (full-text) search column for hybrid retrieval. Generated + STORED from
-- the heading and body using the language-agnostic 'simple' config (no stemming),
-- which is safe across EN/FR and ideal for exact-term/acronym recall. to_tsvector
-- with a literal regconfig is IMMUTABLE, so it's valid in a generated column.
ALTER TABLE "HandbookChunk"
  ADD COLUMN "contentTsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(section, '') || ' ' || coalesce(content, ''))
  ) STORED;

-- GIN index powers the lexical half of the hybrid query (ts_rank_cd over @@).
-- Prisma can't model an index on this column, so it lives here.
CREATE INDEX "handbook_content_tsv_idx" ON "HandbookChunk" USING gin ("contentTsv");

-- Recreate the HNSW index Prisma drops each migration (Unsupported halfvec column).
CREATE INDEX IF NOT EXISTS "handbook_embedding_idx"
  ON "HandbookChunk" USING hnsw (embedding halfvec_cosine_ops);
