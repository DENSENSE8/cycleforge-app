-- 2026-08-20e_reason_codes_command_legacy_sort.sql
--
-- Re-sort the two 2026-08-04 session commands into the unified command
-- ordering — but ONLY where they still hold their original seeded value.
--
-- Plan: docs/todo/universal-scan-router-PLAN.md (P5).
--
-- WHY THIS EXISTS. 2026-08-20d seeded the full vocabulary with a per-family
-- offset (move + 0, act + 1000, session + 2000) so one flow_context sorts
-- coherently. Its ON CONFLICT DO NOTHING correctly left the two pre-existing
-- rows alone — but those rows carry sort_order 10 and 20, which are the SAME
-- values the new jump codes CMD-GO-ARRIVAL and CMD-GO-UNBOX now hold.
--
-- The result is not "session codes sort first", which is what 20d's header
-- predicted and accepted. It is a TIE: two rows at 10, two at 20, ordered
-- arbitrarily by the planner. An admin list whose order changes between reads
-- is worse than one with an odd but stable order, so this corrects it.
--
-- WHY IT IS STILL SAFE. The UPDATE is conditional on the row holding EXACTLY
-- its original seeded sort_order. A tenant who reordered these rows has some
-- other value and is not touched — so this cannot stomp a deliberate choice,
-- which is the reason 20d used DO NOTHING in the first place. Labels are never
-- touched: relabelling is the whole point of these rows existing.
--
-- ROLLBACK:
--   UPDATE reason_codes SET sort_order = 10
--    WHERE flow_context='station_command' AND code='CMD-BATCH-SORT' AND sort_order=2010;
--   UPDATE reason_codes SET sort_order = 20
--    WHERE flow_context='station_command' AND code='CMD-DEFAULT'    AND sort_order=2020;
--
-- VERIFY: no duplicate sort_order within an org's station_command vocabulary —
--   SELECT organization_id, sort_order, count(*) FROM reason_codes
--    WHERE flow_context='station_command' GROUP BY 1,2 HAVING count(*) > 1;

BEGIN;

UPDATE reason_codes
   SET sort_order = 2010
 WHERE flow_context = 'station_command'
   AND code = 'CMD-BATCH-SORT'
   AND sort_order = 10;

UPDATE reason_codes
   SET sort_order = 2020
 WHERE flow_context = 'station_command'
   AND code = 'CMD-DEFAULT'
   AND sort_order = 20;

COMMIT;
