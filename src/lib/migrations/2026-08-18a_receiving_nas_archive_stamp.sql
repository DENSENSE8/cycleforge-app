-- ============================================================================
-- 2026-08-18a: receiving_carton NAS-archive stamp
-- ============================================================================
-- `POST /api/receiving/zendesk-claim/archive-only` copies a carton's photos to
-- the ticket's NAS claim folder and writes NOTHING back. So "this ticket has
-- photos that were taken after it was last archived" — the one fact an operator
-- needs in order to know a re-sync is owed — has never been derivable, and no
-- chrome could honestly draw it.
--
-- Three columns, because the state is a THREE-way comparison, not a boolean:
--
--   nas_archived_at        when the last successful copy ran. Compared against
--                          photos.created_at to find shots taken since.
--   nas_archived_ticket    WHICH folder those photos went to. Load-bearing on
--                          its own: a carton relinked from #123 to #456 has an
--                          `at` stamp that is recent and meaningless, and
--                          without this column the new ticket would read as
--                          already-archived and silently never sync.
--   nas_archived_photo_count  what the copy actually reported (`copied`). Kept
--                          for the operator-facing readout and so a partial
--                          copy (copied < total) is visible after the fact
--                          rather than only in the toast that has since gone.
--
-- NULL `nas_archived_at` = never archived, which is the correct starting state
-- for every existing row: no backfill, because we do not know what was copied
-- before this migration and inventing a stamp would mark real pending work as
-- done. Cartons with no ticket are never pending regardless (the reader gates
-- on zendesk_ticket IS NOT NULL), so the NULLs cost nothing on those.
--
-- EXPAND ONLY (.claude/rules/backend-patterns.md → expand → code → contract):
-- nullable ADD COLUMNs land ahead of every reader; the archive route starts
-- writing them in the following change.
--
-- No enforce_tenant_isolation() call: receiving_carton is an existing
-- tenant-isolated table and these are additive columns on it.
--
-- ROLLBACK:
--   ALTER TABLE receiving_carton
--     DROP COLUMN IF EXISTS nas_archived_at,
--     DROP COLUMN IF EXISTS nas_archived_ticket,
--     DROP COLUMN IF EXISTS nas_archived_photo_count;
-- ============================================================================

BEGIN;

ALTER TABLE receiving_carton
  ADD COLUMN IF NOT EXISTS nas_archived_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nas_archived_ticket      TEXT,
  ADD COLUMN IF NOT EXISTS nas_archived_photo_count INTEGER;

COMMENT ON COLUMN receiving_carton.nas_archived_at IS
  'Last successful NAS claim-folder copy for this carton. NULL = never archived. Compared against photos.created_at to derive "photos taken since the last sync".';
COMMENT ON COLUMN receiving_carton.nas_archived_ticket IS
  'Ticket folder nas_archived_at refers to (normalized, no leading #). A carton relinked to a different ticket is pending again even though nas_archived_at is recent.';
COMMENT ON COLUMN receiving_carton.nas_archived_photo_count IS
  'Photos the last copy reported as copied. A value below the carton photo count means the last sync was partial.';

-- The pending sweep reads only ticketed cartons and orders by staleness, so it
-- never scans the (much larger) ticket-less remainder.
CREATE INDEX IF NOT EXISTS idx_receiving_carton_nas_archive_pending
  ON receiving_carton (organization_id, nas_archived_at)
  WHERE zendesk_ticket IS NOT NULL;

COMMIT;
