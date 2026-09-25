-- ============================================================================
-- 2026-09-25_ecwid_single_platform.sql
--
-- WHAT: Ecwid reads as ONE platform. Audit (USAV org, 2026-09-25):
--
--   platforms          ecwid (id 7, "ECW")                       ← the one platform
--   platform_accounts  ecwid-main (id 18, "ECWID")               ← seeded default = the platform
--                      shipstation-246252 (id 344,
--                        "New Ecwid by Lightspeed Store")        ← ShipStation store mirror (duplicate)
--   orders.account_source   ecwid ×523 · ECWID ×8 · Ecwid ×6     ← legacy spellings
--
-- Receiving/inbound (receiving, receiving_carton .source_platform), listings,
-- chores, label ingestions and shipstation_order_refs already read `ecwid`.
-- No FK (types, receiving_line, inbound_purchase_order_links/_mirror,
-- platform_listings) points at account 18 or 344.
--
-- HOW (nothing is deleted):
--   1. The ShipStation mirror account is retired by
--      2026-09-25_integration_store_links.sql (store 246252 → link on the
--      `ecwid` platform, account deactivated) — not here.
--   2. Legacy spellings are backfilled to the catalog slug `ecwid` — EXCEPT a
--      row whose (order_id, external_line_id) already exists under `ecwid`.
--      Five 'ECWID' rows (ids 3123 3124 3125 3128 3132, Feb 2026) are a SECOND
--      order row for an order that already has an `ecwid` row with a different
--      shipment: duplicate orders, not a spelling. Re-keying them would violate
--      idx_orders_unique_org_account_order_line; merging them is a separate,
--      reviewed decision, so they are left untouched here.
--   Orders' search docs re-index through trg_enqueue_search_outbox_on_orders_upd.
--   The seeded `ecwid-main` default stays; the platform picker never lists a
--   `<platform>-main` account beside its own platform.
--
-- SAFETY: data-only, idempotent (a no-op once applied), exact-value scoped.
--
-- VERIFY:
--   SELECT account_source, count(*) FROM orders WHERE account_source ~* '^ecwid$' GROUP BY 1;
--     -- ecwid ×532, ECWID ×5 (the duplicate orders above)
--
-- ROLLBACK: none — the spellings named one platform.
-- ============================================================================

BEGIN;

UPDATE orders o
   SET account_source = 'ecwid'
 WHERE o.account_source IN ('ECWID', 'Ecwid')
   AND NOT EXISTS (
     SELECT 1
       FROM orders twin
      WHERE twin.organization_id = o.organization_id
        AND twin.order_id = o.order_id
        AND twin.account_source = 'ecwid'
        AND twin.external_line_id IS NOT DISTINCT FROM o.external_line_id
   );

COMMIT;
