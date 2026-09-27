-- ai_usage_events: meter assistant chat turns (plan §C.2, sessions-conveniences S3).
-- WHY: /api/assistant/chat never recorded usage — only the embed paths did.
--   Each assistant turn now writes one `assistant_turn` row (tokens summed over
--   the tool loop's rounds) tied to its chat session and staffer, with the
--   turn's wall time and Cloudflare AI Gateway log id so a row links to CF's
--   own cost record. `assistant_aux` is reserved for side calls (follow-up
--   model fallback).
-- SAFETY: additive nullable columns + a partial index; the CHECK is widened
--   (a superset of the old list), so every existing row still satisfies it.
--   RLS / FORCE unchanged; the writer (src/lib/ai/usage.ts) passes
--   organization_id explicitly. session_id has no FK on purpose: usage rows
--   outlive chat purges.
-- ROLLBACK: DROP INDEX IF EXISTS idx_ai_usage_events_org_session;
--   ALTER TABLE ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_context_chk;
--   ALTER TABLE ai_usage_events ADD CONSTRAINT ai_usage_events_context_chk
--     CHECK (context IN ('query_embed','doc_embed','ask_ai'));   -- only after deleting assistant_* rows
--   ALTER TABLE ai_usage_events DROP COLUMN IF EXISTS gateway_log_id,
--     DROP COLUMN IF EXISTS latency_ms, DROP COLUMN IF EXISTS session_id,
--     DROP COLUMN IF EXISTS staff_id;
-- VERIFY: SELECT context, session_id, staff_id, latency_ms FROM ai_usage_events
--   WHERE context = 'assistant_turn' ORDER BY id DESC LIMIT 5;
BEGIN;

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS staff_id       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id     TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms     INTEGER,
  ADD COLUMN IF NOT EXISTS gateway_log_id TEXT;

ALTER TABLE ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_context_chk;
ALTER TABLE ai_usage_events ADD CONSTRAINT ai_usage_events_context_chk
  CHECK (context IN ('query_embed', 'doc_embed', 'ask_ai', 'assistant_turn', 'assistant_aux'));

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_org_session
  ON ai_usage_events (organization_id, session_id)
  WHERE session_id IS NOT NULL;

COMMIT;
