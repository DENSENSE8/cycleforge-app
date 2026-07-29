-- 2026-07-29_orders_order_date_timestamptz.sql
--
-- orders.order_date: `timestamp without time zone` → `timestamptz`.
--
-- WHY: `order_date` holds an INSTANT — the moment a customer placed the order
-- (Ecwid's `createDate`, which carries a real time of day). The house date SoT
-- (src/utils/date.ts, .claude/rules/source-of-truth.md → "Dates & times") keeps
-- three types strictly separate and says an instant is stored as `timestamptz`.
-- A civil DATE (a calendar day with no time) would be the naive type; this is
-- not that.
--
-- The Drizzle model has declared `timestamp('order_date', { withTimezone: true })`
-- all along, so this migration removes real model↔DB drift rather than creating
-- it. No schema.ts change accompanies this file — the model was already right.
--
-- WHY THE EXPLICIT `USING ... AT TIME ZONE 'UTC'`:
-- A bare `ALTER COLUMN ... TYPE timestamptz` reinterprets each naive value using
-- the SESSION's TimeZone setting, so the same migration would produce different
-- instants on a UTC box vs a Pacific one — silently shifting every historical
-- order by 7-8 hours depending on who ran it. Every existing value is naive UTC:
-- both writers (this repo's Ecwid exception-tracking sync via
-- `parseEcwidOrderDate`, and the 2026-07-29 transfer-job backfill which wrote
-- `deadline_at AT TIME ZONE 'UTC'`) hand the driver a JS Date, which serializes
-- as a UTC ISO string that Postgres then stores offset-stripped. Spot-checked
-- against known rows before writing this. Pinning 'UTC' makes the conversion
-- deterministic and environment-independent.
--
-- WHY THE TRIGGER IS DROPPED AND RECREATED:
-- Postgres refuses `ALTER COLUMN ... TYPE` on a column named in a trigger's
-- `UPDATE OF` list or `WHEN` clause ("cannot alter type of a column used in a
-- trigger definition"). `trg_enqueue_search_outbox_on_orders_upd` — the
-- search-doc freshness tap that feeds `entity_search_outbox` — names
-- `order_date` in BOTH. It is dropped and recreated **byte-identically** to
-- `pg_get_triggerdef()` output captured immediately before this migration, so
-- the search waist is unchanged: same column list, same WHEN predicate, same
-- `fn_enqueue_entity_search_outbox('ORDER')` target. The whole file is one
-- transaction, so a failure anywhere leaves the trigger in place.
--
-- NOT IN SCOPE: `orders.created_at` is also `timestamp without time zone` and
-- has the same problem. It is left alone deliberately — it is written by far
-- more paths and read by day-bucketing logic that would need auditing first.
-- Converting it is its own migration with its own review.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'order_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_orders_upd ON orders;

    ALTER TABLE orders
      ALTER COLUMN order_date TYPE timestamptz
      USING order_date AT TIME ZONE 'UTC';

    -- Exact restoration of the pre-migration definition.
    CREATE TRIGGER trg_enqueue_search_outbox_on_orders_upd
      AFTER UPDATE OF order_id, product_title, sku, account_source, status,
                      condition, notes, shipment_id, order_date
      ON public.orders
      FOR EACH ROW
      WHEN (
        old.order_id       IS DISTINCT FROM new.order_id
        OR old.product_title IS DISTINCT FROM new.product_title
        OR old.sku           IS DISTINCT FROM new.sku
        OR old.account_source IS DISTINCT FROM new.account_source
        OR old.status        IS DISTINCT FROM new.status
        OR old.condition     IS DISTINCT FROM new.condition
        OR old.notes         IS DISTINCT FROM new.notes
        OR old.shipment_id   IS DISTINCT FROM new.shipment_id
        OR old.order_date    IS DISTINCT FROM new.order_date
      )
      EXECUTE FUNCTION fn_enqueue_entity_search_outbox('ORDER');

    RAISE NOTICE 'orders.order_date converted to timestamptz (naive values read as UTC); search trigger restored';
  ELSE
    RAISE NOTICE 'orders.order_date already timestamptz — no change';
  END IF;
END $$;

COMMIT;
