-- ============================================================================
-- 2026-09-23d_receiving_line_zoho_receive_settled.sql
--
-- WHAT: add `receiving_line_zoho.zoho_receive_settled_at` and re-cut the
--   pending-push index onto it. Fixes 2026-09-23c, which is already applied and
--   therefore immutable.
--
-- WHY: 2026-09-23c made "no `zoho_purchase_receive_id`" mean "still owes Zoho a
--   push". That conflates two different facts, and the difference is not
--   academic — it is most of the live backlog:
--
--     SELECT m.status, count(*) FROM <pending POs> p
--       LEFT JOIN zoho_po_mirror m ON m.zoho_purchaseorder_id::text = p.po
--      GROUP BY 1;
--     →  received  1561
--        issued       5
--
--   1561 of 1566 pending POs are ALREADY received in Zoho. Nothing needs to be
--   pushed for them; the local row simply never recorded that. And several
--   provider paths legitimately settle a PO without handing back a receive id
--   (`markasreceived` on a billed PO, the "you have already created a receive"
--   response), so there is no id to write even when we do call out.
--
--   Without a separate marker those lines can never leave the worklist: the
--   drain re-reads them every tick, burns an attempt each time, and retires
--   them at the ceiling as if they had failed. `zoho_purchase_receive_id` keeps
--   its honest meaning — a receive WE created — and this column carries the
--   weaker, sufficient claim: the provider is at or ahead of us, stop pushing.
--
--   It also unlocks the mirror pre-settle: `zoho_po_mirror` is refreshed every
--   15 minutes by `zoho.po_sync`, so a PO it reports terminal can be settled in
--   ONE SQL statement instead of 1561 rate-limited round-trips. Staleness is
--   safe in the only direction that matters — a lagging mirror reports the
--   OLDER status (issued), which routes the PO to the live path rather than
--   silently skipping a push.
--
-- SAFETY: additive nullable column on an existing tenant-FORCEd table
--   (receiving_line_zoho, enforced 2026-06-29c). Every existing row reads NULL
--   = "not settled", which is the correct starting state: the first drain run
--   is exactly what decides. The replaced index is dropped only after the new
--   one exists. No writer outside runZohoReceiveBackfill touches the column.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_receiving_line_zoho_receive_pending_v2;
--   ALTER TABLE receiving_line_zoho DROP COLUMN IF EXISTS zoho_receive_settled_at;
--   CREATE INDEX IF NOT EXISTS idx_receiving_line_zoho_receive_pending
--     ON receiving_line_zoho (organization_id, zoho_purchaseorder_id, zoho_receive_attempted_at)
--     WHERE zoho_purchase_receive_id IS NULL
--       AND zoho_purchaseorder_id IS NOT NULL
--       AND zoho_line_item_id IS NOT NULL;
--
-- VERIFY:
--   SELECT count(*) FROM receiving_line rl
--     JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
--    WHERE rl.workflow_status = 'DONE'
--      AND rz.zoho_purchase_receive_id IS NULL
--      AND rz.zoho_receive_settled_at  IS NULL
--      AND rz.zoho_purchaseorder_id    IS NOT NULL
--      AND rz.zoho_line_item_id        IS NOT NULL;
--   → 1830 before the first drain run; ~5 POs' worth after the mirror settle.
-- ============================================================================

ALTER TABLE receiving_line_zoho
  ADD COLUMN IF NOT EXISTS zoho_receive_settled_at timestamptz;

COMMENT ON COLUMN receiving_line_zoho.zoho_receive_settled_at IS
  'The provider is at or ahead of this line — stop pushing. Set by a receive we created, by a PO the mirror or Zoho reports terminal, or by "already received". Weaker than zoho_purchase_receive_id, which means WE minted that receive.';

-- Re-cut onto the real predicate. Both columns must be NULL for a line to owe
-- the provider a push.
CREATE INDEX IF NOT EXISTS idx_receiving_line_zoho_receive_pending_v2
  ON receiving_line_zoho (organization_id, zoho_purchaseorder_id, zoho_receive_attempted_at)
  WHERE zoho_purchase_receive_id IS NULL
    AND zoho_receive_settled_at  IS NULL
    AND zoho_purchaseorder_id    IS NOT NULL
    AND zoho_line_item_id        IS NOT NULL;

DROP INDEX IF EXISTS idx_receiving_line_zoho_receive_pending;
