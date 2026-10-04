-- 2026-10-03_label_ingestions_buyer_pairing.sql
-- Bulk-uploaded labels pair to orders by what the label itself prints
-- (src/lib/label-ingestions/label-text-layout.ts, exact-resolver.ts):
--
--   detected_ship_to_name   the recipient name read off the label (text layer)
--                           — the buyer-name pairing key, and the key a
--                           confirmed exception re-resolves its siblings by.
--                           Only this one line is kept; raw PDF text is still
--                           never persisted.
--   match_method            + TRACKING_NUMBER            label tracking already on one order
--                           + BUYER_NAME                 the buyer has exactly one open order
--                           + BUYER_NAME_NEXT_UNLABELED  the buyer's other orders already hold
--                                                        labels → the most recent unlabeled one
--                           + OPERATOR_CONFIRMED         an operator confirmed the exception
--   idx (org, matched_order_id)  "does this order already hold a label" — the
--                           resolver asks it for every buyer-name candidate.
--
-- Additive: one nullable bounded column, a widened CHECK, one partial index.
-- Every existing row satisfies the new constraints. Tenancy unchanged:
-- label_ingestions is FORCE-RLS (2026-09-18_v1_label_ingestions.sql) and every
-- writer runs inside withTenantTransaction.
--
-- ROLLBACK (after clearing rows that use the new match methods):
--   DROP INDEX IF EXISTS idx_label_ingestions_org_matched_order;
--   ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_match_method_chk;
--   ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_match_method_chk
--     CHECK (match_method IS NULL OR match_method IN ('CYCLEFORGE_REFERENCE', 'MARKETPLACE_ORDER_ID'));
--   ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_ship_to_name_chk;
--   ALTER TABLE label_ingestions DROP COLUMN IF EXISTS detected_ship_to_name;

ALTER TABLE label_ingestions ADD COLUMN IF NOT EXISTS detected_ship_to_name TEXT;

ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_ship_to_name_chk;
ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_ship_to_name_chk
  CHECK (detected_ship_to_name IS NULL OR char_length(detected_ship_to_name) BETWEEN 1 AND 160);

ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_match_method_chk;
ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_match_method_chk
  CHECK (match_method IS NULL OR match_method IN (
    'CYCLEFORGE_REFERENCE',
    'MARKETPLACE_ORDER_ID',
    'TRACKING_NUMBER',
    'BUYER_NAME',
    'BUYER_NAME_NEXT_UNLABELED',
    'OPERATOR_CONFIRMED'
  ));

CREATE INDEX IF NOT EXISTS idx_label_ingestions_org_matched_order
  ON label_ingestions (organization_id, matched_order_id)
  WHERE matched_order_id IS NOT NULL;
