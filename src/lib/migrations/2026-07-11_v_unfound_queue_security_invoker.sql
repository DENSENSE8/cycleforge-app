-- v_unfound_queue: flip to security_invoker over the FORCE-RLS receiving spine.
--
-- What / why:
--   v_unfound_queue (created 2026-05-22, last rebuilt 2026-07-03b) reads the
--   FORCE-RLS spine tables (receiving_carton, receiving_line, serial_units,
--   serial_unit_provenance, unfound_overlay, shipping_tracking_numbers,
--   email_missing_purchase_orders) but was created WITHOUT security_invoker.
--   A plain (definer-semantics) view evaluates RLS as the view OWNER —
--   neondb_owner, which has BYPASSRLS — so a query through this view by the
--   tenant app role was not org-filtered by RLS. The house rule (CLAUDE.md /
--   source-of-truth) is that any view over FORCE-RLS tables must be
--   security_invoker = true (PG15+), matching the 2026-07-05d compat views.
--
-- Safety gating (verified live 2026-07-11):
--   - All 7 relations the view depends on (pg_depend) already have SELECT
--     granted to app_tenant, so invoker-semantics resolution succeeds for the
--     tenant role; RLS now filters by the caller's app.current_org GUC.
--   - neondb_owner (BYPASSRLS) callers see identical results as before.
--   - The unfound-queue API route runs org-scoped, so rows it sees are the
--     same set RLS now enforces — this is a belt-and-braces fix, not a
--     behavior change for correct callers.
--
-- Rollback:
--   ALTER VIEW v_unfound_queue RESET (security_invoker);
--
-- Verify after apply:
--   SELECT reloptions FROM pg_class WHERE relname = 'v_unfound_queue';
--   -- expect {security_invoker=true}

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_unfound_queue' AND c.relkind = 'v'
  ) THEN
    ALTER VIEW v_unfound_queue SET (security_invoker = true);
  END IF;
END $$;

COMMIT;
