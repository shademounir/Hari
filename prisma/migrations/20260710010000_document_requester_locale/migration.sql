-- SCRUM-081: capture the requester's locale at request time so the generated
-- PDF is always rendered in their language, regardless of which HR admin
-- happens to validate it (the app only tracks locale per-browser-cookie, not
-- per-account). Additive, backfilled to the app default ("en").

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
