-- 2026-09-28x: order fulfillment lane 'TESTED' → 'PICKED' (stored values).
--
-- WHY: the pre-dock lane an order enters on its desk pick scan was named
-- TESTED from the days the tech bench did both jobs. QC is now its own
-- station (/test, testing_results verdicts), so a lane called "Tested" that
-- actually means "picked" misleads every reader. The code rename
-- (src/lib/order-lifecycle.ts FulfillmentLane / OrderLifecycleStage, the
-- `?stage=` / `?ustatus=` vocabulary, labels) ships in the same change; this
-- file moves the values that are STORED:
--   1. feed_memberships.state 'tested' → 'picked' (orders_unshipped lane,
--      `Lowercase<FulfillmentState>` written by feed-membership-projection.ts),
--      with the state CHECK redefined to the new union (registry.ts
--      FEED_MEMBERSHIP_STATES; pinned by src/lib/surfaces/registry.test.ts).
--   2. staff_preferences.prefs.unshippedBoard lane keys ("TESTED" in `lanes`
--      and `order`) → "PICKED", so a staffer's lane layout survives.
--   3. reason_codes tenant label overrides (flow_context 'lifecycle_unshipped',
--      code 'TESTED') → 'PICKED', unless that org already has a PICKED row.
-- Surveyed before writing (dev DB, 2026-09-28): feed_memberships 2 rows,
-- staff_preferences 2 rows, reason_codes 0 rows; saved_views / view_monitors /
-- nav_definitions / nav_recents and every text column hold no `stage=tested`
-- or `ustatus=TESTED`. audit_logs / serial_units 'TESTED' values are the serial
-- unit state (a different vocabulary) and are deliberately untouched.
--
-- SAFETY: pure data rewrite + CHECK swap on existing tables; no new table, so
-- no tenant DDL. Old code reading a 'picked' row would treat it as an unknown
-- lane for the minutes between migrate and deploy — the orders_unshipped
-- projector rewrites every row on its next pass either way. Idempotent: every
-- UPDATE is keyed on the old value, the CHECK is dropped/re-added.
--
-- ROLLBACK:
--   ALTER TABLE feed_memberships DROP CONSTRAINT IF EXISTS feed_memberships_state_chk;
--   UPDATE feed_memberships SET state = 'tested' WHERE state = 'picked';
--   ALTER TABLE feed_memberships ADD CONSTRAINT feed_memberships_state_chk
--     CHECK (state IN ('active','needs_match','done','pending','tested','blocked'));
--   UPDATE staff_preferences
--      SET prefs = jsonb_set(prefs, '{unshippedBoard}', replace((prefs->'unshippedBoard')::text, '"PICKED"', '"TESTED"')::jsonb)
--    WHERE (prefs->'unshippedBoard')::text LIKE '%"PICKED"%';
--   UPDATE reason_codes SET code = 'TESTED' WHERE flow_context = 'lifecycle_unshipped' AND code = 'PICKED';
--
-- VERIFY:
--   SELECT count(*) FROM feed_memberships WHERE state = 'tested';                       -- 0
--   SELECT count(*) FROM staff_preferences WHERE (prefs->'unshippedBoard')::text LIKE '%"TESTED"%'; -- 0
--   SELECT count(*) FROM reason_codes WHERE flow_context = 'lifecycle_unshipped' AND code = 'TESTED'; -- 0

ALTER TABLE feed_memberships DROP CONSTRAINT IF EXISTS feed_memberships_state_chk;

UPDATE feed_memberships SET state = 'picked' WHERE state = 'tested';

ALTER TABLE feed_memberships ADD CONSTRAINT feed_memberships_state_chk
  CHECK (state IN ('active','needs_match','done','pending','picked','blocked'));

UPDATE staff_preferences
   SET prefs = jsonb_set(prefs, '{unshippedBoard}', replace((prefs->'unshippedBoard')::text, '"TESTED"', '"PICKED"')::jsonb)
 WHERE (prefs->'unshippedBoard')::text LIKE '%"TESTED"%';

UPDATE reason_codes rc
   SET code = 'PICKED'
 WHERE rc.flow_context = 'lifecycle_unshipped'
   AND rc.code = 'TESTED'
   AND NOT EXISTS (
     SELECT 1 FROM reason_codes p
      WHERE p.organization_id = rc.organization_id
        AND p.flow_context = 'lifecycle_unshipped'
        AND p.code = 'PICKED'
   );
