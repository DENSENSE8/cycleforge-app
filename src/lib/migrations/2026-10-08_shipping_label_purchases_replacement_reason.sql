-- shipping_label_purchases.replacement_reason / replacement_note — WHY a
-- replacement label was bought (lost / damaged / wrong item / other) and the
-- operator's free-text note, captured by the replacement-label form and sent
-- on POST /api/shipping/order-labels/purchase (replacementReason /
-- replacementNote). The same reason + note also land in the order-notes trail
-- line the route writes for the buy.
--
-- Safety: additive nullable columns, no default, no backfill — existing rows
-- read NULL (no reason recorded), which is correct. The CHECK only constrains
-- non-NULL values. Deliberately NO "reason only on purpose = 'replacement'"
-- constraint: stub-merge (src/lib/orders/stub-merge.ts) re-purposes ledger rows
-- and must not fail on a row that keeps its recorded reason; the route enforces
-- reason ⇒ replacement at write time (400 otherwise).
-- The table is already tenant-enforced (2026-09-24f); no policy change.
--
-- Rollback:
--   ALTER TABLE shipping_label_purchases
--     DROP CONSTRAINT IF EXISTS shipping_label_purchases_replacement_reason_check,
--     DROP COLUMN IF EXISTS replacement_reason,
--     DROP COLUMN IF EXISTS replacement_note;
-- Verify:
--   SELECT replacement_reason, count(*) FROM shipping_label_purchases
--    WHERE purpose = 'replacement' GROUP BY 1;

ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS replacement_reason TEXT;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS replacement_note TEXT;

ALTER TABLE shipping_label_purchases DROP CONSTRAINT IF EXISTS shipping_label_purchases_replacement_reason_check;
ALTER TABLE shipping_label_purchases ADD CONSTRAINT shipping_label_purchases_replacement_reason_check
  CHECK (replacement_reason IS NULL OR replacement_reason IN ('lost', 'damaged', 'wrong_item', 'other'));
