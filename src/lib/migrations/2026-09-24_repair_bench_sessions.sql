-- 2026-09-24_repair_bench_sessions.sql
-- repair_bench_sessions — the bench timer for a repair-service ticket
-- (/m/rs/{id}/work). A tech taps Start: the server stamps started_at = NOW();
-- Stop stamps ended_at = NOW(). Duration is always derived (ended_at −
-- started_at) — there is no typed or client-clock duration column, on purpose.
-- The open session is read back from here on every load, so the timer survives
-- a reload / a different phone. Bench log entries (repair_actions.session_id,
-- next migration 2026-09-24b) can attach to the session they were logged in.
--
-- One OPEN session per (org, repair, tech): the partial unique index below.
-- A tech may have closed sessions any number of times; two techs may time the
-- same repair concurrently.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql) so
-- the loud-fail DEFAULT + FORCE RLS + canonical tenant_isolation policy land in
-- one shot. Safe because the only writer (src/lib/repair/bench-session-queries.ts,
-- via /api/repair/bench-sessions) runs inside withTenantTransaction (sets
-- app.current_org) AND stamps organization_id explicitly from the auth context.
--
-- ROLLBACK (after 2026-09-24b is rolled back — repair_actions.session_id FKs here):
--   select relax_tenant_isolation('repair_bench_sessions');
--   DROP TABLE IF EXISTS repair_bench_sessions;
--
-- VERIFY:
--   \d repair_bench_sessions      -- uq_repair_bench_sessions_open is partial (ended_at IS NULL)
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'repair_bench_sessions';

CREATE TABLE IF NOT EXISTS repair_bench_sessions (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  repair_id       INTEGER NOT NULL REFERENCES repair_service(id) ON DELETE CASCADE,
  -- Mirrors repair_actions.staff_id: history outlives a removed staff row.
  staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  CONSTRAINT repair_bench_sessions_end_after_start
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- One open timer per tech per repair (per org). Start is INSERT … ON CONFLICT
-- DO NOTHING against this index, so a double-tap cannot open a second one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_bench_sessions_open
  ON repair_bench_sessions (organization_id, repair_id, staff_id)
  WHERE ended_at IS NULL;

-- The bench screen's read: every session for a repair, newest first.
CREATE INDEX IF NOT EXISTS idx_repair_bench_sessions_org_repair
  ON repair_bench_sessions (organization_id, repair_id, started_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('repair_bench_sessions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — repair_bench_sessions left without FORCE RLS';
  END IF;
END $$;
