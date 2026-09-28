-- Server-side timeouts as ROLE defaults (scale-roi row 1).
--
-- Why: the pooler (PgBouncer transaction mode) rejects `-c statement_timeout`
-- startup options and `pg`'s query_timeout / idle_in_transaction_session_timeout
-- pool options are client-side or ignored. Measured before this migration on the
-- pooler: statement_timeout=0, lock_timeout=0, idle_in_transaction=5min, rolconfig NULL.
-- Role defaults apply when the pooler opens its backend session, so every path
-- (including raw `pool.query` and hand-rolled BEGIN blocks) gets a ceiling.
--
-- app_tenant   (request runtime, RLS-subject): 15s statement, 5s lock, 30s idle-in-tx.
-- neondb_owner (owner pool: crons, MV refresh, admin, migrations): 120s statement,
--              60s idle-in-tx, no lock_timeout (migration runner sets its own).
-- Per-path overrides: tenant BEGIN paths SET LOCAL (src/lib/tenancy/tx-timeouts.ts);
-- the migration runner SET LOCAL statement_timeout = 0; long jobs may SET LOCAL higher.
--
-- Safety: settings only; no data or lock impact. Takes effect for NEW backend sessions.
-- Rollback: ALTER ROLE <role> RESET statement_timeout; (and lock_timeout,
--           idle_in_transaction_session_timeout).
-- Verify:  SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('app_tenant','neondb_owner');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    ALTER ROLE app_tenant SET statement_timeout = '15s';
    ALTER ROLE app_tenant SET lock_timeout = '5s';
    ALTER ROLE app_tenant SET idle_in_transaction_session_timeout = '30s';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER ROLE neondb_owner SET statement_timeout = '120s';
    ALTER ROLE neondb_owner SET idle_in_transaction_session_timeout = '60s';
  END IF;
END $$;
