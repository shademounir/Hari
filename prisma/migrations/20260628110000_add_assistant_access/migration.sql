-- AI-assistant access policy for the Knowledge Base (super-admin controlled).
-- An additive gate: it can remove content from what the assistant retrieves, but
-- never widens access beyond the existing status + visibility-tier RBAC filters.
--
-- A chunk is assistant-eligible iff
--   COALESCE(document."assistantEnabled", collection."assistantEnabled") = true
-- so a document override (true/false) wins over the collection default, and NULL
-- inherits the collection. Enforced by a live join in lib/rag.ts (no re-ingest).
--
-- Hand-written so it touches only these two columns and never the raw-SQL HNSW /
-- GIN indexes on HandbookChunk (which Prisma can't model and would otherwise
-- drop/recreate). Both default so existing content stays available — opt-out is
-- always explicit.
ALTER TABLE "KbCollection" ADD COLUMN "assistantEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "HrDocument" ADD COLUMN "assistantEnabled" BOOLEAN;
