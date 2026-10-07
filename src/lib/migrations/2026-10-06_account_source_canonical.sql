-- 2026-10-06_account_source_canonical.sql
-- ONE platform vocabulary for `orders.account_source` and every copy of it.
--
-- What: `account_source` held the same platform under several spellings
-- (Amazon/amazon, eBay/ebay, ECWID/ecwid, FBA/fba, QA-DEMO/QA_SANDBOX/QA-TEST/QA),
-- and 708 dogfood rows were blank although their order number names the
-- platform (Amazon 3-7-7, eBay 2-5-5, FBA shipment id, Walmart 15-digit). The
-- writers now store `canonicalAccountSource()` (src/lib/orders/account-source.ts):
-- lower-case, trimmed, whitespace-collapsed; a blank source takes the platform
-- the order number proves; QA / test seed sources collapse to `qa`.
--
-- This migration brings existing rows onto that vocabulary and pins it:
--   1. orders.account_source           — canonical; blank rows inferred from order_id.
--      Rows whose canonical key is already held by a twin on
--      (organization_id, order_id, account_source, external_line_id) — legacy
--      Feb–Mar 2026 second packages of one order, each its own row — keep their
--      current (blank) value: the unique key cannot hold both. They are named by
--      scripts/data-integrity-coverage.ts.
--   2. shipstation_order_refs.account_source, order_import_run_rows.account_source
--      / platform, order_import_exceptions.account_source,
--      label_ingestions.matched_account_source, entity_search_docs.source_platform
--      — lower-cased (order lookups compare these to orders.account_source).
--   3. order_catalog_link_chores.account_source — lower-cased; case twins on
--      (organization_id, item_number, account_source) fold into the canonical row
--      (order_count summed, first/last seen widened) and the twin is deleted.
--   4. orders_account_source_canonical_chk — the DB refuses a non-canonical spelling.
--
-- Safety gating: data-only rewrites inside existing tenant rows (organization_id
-- unchanged); idempotent (every UPDATE filters on IS DISTINCT FROM; the CHECK is
-- added only when absent). Every app writer stores canonicalAccountSource()
-- since the same commit; ShipStation attribution no longer elects a legacy
-- spelling. Readers resolve account_source case-insensitively
-- (buildAccountSourceLookup, sourcePlatformMeta, LOWER(BTRIM()) SQL).
--
-- ROLLBACK: ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_account_source_canonical_chk;
--           (the spelling rewrite is not reversible and needs no reversal — the
--            old spellings named the same platforms.)
--
-- Verify: tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/data-integrity-coverage.ts
--         → no case-variant spellings; blank only for named twins and non-marketplace ids.

