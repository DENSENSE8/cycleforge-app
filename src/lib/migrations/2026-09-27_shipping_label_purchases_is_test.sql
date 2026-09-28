-- shipping_label_purchases.is_test — marks a label bought on a ShipStation
-- SANDBOX key (a free test label, never postage). Development and sandbox orgs
-- may only buy these (src/lib/shipping/shipstation/test-mode.ts); the chat's
-- void_label refuses to void a non-test label there.
--
-- Safety: additive column with a constant default — existing rows (all bought
-- on live keys) read false, which is correct. The table is already
-- tenant-enforced (2026-09-24f); no policy change.
-- Rollback: ALTER TABLE shipping_label_purchases DROP COLUMN IF EXISTS is_test;
-- Verify: SELECT count(*) FILTER (WHERE is_test) FROM shipping_label_purchases;

ALTER TABLE shipping_label_purchases
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
