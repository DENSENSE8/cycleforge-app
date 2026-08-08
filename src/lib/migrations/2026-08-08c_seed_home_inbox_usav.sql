-- ============================================================================
-- 2026-08-08c_seed_home_inbox_usav.sql
--
-- WHAT
--   Turn the Home Inbox ON for the USAV dogfood tenant only.
--
-- WHY NOW
--   WS-TASKS makes `staff_inbox_items` the triage surface for a thrown task —
--   one operator hands a record to another instead of writing it on paper. The
--   durable row and its live push land in the same change as this seed, and a
--   task nobody can open is not a handoff.
--
--   `isHomeInbox` (flag key `home_inbox`) is default OFF and, unlike
--   `ops_tv_board`, was never seeded for ANY org — so `GET /api/inbox` and
--   `PATCH /api/inbox/[id]` have been 404ing everywhere since 2026-07-28 and
--   `HomeInboxMode` has only ever rendered its "Inbox isn't switched on yet"
--   empty state. The pipeline behind it has been running the whole time (the
--   cron worker is deliberately NOT flag-gated, so an org flipping the flag on
--   finds its recent history already delivered rather than an empty inbox).
--
--   This also settles the flag's lifecycle: `FLAG_LIFECYCLE.isHomeInbox` moves
--   from `undecided` to `rollout` in the same change (feature-flags-lifecycle.ts).
--   It was born 2026-07-28 against a 90-day `undecided` limit, so the guard
--   would have forced this decision by ~2026-10-26 regardless; dogfooding it is
--   the honest way to make it.
--
-- SAFETY / GATING
--   Data-only and idempotent. Guarded on the org existing, so a fresh / QA /
--   branch DB with no org #1 is a no-op rather than an FK failure. Every other
--   tenant stays OFF until an admin flips their row or the env default changes.
--   Turning it on only makes ALREADY-DELIVERED rows readable — it writes no
--   inbox rows and changes no fan-out behaviour.
--
-- ROLLBACK
--   UPDATE organization_feature_flags SET enabled = false
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      AND flag = 'home_inbox';
--   (Or DELETE the row to fall back to the env default, which is OFF.)
--
-- VERIFY
--   SELECT flag, enabled FROM organization_feature_flags
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      AND flag = 'home_inbox';
--   -- then: GET /api/inbox should 200 instead of 404 for a USAV session.
--
-- Law: .claude/rules/source-of-truth.md → Inbox surfaces
-- ============================================================================

INSERT INTO organization_feature_flags (organization_id, flag, enabled)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'home_inbox', true
WHERE EXISTS (
  SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (organization_id, flag) DO NOTHING;
