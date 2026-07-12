-- Drop the receiving / receiving_lines compat views (spine-rename shim retirement).
--
-- What / why:
--   2026-07-05d renamed the physical spine tables (receiving → receiving_carton,
--   receiving_lines → receiving_line) and left security_invoker=true auto-updatable
--   pass-through views under the old names so ~900 raw-SQL references kept working.
--   The Wave-1 code cutover (2026-07-11) repointed every app / test / script SQL
--   string onto the canonical physical names, so the shims are now dead weight —
--   and they block the upcoming spine column drops (both views are SELECT *, so any
--   DROP COLUMN would have to drop/recreate them anyway; see 2026-07-05e mechanics).
--
-- Safety gating (verified 2026-07-11 before authoring):
--   - pg_depend: ZERO database objects depend on either compat view (no views,
--     matviews, rules, or triggers). The only real spine-dependent view is
--     v_unfound_queue, which references receiving_carton / receiving_line directly.
--   - Code: repo-wide grep of src/, tests/, scripts/ finds zero remaining SQL refs
--     to the bare legacy names (FROM/JOIN/UPDATE/INSERT INTO/DELETE FROM receiving
--     and receiving_lines); Drizzle pgTable() names already target the base tables.
--     information_schema probes were repointed to the physical names in the same
--     change (they would silently return empty rows once the views vanish).
--   - JSON API envelope keys named receiving_lines / receiving_line are response
--     shape, not SQL — unaffected by this drop.
--
-- Rollback (recreate the shims exactly as 2026-07-05d left them):
--   CREATE VIEW receiving       WITH (security_invoker = true) AS SELECT * FROM receiving_carton;
--   CREATE VIEW receiving_lines WITH (security_invoker = true) AS SELECT * FROM receiving_line;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON receiving       TO app_tenant;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON receiving_lines TO app_tenant;
--
-- Verify after apply:
--   SELECT relname FROM pg_class WHERE relname IN ('receiving','receiving_lines');  -- 0 rows
--   SELECT COUNT(*) FROM receiving_carton;  SELECT COUNT(*) FROM receiving_line;    -- unchanged

BEGIN;

-- Guarded drops: only drop if the legacy name is present AND is a view (relkind 'v').
-- On a fresh DB the 2026-07-05d migration created these views, so this is a plain
-- drop; the relkind guard keeps the file inert if the name were ever a real table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'receiving' AND c.relkind = 'v'
  ) THEN
    DROP VIEW receiving;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'receiving_lines' AND c.relkind = 'v'
  ) THEN
    DROP VIEW receiving_lines;
  END IF;
END $$;

COMMIT;
