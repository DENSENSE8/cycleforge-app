-- ============================================================================
-- 2026-09-27_automation_rules_assign_work_pick.sql
--
-- WHAT
--   Rewrites every automation_rules.then_json action
--   { "type": "assign_work", "work_type": "TEST" } to "work_type": "PICK".
--
-- WHY
--   An order-level TEST assignee only ever meant the picker (the listing
--   auto-assign card labels that slot "Picker"). With the PICK work type
--   (2026-09-27_work_type_pick.sql) the automation writes ORDER/PICK rows, and
--   AutomationAssignAction / parseAssignActions accept only PICK | PACK — a
--   rule still tagged TEST would be dropped by the parser.
--   Measured 2026-09-27 (dev): 1 rule, 1 TEST action.
--
-- SAFETY / GATING
--   Apply together with the code that parses work_type PICK
--   (src/lib/automations/listing-match.ts, src/lib/schemas/automations.ts).
--   Data-only, org-agnostic by design: each row is rewritten in place and keeps
--   its organization_id. Idempotent: a second run matches no TEST action.
--   automation_runs history is left as recorded.
--
-- ROLLBACK
--   UPDATE automation_rules r
--      SET then_json = (
--            SELECT jsonb_agg(
--                     CASE WHEN a->>'type' = 'assign_work' AND a->>'work_type' = 'PICK'
--                          THEN jsonb_set(a, '{work_type}', '"TEST"') ELSE a END
--                     ORDER BY ord)
--              FROM jsonb_array_elements(r.then_json) WITH ORDINALITY AS t(a, ord))
--    WHERE jsonb_typeof(r.then_json) = 'array'
--      AND r.then_json @> '[{"type": "assign_work", "work_type": "PICK"}]';
--
-- VERIFY
--   SELECT count(*) FROM automation_rules
--    WHERE then_json @> '[{"type": "assign_work", "work_type": "TEST"}]';  -- expect 0
-- ============================================================================

UPDATE automation_rules r
   SET then_json = (
         SELECT jsonb_agg(
                  CASE WHEN a->>'type' = 'assign_work' AND a->>'work_type' = 'TEST'
                       THEN jsonb_set(a, '{work_type}', '"PICK"') ELSE a END
                  ORDER BY ord)
           FROM jsonb_array_elements(r.then_json) WITH ORDINALITY AS t(a, ord)),
       updated_at = NOW()
 WHERE jsonb_typeof(r.then_json) = 'array'
   AND r.then_json @> '[{"type": "assign_work", "work_type": "TEST"}]';
