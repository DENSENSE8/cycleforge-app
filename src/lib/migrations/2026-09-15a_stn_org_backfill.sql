-- 2026-09-15a_stn_org_backfill.sql
--
-- STAMP organization_id ON THE NULL-ORG TRACKING ROWS.
--
-- ## What was broken
--
-- `shipping_tracking_numbers` had 369 rows with `organization_id IS NULL`, all
-- `source_system = 'scan'`, the newest from 2026-09-14 — an active leak, not
-- legacy debt. 287 of them were already carrier-active (accepted / in transit /
-- out for delivery / delivered).
--
-- Cause: `ingest-canonical-orders.ts` — the single shared order-ingest writer —
-- called `resolveShipmentId(tracking)` without an org. `resolveShipmentId`'s
-- `orgId` is optional as a migration affordance, and `shipping/repository.ts`
-- has two branches: the scoped one stamps the column AND heals a pre-existing
-- NULL on conflict (`COALESCE(existing, EXCLUDED)`), while the unscoped one
-- omits the column entirely. Every import went down the unscoped branch. Fixed
-- in that file (it now threads `effectiveOrgId`), which also arms the existing
-- heal path for any row a future import touches.
--
-- ## Why NULL is not merely untidy
--
-- RLS policies read `organization_id = current_setting('app.current_org')::uuid`.
-- For a NULL column that comparison is NULL — not true — so the row is
-- INVISIBLE to `app_tenant`. Legacy queries use the owner pool and never
-- noticed; the new tenant-scoped pick list did: it saw the LEFT JOIN produce
-- NULL, concluded "not shipped", and counted parcels already in carrier hands
-- as pick work (60 vs the true 58 on 2026-09-14).
--
-- ## Derivation, and why it is safe
--
-- `orders.shipment_id` references these rows. Measured before writing:
--   369 NULL-org rows
--   327 referenced by orders of exactly ONE organization  → derivable
--     0 referenced by orders of MORE than one organization → no ambiguity
--    42 referenced by no order at all
--
-- Of those 42, SIX are still reachable: `shipment_links` carries its own
-- `organization_id`, and all six resolve to exactly one org through their link
-- rows (all `owner_type = 'ORDER'`). They are stamped in a second pass, from
-- link evidence rather than order evidence, under the same one-org guard.
--
-- The HAVING COUNT(DISTINCT organization_id) = 1 guard is what makes both
-- passes safe: a row reachable from two tenants would be a genuine integrity
-- problem and must not be silently assigned to whichever org sorts first.
-- There are none today; the guard keeps that true if this is ever re-run.
--
-- The remaining 36 stay NULL deliberately. No order and no link references
-- them, so there is no evidence of ownership — inventing one would be a guess
-- written to production. They need an operator decision (pre-tenancy junk vs
-- cross-org), and 7 of them are carrier-active, so they are not inert.
--
-- Idempotent: `WHERE s.organization_id IS NULL` means a second run updates 0.
-- No DDL, so no rollback DDL; `organization_id` was NULL before and the guard
-- means only unambiguous rows change.

BEGIN;

DO $$
DECLARE
  before_null       INTEGER;
  derivable         INTEGER;
  ambiguous         INTEGER;
  orphans           INTEGER;
  updated           INTEGER;
  updated_via_links INTEGER;
  after_null        INTEGER;
  unprovable        INTEGER;
BEGIN
  SELECT COUNT(*) INTO before_null
    FROM shipping_tracking_numbers WHERE organization_id IS NULL;

  SELECT COUNT(*) INTO derivable FROM (
    SELECT s.id
      FROM shipping_tracking_numbers s
      JOIN orders o ON o.shipment_id = s.id
     WHERE s.organization_id IS NULL
     GROUP BY s.id
    HAVING COUNT(DISTINCT o.organization_id) = 1
  ) d;

  SELECT COUNT(*) INTO ambiguous FROM (
    SELECT s.id
      FROM shipping_tracking_numbers s
      JOIN orders o ON o.shipment_id = s.id
     WHERE s.organization_id IS NULL
     GROUP BY s.id
    HAVING COUNT(DISTINCT o.organization_id) > 1
  ) a;

  SELECT COUNT(*) INTO orphans
    FROM shipping_tracking_numbers s
   WHERE s.organization_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.shipment_id = s.id);

  RAISE NOTICE 'NULL-org tracking rows before: % (derivable %, ambiguous %, orphans %)',
    before_null, derivable, ambiguous, orphans;

  -- A row reachable from two tenants is an integrity problem, not a backfill
  -- candidate. Refuse the whole migration rather than pick a winner.
  IF ambiguous > 0 THEN
    RAISE EXCEPTION 'REFUSING BACKFILL: % tracking row(s) are referenced by orders of more than one organization. Resolve those by hand first.', ambiguous;
  END IF;

  UPDATE shipping_tracking_numbers s
     SET organization_id = d.organization_id,
         updated_at = now()
    FROM (
      SELECT o.shipment_id AS id, MIN(o.organization_id::text)::uuid AS organization_id
        FROM orders o
       WHERE o.shipment_id IS NOT NULL
       GROUP BY o.shipment_id
      HAVING COUNT(DISTINCT o.organization_id) = 1
    ) d
   WHERE s.id = d.id
     AND s.organization_id IS NULL;

  GET DIAGNOSTICS updated = ROW_COUNT;

  -- SECOND PASS — link evidence. `shipment_links` is the sole shipment-linkage
  -- SoT and carries its own `organization_id`, so a row with no surviving
  -- `orders.shipment_id` pointer can still prove its owner through a link.
  -- Same one-org guard.
  UPDATE shipping_tracking_numbers s
     SET organization_id = l.organization_id,
         updated_at = now()
    FROM (
      SELECT sl.shipment_id AS id, MIN(sl.organization_id::text)::uuid AS organization_id
        FROM shipment_links sl
       WHERE sl.shipment_id IS NOT NULL
       GROUP BY sl.shipment_id
      HAVING COUNT(DISTINCT sl.organization_id) = 1
    ) l
   WHERE s.id = l.id
     AND s.organization_id IS NULL;

  GET DIAGNOSTICS updated_via_links = ROW_COUNT;

  SELECT COUNT(*) INTO after_null
    FROM shipping_tracking_numbers WHERE organization_id IS NULL;

  SELECT COUNT(*) INTO unprovable
    FROM shipping_tracking_numbers s
   WHERE s.organization_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.shipment_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM shipment_links sl WHERE sl.shipment_id = s.id);

  RAISE NOTICE 'stamped % row(s) from orders + % from links; % NULL-org row(s) remain, all unprovable (%)',
    updated, updated_via_links, after_null, unprovable;

  -- Every remaining NULL must be a row with NO evidence of ownership. If one
  -- remains that IS reachable, a derivation missed it and that must be loud.
  IF after_null <> unprovable THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: % NULL-org rows remain but only % are unprovable — a derivable row was missed.', after_null, unprovable;
  END IF;
END $$;

COMMIT;
