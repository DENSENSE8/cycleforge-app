-- 2026-09-24e_repair_actions_bin_and_ticket_post.sql
-- Two operator decisions on the bench log (repair_actions), 2026-09-24:
--
-- 1. Take-from-stock is tied to ONE bin ("tied to the specific bin, updating
--    that bin's count"). The action's transaction decrements bin_contents for
--    that bin AND writes the sku_stock_ledger delta; deleting the action puts
--    both back. The action remembers where the part came from:
--
--      stock_location_id → locations(id): the bin the installed part was taken
--                          from (NULL = nothing taken, or a pre-bin entry whose
--                          reversal is ledger-only).
--      stock_qty         → how many were taken from that bin (the reversal
--                          adds exactly this back).
--
-- 2. Each new bench log entry on a repair whose helpdesk link is `linked`
--    posts to the Zendesk ticket as a note, after commit, idempotently. The
--    per-action post record:
--
--      ticket_post_status       → 'pending' | 'posted' | 'failed' (NULL = not
--                                 eligible / never attempted).
--      ticket_post_ticket_id    → the Zendesk ticket id the note went to.
--      ticket_comment_id        → the Zendesk comment id once posted; with
--                                 status 'posted' it is the never-post-twice
--                                 guard.
--      ticket_post_error        → last failure text (NULL once posted).
--      ticket_post_attempted_at → when the current/last attempt was claimed; a
--                                 'pending' row older than the stale window can
--                                 be re-claimed by the retry route.
--
-- Additive and backward compatible: every column is nullable with no default;
-- existing rows keep their meaning. Writers: src/lib/repair/repair-action-queries.ts
-- (POST/DELETE /api/repair/actions) and src/lib/repair/repair-action-ticket-post.ts
-- (after-commit post + POST /api/repair/actions/[id]/ticket-post).
--
-- Tenancy: repair_actions is already FORCE-RLS enforced (2026-06-22f); no new
-- table, nothing to enforce. Every write stamps/filters organization_id.
--
-- ROLLBACK:
--   ALTER TABLE repair_actions
--     DROP COLUMN IF EXISTS stock_location_id, DROP COLUMN IF EXISTS stock_qty,
--     DROP COLUMN IF EXISTS ticket_post_status, DROP COLUMN IF EXISTS ticket_post_ticket_id,
--     DROP COLUMN IF EXISTS ticket_comment_id, DROP COLUMN IF EXISTS ticket_post_error,
--     DROP COLUMN IF EXISTS ticket_post_attempted_at;
--   (constraints and the index drop with their columns)
--
-- VERIFY:
--   \d repair_actions   -- the seven columns above, repair_actions_ticket_post_status_check,
--                       -- repair_actions_stock_qty_check, repair_actions_stock_bin_pair_check
--   SELECT count(*) FROM repair_actions WHERE ticket_post_status IS NOT NULL;  -- 0 right after apply

ALTER TABLE repair_actions
  ADD COLUMN IF NOT EXISTS stock_location_id        INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_qty                INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_post_status       TEXT,
  ADD COLUMN IF NOT EXISTS ticket_post_ticket_id    BIGINT,
  ADD COLUMN IF NOT EXISTS ticket_comment_id        BIGINT,
  ADD COLUMN IF NOT EXISTS ticket_post_error        TEXT,
  ADD COLUMN IF NOT EXISTS ticket_post_attempted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_actions_ticket_post_status_check'
       AND conrelid = 'repair_actions'::regclass
  ) THEN
    ALTER TABLE repair_actions
      ADD CONSTRAINT repair_actions_ticket_post_status_check
      CHECK (ticket_post_status IS NULL OR ticket_post_status IN ('pending', 'posted', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_actions_stock_qty_check'
       AND conrelid = 'repair_actions'::regclass
  ) THEN
    ALTER TABLE repair_actions
      ADD CONSTRAINT repair_actions_stock_qty_check
      CHECK (stock_qty IS NULL OR stock_qty > 0);
  END IF;

  -- A bin take always records how many; a quantity never floats without its bin
  -- (the bin itself may later go NULL via ON DELETE SET NULL, so only one way).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_actions_stock_bin_pair_check'
       AND conrelid = 'repair_actions'::regclass
  ) THEN
    ALTER TABLE repair_actions
      ADD CONSTRAINT repair_actions_stock_bin_pair_check
      CHECK (stock_location_id IS NULL OR stock_qty IS NOT NULL);
  END IF;
END $$;
