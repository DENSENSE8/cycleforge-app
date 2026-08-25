-- 2026-08-23c_audit_logs_org_not_null_prep.sql
--
-- audit_logs.organization_id: close the remaining NULLs and state exactly what
-- has to be true before it can be tightened to NOT NULL.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §5 ("⚠ audit_logs has no
--       organization_id. Manager reporting must not be built on it without
--       fixing that first") · 04-roadmap.md Phase 8.
--
-- ── FIRST, A CORRECTION TO THE PLAN ─────────────────────────────────────────
--
-- The column ALREADY EXISTS. It was added 2026-05-23
-- (2026-05-23_org_id_on_business_tables.sql, "audit_logs: keep actor-scoped,
-- but stamp org for tenant-scoped views"), backfilled from `staff` via
-- actor_staff_id in that same file, had its residual NULLs stamped onto the
-- dogfood org by 2026-06-20d, gained idx_audit_logs_organization there and
-- idx_audit_logs_org_created (partial, order rows) in 2026-06-24, and was
-- FORCE-RLS'd by 2026-06-28b_enforce_tenant_isolation_backstop_wave6.
-- `recordAudit` has stamped it explicitly since then
-- (src/lib/audit-logs.ts → createAuditLog).
--
-- Writing a fourth ADD COLUMN would have been a no-op that made the schema
-- history read as though the gap were still open. The real gap is narrower and
-- sharper, and it is what this file addresses.
--
-- ── THE REAL GAP: NULLABLE + FORCE RLS = SILENTLY MISSING ROWS ──────────────
--
-- The canonical policy is
--     USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
-- and `NULL = <anything>` is NULL, not true. So a row written with a NULL
-- organization_id is INVISIBLE to every tenant-pool read, forever, with no
-- error anywhere. It is not rejected and it is not filtered — it simply is not
-- in the result.
--
-- This repo already knew that. 2026-06-22_enforce_tenant_isolation_ready_cohort
-- excludes a whole cohort for exactly this reason: "nullable-org tables … a
-- strict =GUC policy would hide existing NULL-org rows; need Phase-B SET NOT
-- NULL first." audit_logs was FORCEd anyway six days later, in wave 6, while
-- still nullable.
--
-- Stack that on top of `recordAudit`'s contract — it catches its own errors and
-- returns null, because "audit must never break the request" — and you have a
-- table that can drop a row on write without complaint and hide a row on read
-- without complaint. That is a fine shape for a compliance trail nobody
-- queries in aggregate. It is a disqualifying shape for a manager report, which
-- is why the plan's warning is right even though its stated reason was not.
--
-- ── WHAT THIS MIGRATION DOES ────────────────────────────────────────────────
--
-- 1. Re-runs the actor→org backfill. Idempotent, non-destructive, and cheap
--    when there is nothing to do. It exists because the 2026-05-23 backfill ran
--    INSIDE an `IF NOT EXISTS (column)` guard — so on any database where the
--    column already existed, the backfill never ran at all.
-- 2. Adds the general org+time index. The only org-scoped index today is
--    PARTIAL on `lower(entity_type) = 'order'` (2026-06-24), deliberately
--    matched to the journey browse branch's predicate. Any reporting read that
--    is not about orders cannot use it.
-- 3. Reports what is left, loudly, in the migration output.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
--
-- It does not SET NOT NULL, and it does not add a `NOT VALID` CHECK as a
-- halfway house. Both would make `createAuditLog`'s INSERT throw on a NULL-org
-- row — and `recordAudit` SWALLOWS that throw. The observable result would not
-- be a loud failure teaching us where the null-org writers are; it would be
-- audit rows silently ceasing to exist. Trading invisible-on-read for
-- gone-on-write is not an improvement.
--
-- ── WHAT THE OPERATOR MUST DO BEFORE NOT NULL CAN LAND ──────────────────────
--
--   (a) Confirm the count below is 0 and stays 0 for a full retention window.
--       Any row this backfill could not resolve had no actor_staff_id AND no
--       organizationIdOverride — decide per source whether it belongs to the
--       dogfood org (as 2026-06-20d decided for the historical NULLs) or is
--       genuinely global.
--
--   (b) Make the null-org path impossible in code first. `recordAudit`
--       (src/lib/audit-logs.ts) resolves org as
--           ctx?.organizationId ?? args.organizationIdOverride ?? null
--       — that trailing `?? null` is the hole. All 12 current `recordAudit(db,
--       null, …)` call sites do pass organizationIdOverride, so the reachable
--       remaining source is an auth context whose organizationId is absent
--       (AnonymousAuthContext). Either give that path an explicit org or make
--       `recordAudit` refuse to write without one — and note that refusing is
--       itself a behaviour change to a function whose entire contract is "never
--       break the request", so it needs its own decision, not a drive-by.
--
--   (c) Only then: ALTER TABLE audit_logs ALTER COLUMN organization_id SET NOT
--       NULL; in its own dated migration. Do it as a separate file so it can be
--       reverted without taking this backfill with it.
--
-- Until (a)-(c) are done, treat audit_logs as a compliance trail, not a
-- reporting source — which is the same conclusion the plan reached, for a
-- reason that turns out to be one layer deeper than "the column is missing".
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_audit_logs_org_created_all;
--   -- the backfill is not rolled back: re-NULLing rows would destroy attribution.
--
-- VERIFY:
--   select count(*) from audit_logs where organization_id is null;   -- want 0
--   select count(*) from audit_logs al
--     where al.organization_id is null and al.actor_staff_id is not null;  -- want 0

BEGIN;

-- 1. Backfill from the actor's org. Guarded on the column existing so this file
--    is safe on a database that somehow predates 2026-05-23.
DO $$
DECLARE
  filled  bigint := 0;
  residue bigint := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs'
       AND column_name = 'organization_id'
  ) THEN
    RAISE NOTICE 'audit_logs.organization_id absent — expected 2026-05-23 to have added it; nothing to do';
    RETURN;
  END IF;

  UPDATE audit_logs a
     SET organization_id = s.organization_id
    FROM staff s
   WHERE s.id = a.actor_staff_id
     AND a.organization_id IS NULL
     AND s.organization_id IS NOT NULL;
  GET DIAGNOSTICS filled = ROW_COUNT;

  SELECT count(*) INTO residue FROM audit_logs WHERE organization_id IS NULL;

  RAISE NOTICE 'audit_logs org backfill: % row(s) attributed from staff; % row(s) still NULL', filled, residue;
  IF residue > 0 THEN
    RAISE NOTICE 'audit_logs: % actorless row(s) remain NULL and are INVISIBLE to tenant reads under FORCE RLS. See this file''s header (a)-(c) before SET NOT NULL.', residue;
  END IF;
END $$;

-- 2. The org+time index reporting actually needs. The 2026-06-24 index is
--    partial on order rows only, matched to the journey browse branch; a
--    session/staff/entity rollup cannot use it.
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_all
  ON audit_logs (organization_id, created_at DESC, id DESC);

COMMENT ON COLUMN audit_logs.organization_id IS
  'Tenant owner. Present since 2026-05-23, FORCE-RLS''d since 2026-06-28b, still NULLABLE — and a NULL row is invisible to every tenant read because the canonical policy compares with =. Do not build reporting on this table until it is NOT NULL; see 2026-08-23c for the preconditions.';

COMMIT;
