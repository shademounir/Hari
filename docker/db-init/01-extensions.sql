-- Runs once on a fresh Postgres data volume (docker-entrypoint-initdb.d).
-- pgvector ships with the pgvector/pgvector image; `halfvec` requires >= 0.7.
CREATE EXTENSION IF NOT EXISTS vector;
