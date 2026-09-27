-- ai_chat_*: staff ownership, stable client message ids, supersede, feedback.
-- WHY: /ai-chat history becomes per-staff (Grok-style private recents) and
--   turns become addressable for regenerate / edit / thumbs.
-- SAFETY: additive nullable columns + indexes. Writers (chat-persistence.ts)
--   stamp staff_id / client_id in the same commit. RLS/FORCE unchanged
--   (both tables enforced 2026-06-22). Legacy rows keep staff_id NULL and are
--   hidden from per-staff lists (deliberate: they were org-shared).
-- ROLLBACK: DROP INDEX IF EXISTS ai_chat_sessions_owner_recent_idx,
--   ai_chat_messages_client_id_live_uq, ai_chat_messages_feedback_idx;
--   ALTER TABLE ai_chat_messages DROP CONSTRAINT IF EXISTS ai_chat_messages_feedback_chk,
--   DROP COLUMN IF EXISTS client_id, superseded_at, feedback, feedback_note, feedback_at;
--   ALTER TABLE ai_chat_sessions DROP COLUMN IF EXISTS staff_id;
-- VERIFY: \d ai_chat_sessions / \d ai_chat_messages show the columns;
--   SELECT count(*) FROM ai_chat_sessions WHERE staff_id IS NULL  -- = legacy rows.
BEGIN;

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

-- Per-staff recent list with keyset paging:
--   WHERE organization_id=$1 AND staff_id=$2 AND deleted_at IS NULL
--   ORDER BY updated_at DESC, id DESC
CREATE INDEX IF NOT EXISTS ai_chat_sessions_owner_recent_idx
  ON ai_chat_sessions (organization_id, staff_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE ai_chat_messages
  ADD COLUMN IF NOT EXISTS client_id     TEXT,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback      SMALLINT,
  ADD COLUMN IF NOT EXISTS feedback_note TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at   TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE ai_chat_messages ADD CONSTRAINT ai_chat_messages_feedback_chk
    CHECK (feedback IS NULL OR feedback IN (-1, 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One LIVE row per client id per thread: a retried send is idempotent
-- (ON CONFLICT DO NOTHING); a superseded row never blocks its replacement.
CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_messages_client_id_live_uq
  ON ai_chat_messages (organization_id, session_id, client_id)
  WHERE client_id IS NOT NULL AND superseded_at IS NULL;

-- Thumbs review queue / eval harvest.
CREATE INDEX IF NOT EXISTS ai_chat_messages_feedback_idx
  ON ai_chat_messages (organization_id, feedback_at DESC)
  WHERE feedback IS NOT NULL;

COMMIT;
