-- ============================================================================
-- 2026-07-12_seed_ops_tv_board_usav.sql
--
-- HOME-OPS Phase C — turn the Operations TV / wall-display board ON for the
-- USAV dogfood tenant only (plan §28, dogfood-first rollout). The surface is
-- gated by isOpsTvBoard(orgId) (feature-flags.ts, flag key `ops_tv_board`,
-- default OFF via env OPS_TV_BOARD). This seeds the per-org override row so USAV
-- dogfoods before any customer org sees it.
--
-- Data-only, idempotent. Guarded on the org existing so a fresh / QA / branch DB
-- (no org #1) is a no-op rather than an FK failure. Other tenants stay OFF until
-- an admin flips their row or the env default is enabled.
-- ============================================================================

INSERT INTO organization_feature_flags (organization_id, flag, enabled)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'ops_tv_board', true
WHERE EXISTS (
  SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (organization_id, flag) DO NOTHING;
