-- Optional decorative cover image for a collection. Stored as text — either a
-- data URL (uploaded in the admin UI) or an external URL. Hand-written so the
-- migration touches only this column and never the raw-SQL HNSW/GIN indexes on
-- HandbookChunk (which Prisma can't model and would otherwise drop/recreate).
ALTER TABLE "KbCollection" ADD COLUMN "image" TEXT;
