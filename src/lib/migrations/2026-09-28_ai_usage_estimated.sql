-- ai_usage_events.estimated: flag rows whose token counts are ESTIMATED (SCALE-ROI row 12 / A5).
-- WHY: every model call is now metered inside postToAiProvider (src/lib/ai/failover.ts),
--   including providers that report no `usage` (local runtimes, some gateways) and
--   calls that failed after spending (a timeout, a body that errored mid-stream).
--   Those rows carry a bytes/4 estimate instead of zero, and this flag keeps them
--   distinguishable from provider-reported counts in rollups and billing audits.
-- SAFETY: additive column with a constant default — metadata-only on PG 11+, no
--   rewrite; every existing row reads false (provider-reported or unknown).
--   RLS / FORCE unchanged.
-- ROLLBACK: ALTER TABLE ai_usage_events DROP COLUMN IF EXISTS estimated;
-- VERIFY: SELECT context, provider, input_tokens, output_tokens, estimated
--   FROM ai_usage_events ORDER BY id DESC LIMIT 5;
BEGIN;

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS estimated BOOLEAN NOT NULL DEFAULT false;

COMMIT;
