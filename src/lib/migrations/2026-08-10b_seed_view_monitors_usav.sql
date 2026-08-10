-- ============================================================================
-- 2026-08-10b_seed_view_monitors_usav.sql
--
-- WHAT
--   Turn watch-a-view (feature flag key `view_monitors`) ON for the USAV
--   dogfood tenant only.
--
-- WHY
--   `isViewMonitors` is default OFF (env `VIEW_MONITORS` unset) so no other
--   tenant sees the arm UX, the /api/view-monitors routes, or the cron's fire
--   path until the feature has proven out on dogfood. This seed makes the
--   dogfood org the single rollout surface; the cost budget (5-min interval,
--   MAX_VIEW_MONITORS_PER_ORG cap) is tracked here before the flag is widened.
--   Settles FLAG_LIFECYCLE.isViewMonitors as `rollout` (bornAt 2026-08-10).
--
-- SAFETY / GATING
--   Data-only and idempotent. Guarded on the org existing, so a fresh / QA /
--   branch DB with no org #1 is a no-op rather than an FK failure. Every other
--   tenant stays OFF until an admin flips their row or the env default changes.
--   Independent of the view_monitors table (writes organization_feature_flags),
--   but ordered `b` to land after the table for a clean single-apply.
--
-- ROLLBACK
--   UPDATE organization_feature_flags SET enabled = false
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      AND flag = 'view_monitors';
--   (Or DELETE the row to fall back to the env default, which is OFF.)
--
-- VERIFY
--   SELECT flag, enabled FROM organization_feature_flags
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      AND flag = 'view_monitors';
-- ============================================================================

INSERT INTO organization_feature_flags (organization_id, flag, enabled)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'view_monitors', true
WHERE EXISTS (
  SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (organization_id, flag) DO NOTHING;
