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
    ALTER TABLE orders
      ALTER COLUMN order_date TYPE timestamptz
      USING order_date AT TIME ZONE 'UTC';
    RAISE NOTICE 'orders.order_date converted to timestamptz (naive values read as UTC)';
  ELSE
    RAISE NOTICE 'orders.order_date already timestamptz — no change';
  END IF;
END $$;

COMMIT;
