-- 2026-09-22_staff_subscriptions_match_tracking.sql
--
-- Pre-arrival tracking watch — ONE column on staff_subscriptions, not a table.
--
-- Operator 2026-09-22, on being asked where a tracking watch should be stored:
-- "It would have to be tracking number agnostic and just like a notification
-- system … so I would be able to reuse it across different tabs and pages."
--
-- That system already exists. `staff_subscriptions` is one discriminated table
-- over three kinds (see 2026-07-28c's header), and **`rule` is exactly this
-- shape**: a predicate over a CLASS of events rather than a pointer at one
-- row. `staff_subscriptions_entity_shape_chk` forces rule rows to carry NULL
-- entity columns, and `staff_subscriptions_rule_shape_chk` asks only for a
-- non-empty match_event_keys[] — so a rule subscription is INHERENTLY
-- pre-arrival. It does not need the thing it watches for to exist yet, which
-- is the whole property a "tell me when this package lands" watch needs.
--
-- The house rule is that a new table is Ask-first
-- (docs/todo/zoho-received-check-watchlist-PLAN.md refused durable watch rows
-- for a near-identical question). A `tracking_watches` table would have been a
-- second answer to a question this table already answers, and it would have
-- needed its own RLS, its own delete-integrity family and its own fan-out arm.
--
-- WHY A REAL COLUMN AND NOT match_extra:
-- 2026-07-28c lines 18-24 are explicit — "promote queryable business facts to
-- real columns; keep only true variant config in jsonb … match_extra JSONB
-- stays for genuinely variant config ONLY — never for anything the worker
-- filters on". The fan-out worker filters on this, so it is a column with its
-- own partial index, mirroring idx_staff_subscriptions_rule_sku.
--
-- NORMALISED, not raw: the scan side already canonicalises through
-- extractCanonicalTracking / SHIPMENT_SCAN_MATCH_CONDITION. Storing the raw
-- keystrokes would mean a watch typed with spaces never matches the scan that
-- arrives without them.
--
-- NO BACKFILL: NULL already means "don't care about this axis" for every
-- existing rule row (2026-07-28c line 87).
--
-- TENANCY: no new table, so no new RLS surface. staff_subscriptions is already
-- tenant-from-birth with FORCE RLS and the canonical policy.
--
-- ROLLBACK:
--   drop index if exists idx_staff_subscriptions_rule_tracking;
--   alter table staff_subscriptions drop column if exists match_tracking_normalized;
--
-- VERIFY:
--   \d+ staff_subscriptions
--   select indexname from pg_indexes
--    where tablename = 'staff_subscriptions'
--      and indexname = 'idx_staff_subscriptions_rule_tracking';
--   npm run tenancy:coverage

BEGIN;

ALTER TABLE staff_subscriptions
  ADD COLUMN IF NOT EXISTS match_tracking_normalized TEXT;

-- Fan-out arm 2c: "which tracking rules match this scan". Partial on live rule
-- rows so the index stays small as muted / entity rows accumulate — the same
-- shape as idx_staff_subscriptions_rule_sku.
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_rule_tracking
  ON staff_subscriptions (organization_id, match_tracking_normalized)
  WHERE subscription_kind = 'rule'
    AND state <> 'muted'
    AND match_tracking_normalized IS NOT NULL;

-- One live tracking watch per (staff, tracking). Without this a staffer who
-- pastes the same number twice is notified twice for one arrival.
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_subscriptions_rule_tracking
  ON staff_subscriptions (organization_id, staff_id, match_tracking_normalized)
  WHERE subscription_kind = 'rule'
    AND match_tracking_normalized IS NOT NULL;

COMMIT;
