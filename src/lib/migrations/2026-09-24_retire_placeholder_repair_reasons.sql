-- ============================================================================
-- 2026-09-24_retire_placeholder_repair_reasons.sql
--
-- WHAT: retire the two placeholder repair-intake reasons "Please wait" (PLEASE_WAIT)
-- and "Skip" (SKIP). They were seeded as real reasons in
-- 2026-06-26_repair_issue_templates.sql:35-36 and
-- 2026-06-28c_reason_codes_flow_context_unique.sql:55 and render as selectable
-- repair reasons on the kiosk ("Reason for repair", /kiosk/v2).
--
-- WHY: owner decision 2026-09-24 (docs/design-system/BRIEF.md, open item 6):
-- "It is not a display bug, they are real seeded reason codes" — remove them from
-- the kiosk reason list.
--
-- HOW: soft-retire, never delete. Readers already filter the flags:
--   - repair_issue_templates → `active = true` (src/lib/neon/repair-issue-queries.ts)
--   - reason_codes          → active reason codes only (getActiveReasonCodes,
--                             GET /api/reason-codes, useReasonVocabulary('repair_failure'))
-- Repairs store the reason LABEL as free text in repair_service.issue, so past
-- repairs that used these labels keep their text; nothing references the rows by id.
-- The built-in fallback registry (src/lib/repair/repair-failure-reasons.ts) drops
-- the same two entries in the same change so an unseeded org doesn't bring them back.
--
-- SAFETY: data-only UPDATE, idempotent (re-running sets the same flags), every
-- org. No DDL, no tenancy change. Admins can re-activate a row from Settings.
--
-- ROLLBACK:
--   UPDATE repair_issue_templates SET active = true
--    WHERE favorite_sku_id IS NULL AND label IN ('Please wait', 'Skip');
--   UPDATE reason_codes SET is_active = true
--    WHERE flow_context = 'repair_failure' AND code IN ('PLEASE_WAIT', 'SKIP');
--
-- VERIFY:
--   SELECT organization_id, label, active FROM repair_issue_templates
--    WHERE favorite_sku_id IS NULL AND label IN ('Please wait', 'Skip');
--   SELECT organization_id, code, is_active FROM reason_codes
--    WHERE flow_context = 'repair_failure' AND code IN ('PLEASE_WAIT', 'SKIP');
-- ============================================================================

BEGIN;

UPDATE repair_issue_templates
   SET active = false
 WHERE favorite_sku_id IS NULL
   AND label IN ('Please wait', 'Skip')
   AND active = true;

UPDATE reason_codes
   SET is_active = false
 WHERE flow_context = 'repair_failure'
   AND code IN ('PLEASE_WAIT', 'SKIP')
   AND is_active = true;

COMMIT;
