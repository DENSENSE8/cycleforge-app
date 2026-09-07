-- 2026-09-06: ai_chat_sessions — recoverable soft delete
--
-- The nav spine's Sessions list gains Rename/Delete triage (AI-first nav
-- Feature 2). Delete is a RECOVERABLE soft-delete — the ChatGPT-style
-- archive-vs-delete data-loss guard — not a destructive row removal: set
-- deleted_at, exclude the row from every list, keep it restorable within the
-- retention window. A later cron sweep hard-deletes rows past the window.
--
-- Code landing with this migration (same commit):
--   src/lib/drizzle/schema.ts                          — deletedAt column
--   src/app/api/ai/chat-sessions/route.ts              — list excludes deleted;
--                                                        query DELETE soft-deletes
--   src/app/api/ai/chat-sessions/[sessionId]/route.ts  — PATCH rename +
--                                                        DELETE soft-delete

BEGIN;

ALTER TABLE ai_chat_sessions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The list query is `WHERE deleted_at IS NULL ORDER BY updated_at DESC`; a
-- partial index keeps it index-only as soft-deleted rows accumulate.
CREATE INDEX IF NOT EXISTS ai_chat_sessions_live_updated_idx
  ON ai_chat_sessions (updated_at)
  WHERE deleted_at IS NULL;

COMMIT;
