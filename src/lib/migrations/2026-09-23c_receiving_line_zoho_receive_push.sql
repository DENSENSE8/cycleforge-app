-- ============================================================================
-- 2026-09-23c_receiving_line_zoho_receive_push.sql
--
-- WHAT: give `receiving_line_zoho` the three retry columns a drain loop needs:
--         zoho_receive_attempts    int         — pushes tried for this line
--         zoho_receive_attempted_at timestamptz — last attempt (backoff clock)
--         zoho_receive_error       text        — last failure, operator-readable
--       plus a partial index on the pending-push predicate.
--
-- WHY: the Zoho purchase-receive push moved OFF the mark-received request tail
--   and onto a bulk backfill (cron `zoho.receive_backfill` + the manual Backfill
--   button on the Zoho connection). That drain's worklist is DERIVED, not a
--   queue table — "locally DONE, Zoho-linked, no purchase-receive id yet" IS the
--   backlog, so there is no second source of truth to keep in sync and a crashed
--   run self-heals on the next tick.
--
--   What a derived worklist cannot carry is retry state. Without it a PO that
--   Zoho permanently refuses (missing catalog item_id, revoked scope) is retried
--   on every tick forever and starves the POs behind it — exactly the failure
--   `order_ingest_queue` avoids with attempts/last_error (2026-06-07). These
--   three columns are that same retry state, on the facts table that already
--   exists, so no new table and no dual write.
--
-- SAFETY: pure additive DDL on an existing tenant-FORCEd table
--   (receiving_line_zoho was enforced in 2026-06-29c). All three columns are
--   nullable with a 0 default on the counter, so every existing row reads as
--   "never attempted" — which is true, and is exactly what the first backfill
--   run should see. No writer changes are required for the migration to be
--   correct: the columns are inert until runZohoReceiveBackfill writes them.
--   organization_id / RLS are untouched (the table is already tenant-from-birth).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_receiving_line_zoho_receive_pending;
--   ALTER TABLE receiving_line_zoho
--     DROP COLUMN IF EXISTS zoho_receive_attempts,
--     DROP COLUMN IF EXISTS zoho_receive_attempted_at,
--     DROP COLUMN IF EXISTS zoho_receive_error;
--
-- VERIFY:
--   \d receiving_line_zoho   → the three columns exist.
--   SELECT count(*) FROM receiving_line_zoho
--    WHERE zoho_purchase_receive_id IS NULL
--      AND zoho_purchaseorder_id IS NOT NULL
--      AND zoho_line_item_id IS NOT NULL;
--   → the initial backlog the first backfill run will drain.
-- ============================================================================

ALTER TABLE receiving_line_zoho
  ADD COLUMN IF NOT EXISTS zoho_receive_attempts     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoho_receive_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_receive_error        text;

COMMENT ON COLUMN receiving_line_zoho.zoho_receive_attempts IS
  'Purchase-receive push attempts by the zoho.receive_backfill drain. Drives the backoff ladder and the give-up ceiling.';
COMMENT ON COLUMN receiving_line_zoho.zoho_receive_attempted_at IS
  'Last push attempt. The drain skips rows attempted inside their backoff window so one poison PO cannot starve the queue.';
COMMENT ON COLUMN receiving_line_zoho.zoho_receive_error IS
  'Last push failure, verbatim, for the operator-facing backlog readout. Cleared on success.';

-- The drain claims on exactly this predicate; org leads the key because every
-- read is per-tenant (forEachOrgWithProvider fans out one org at a time).
CREATE INDEX IF NOT EXISTS idx_receiving_line_zoho_receive_pending
  ON receiving_line_zoho (organization_id, zoho_purchaseorder_id, zoho_receive_attempted_at)
  WHERE zoho_purchase_receive_id IS NULL
    AND zoho_purchaseorder_id IS NOT NULL
    AND zoho_line_item_id IS NOT NULL;
