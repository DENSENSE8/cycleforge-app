-- ============================================================================
-- 2026-08-08a: allow receiving_carton.source = 'amazon' | 'manual'
-- ============================================================================
-- Manual / Amazon inbound purchases + returns land on the Incoming spine via
-- ingestPurchase (desk Add / CSV). When a tracking number is present,
-- ensureReceivingForInboundOrder get-or-creates a pre-arrival carton keyed by
-- (organization_id, source, source_order_id) with source = the inbound
-- source_type — 'amazon' or 'manual'. receiving_source_chk was widened for
-- 'ebay' (2026-07-10_receiving_source_ebay.sql) but NEVER for these two, so
-- every manual/Amazon Add WITH tracking 500'd on the carton INSERT
-- ("violates check constraint receiving_source_chk"). This is the internal
-- receiving anchor only — it creates nothing in Zoho.
--
-- SAFETY: Additive only — existing source values remain valid. Writers
-- (ensureReceivingForInboundOrder) stamp organization_id and run under the
-- ingestPurchase per-(org,source,order) advisory lock; receiving_carton is
-- FORCE RLS (2026-06-19). No column change, so the `receiving` compat view is
-- untouched.
--
-- ROLLBACK:
--   ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_source_chk;
--   ALTER TABLE receiving_carton ADD CONSTRAINT receiving_source_chk
--     CHECK (source IN ('zoho_po','unmatched','local_pickup','sourcing_import','ebay'));
-- VERIFY:
--   \d receiving_carton  — receiving_source_chk includes amazon + manual
-- ============================================================================

BEGIN;

ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_source_chk;
ALTER TABLE receiving_carton
  ADD CONSTRAINT receiving_source_chk
  CHECK (source IN ('zoho_po', 'unmatched', 'local_pickup', 'sourcing_import', 'ebay', 'amazon', 'manual'));

COMMIT;