CREATE OR REPLACE FUNCTION pg_temp.canon_account_source(raw text, order_id text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN NULLIF(btrim(raw), '') IS NULL THEN
      CASE
        WHEN btrim(order_id) ~ '^\d{3}-\d{7}-\d{7}$' THEN 'amazon'
        WHEN btrim(order_id) ~ '^\d{2}-\d{5}-\d{5}$' THEN 'ebay'
        WHEN btrim(order_id) ~* '^FBA[0-9A-Z]{6,}$' THEN 'fba'
        WHEN btrim(order_id) ~ '^\d{15}$' THEN 'walmart'
        ELSE raw
      END
    WHEN lower(btrim(raw)) ~ '^(qa([-_ ].*)?|test)$' THEN 'qa'
    ELSE lower(regexp_replace(btrim(raw), '\s+', ' ', 'g'))
  END
$$;

-- 1. orders — one winner per target key; a key already held is never taken.
WITH target AS (
  SELECT o.id, o.organization_id, o.order_id, o.external_line_id, o.account_source,
         pg_temp.canon_account_source(o.account_source, o.order_id) AS canon
    FROM orders o
),
ranked AS (
  SELECT t.*,
         row_number() OVER (
           PARTITION BY t.organization_id, t.order_id, t.external_line_id, t.canon
           ORDER BY (t.account_source IS NOT DISTINCT FROM t.canon) DESC,
                    (NULLIF(btrim(t.account_source), '') IS NOT NULL) DESC,
                    t.id
         ) AS rn
    FROM target t
)
UPDATE orders o
   SET account_source = r.canon
  FROM ranked r
 WHERE o.id = r.id
   AND r.rn = 1
   AND r.canon IS DISTINCT FROM r.account_source;

-- 2. Copies compared against orders.account_source.
UPDATE shipstation_order_refs SET account_source = pg_temp.canon_account_source(account_source, order_number)
 WHERE account_source IS DISTINCT FROM pg_temp.canon_account_source(account_source, order_number);

UPDATE order_import_run_rows
   SET account_source = NULLIF(pg_temp.canon_account_source(account_source, external_order_id), ''),
       platform = NULLIF(pg_temp.canon_account_source(platform, NULL), '')
 WHERE account_source IS DISTINCT FROM NULLIF(pg_temp.canon_account_source(account_source, external_order_id), '')
    OR platform IS DISTINCT FROM NULLIF(pg_temp.canon_account_source(platform, NULL), '');

UPDATE order_import_exceptions e
   SET account_source = pg_temp.canon_account_source(e.account_source, NULL)
 WHERE e.account_source IS DISTINCT FROM pg_temp.canon_account_source(e.account_source, NULL)
   AND NOT EXISTS (
     SELECT 1 FROM order_import_exceptions twin
      WHERE twin.organization_id = e.organization_id
        AND twin.account_order_id = e.account_order_id
        AND twin.account_source = pg_temp.canon_account_source(e.account_source, NULL)
        AND twin.id <> e.id);

UPDATE label_ingestions SET matched_account_source = pg_temp.canon_account_source(matched_account_source, NULL)
 WHERE matched_account_source IS DISTINCT FROM pg_temp.canon_account_source(matched_account_source, NULL);

UPDATE entity_search_docs SET source_platform = pg_temp.canon_account_source(source_platform, NULL)
 WHERE source_platform IS DISTINCT FROM pg_temp.canon_account_source(source_platform, NULL);

-- 3. Chores: fold case twins into the canonical row, then rename the rest.
WITH twins AS (
  SELECT loser.id AS loser_id, keeper.id AS keeper_id,
         loser.order_count, loser.first_seen_at, loser.last_seen_at
    FROM order_catalog_link_chores loser
    JOIN order_catalog_link_chores keeper
      ON keeper.organization_id = loser.organization_id
     AND keeper.item_number = loser.item_number
     AND keeper.account_source = pg_temp.canon_account_source(loser.account_source, NULL)
     AND keeper.id <> loser.id
   WHERE loser.account_source IS DISTINCT FROM pg_temp.canon_account_source(loser.account_source, NULL)
),
folded AS (
  UPDATE order_catalog_link_chores k
     SET order_count = k.order_count + agg.order_count,
         first_seen_at = LEAST(k.first_seen_at, agg.first_seen_at),
         last_seen_at = GREATEST(k.last_seen_at, agg.last_seen_at),
         updated_at = now()
    FROM (SELECT keeper_id, SUM(order_count) AS order_count, MIN(first_seen_at) AS first_seen_at,
                 MAX(last_seen_at) AS last_seen_at
            FROM twins GROUP BY keeper_id) agg
   WHERE k.id = agg.keeper_id
  RETURNING k.id  -- a data-modifying CTE runs to completion whether or not it is read
)
DELETE FROM order_catalog_link_chores c
 USING twins
 WHERE c.id = twins.loser_id;

UPDATE order_catalog_link_chores SET account_source = pg_temp.canon_account_source(account_source, NULL)
 WHERE account_source IS DISTINCT FROM pg_temp.canon_account_source(account_source, NULL);

-- 4. Pin the vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_account_source_canonical_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_account_source_canonical_chk
      CHECK (account_source IS NULL OR account_source = lower(regexp_replace(btrim(account_source), '\s+', ' ', 'g')))
      NOT VALID;
    ALTER TABLE orders VALIDATE CONSTRAINT orders_account_source_canonical_chk;
  END IF;
END $$;
