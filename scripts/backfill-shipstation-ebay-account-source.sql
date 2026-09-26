-- ============================================================================
-- backfill-shipstation-ebay-account-source.sql
--
-- Operator 2026-09-26: the platform "eBay" is a blank placeholder — every order
-- belongs to a specific eBay account. ShipStation already knows which: each of
-- its eBay stores is one account, bound by integration_store_links
-- (provider 'shipstation', external_store_id → platform_account_id). Orders the
-- ShipStation sync imported/adopted before those links existed were filed under
-- the bare platform. The forward leak is closed in code: an adopted row under
-- the bare platform is re-keyed to the linked account
-- (placeholderRowsToRekey, src/lib/orders/order-source-match.ts).
--
-- Scope: orders created on/after 2026-09-19 (the last week, per the operator)
-- whose account_source is the bare platform slug of a ShipStation store link
-- that names an active account, and which carry a shipstation_order_refs row
-- from that store. The order and its refs move onto the account.
--
-- Skipped and REPORTED, never forced:
--   • ambiguous_account — the order's refs resolve to more than one account;
--   • existing_row     — a row already holds (org, order_id, account,
--                        external_line_id): idx_orders_unique_org_account_order_line;
--   • spelling_collision — two placeholder spellings of one line would land on
--                        the same account key.
--
-- STANDALONE OWNER-RUN SCRIPT, NOT a migration. Pure data, idempotent: a second
-- run finds no placeholder rows and touches nothing.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-shipstation-ebay-account-source.sql
-- ============================================================================

BEGIN;

CREATE TEMP TABLE ss_account_backfill ON COMMIT DROP AS
WITH resolved AS (
  SELECT o.id, o.organization_id, o.order_id, o.external_line_id,
         o.account_source AS old_source,
         min(pa.slug) AS account,
         count(DISTINCT pa.slug) AS n_accounts
    FROM orders o
    JOIN shipstation_order_refs r
      ON r.organization_id = o.organization_id AND r.order_row_id = o.id
    JOIN integration_store_links l
      ON l.organization_id = r.organization_id
     AND l.provider = 'shipstation'
     AND l.external_store_id = r.store_id::text
    JOIN platforms p
      ON p.organization_id = l.organization_id AND p.id = l.platform_id
    JOIN platform_accounts pa
      ON pa.organization_id = l.organization_id
     AND pa.id = l.platform_account_id
     AND pa.platform_id = p.id
     AND pa.is_active
   WHERE o.created_at >= TIMESTAMPTZ '2026-09-19 00:00:00+00'
     AND lower(btrim(o.account_source)) = lower(btrim(p.slug))
   GROUP BY o.id, o.organization_id, o.order_id, o.external_line_id, o.account_source
)
SELECT c.*,
       CASE
         WHEN c.n_accounts > 1 THEN 'ambiguous_account'
         WHEN EXISTS (
           SELECT 1 FROM orders x
            WHERE x.organization_id = c.organization_id
              AND x.order_id IS NOT DISTINCT FROM c.order_id
              AND x.account_source = c.account
              AND x.external_line_id = c.external_line_id
         ) THEN 'existing_row'
         WHEN count(*) OVER (PARTITION BY c.organization_id, c.order_id, c.account, c.external_line_id) > 1
           THEN 'spelling_collision'
         ELSE 'rekey'
       END AS outcome
  FROM resolved c;

UPDATE orders o
   SET account_source = b.account
  FROM ss_account_backfill b
 WHERE b.outcome = 'rekey' AND o.id = b.id AND o.organization_id = b.organization_id;

UPDATE shipstation_order_refs r
   SET account_source = b.account
  FROM ss_account_backfill b
 WHERE b.outcome = 'rekey'
   AND r.organization_id = b.organization_id
   AND r.order_row_id = b.id
   AND r.account_source IS DISTINCT FROM b.account;

-- ── Report ──────────────────────────────────────────────────────────────────
SELECT outcome, account, count(*) AS orders
  FROM ss_account_backfill
 GROUP BY 1, 2
 ORDER BY 1, 2;

SELECT id, order_id, old_source, account, outcome
  FROM ss_account_backfill
 WHERE outcome <> 'rekey'
 ORDER BY id;

COMMIT;
