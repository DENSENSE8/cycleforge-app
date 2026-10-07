-- 2026-10-07_a_orders_account_source_backfill.sql
-- Records Phase 3 §3.4.3: a blank-platform order row takes the platform its
-- sibling row of the SAME order already holds.
--
-- Why: 72 orders rows have a blank account_source (71 NULL + 1 ''). 27 of them
-- are extra rows of an order whose first row holds the platform — written
-- Feb–Mar 2026 by the legacy shipped-sheet sync (src/app/api/sync-sheets,
-- deleted 2026-07-29 in c77ec0d1c), which inserted one orders row per sheet
-- tracking line and never wrote account_source. 2026-10-06_account_source_canonical
-- left them blank because every row of the order carries external_line_id = ''
-- and the unique key (organization_id, order_id, account_source, external_line_id)
-- cannot hold two rows on one platform. Blank-platform rows key a separate
-- "order" on the Records sheet ('o:|<order#>'), splitting order lines/totals.
--
-- What: each such row takes its siblings' one platform and the next free line
-- id `line-N` — the multi-line convention of insertOrderRowsInTx
-- (src/lib/orders/create-order.ts): line 1 keeps '', later lines `line-2`, `line-3`….
-- An order whose siblings disagree on the platform is left alone.
-- The other 45 blank rows (order numbers that name no channel, no sibling, no
-- ShipStation / Zoho / label evidence) stay blank by the account_source rule
-- (src/lib/orders/account-source.ts: blank = nothing names the channel).
--
-- Before (read-only, 2026-10-07, primary): 27 rows (2026-02-24 … 2026-03-31)
--   SELECT count(*) FROM orders o
--    WHERE NULLIF(o.account_source, '') IS NULL
--      AND EXISTS (SELECT 1 FROM orders t
--                   WHERE t.organization_id = o.organization_id AND t.order_id = o.order_id
--                     AND t.id <> o.id AND NULLIF(t.account_source, '') IS NOT NULL);
-- Verify: the same count → 0; and
--   SELECT count(*) FROM orders WHERE NULLIF(account_source, '') IS NULL;  -- 72 → 45
--
-- Safety gating: data-only UPDATE inside each row's own tenant (organization_id
-- unchanged); idempotent (only blank rows; a target key already taken is skipped);
-- values satisfy orders_account_source_canonical_chk (copied from canonical rows).
-- The search outbox re-indexes the rows (trg_enqueue_search_outbox_on_orders_upd).
-- ROLLBACK: none needed — the rows name the platform their order already has.

WITH sourced AS (
  SELECT t.organization_id, t.order_id, min(t.account_source) AS account_source, count(*) AS taken
    FROM orders t
   WHERE NULLIF(t.account_source, '') IS NOT NULL
   GROUP BY t.organization_id, t.order_id
  HAVING count(DISTINCT t.account_source) = 1
),
target AS (
  SELECT o.id, s.account_source,
         'line-' || (s.taken + row_number() OVER (PARTITION BY o.organization_id, o.order_id ORDER BY o.id)) AS line_id
    FROM orders o
    JOIN sourced s ON s.organization_id = o.organization_id AND s.order_id = o.order_id
   WHERE NULLIF(o.account_source, '') IS NULL
)
UPDATE orders o
   SET account_source = t.account_source,
       external_line_id = t.line_id
  FROM target t
 WHERE o.id = t.id
   AND NOT EXISTS (
         SELECT 1 FROM orders k
          WHERE k.organization_id = o.organization_id
            AND k.order_id = o.order_id
            AND k.account_source = t.account_source
            AND k.external_line_id = t.line_id);
