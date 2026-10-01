-- 2026-09-30_backfill_stn_org_from_packer_logs.sql
--
-- Heal NULL-org shipping_tracking_numbers rows using every tenant-owned shipment
-- reference used by the packed/fulfilled path: orders, shipment_links, and
-- packer_logs. A NULL organization_id is invisible under FORCE RLS, so changing
-- a tenant query's JOIN predicate cannot recover it; the ownership fact must be
-- repaired on the parent row.
--
-- Safety gate: only one-org evidence is accepted across ALL three sources.
-- Ambiguous shipments remain NULL for operator review; an org is never guessed.
-- The UPDATE runs as the migration owner (BYPASSRLS), changes NULL rows only,
-- and is idempotent.
--
-- Verify after apply (run the two CTEs below with the UPDATE replaced by):
--   SELECT count(*)
--     FROM shipping_tracking_numbers stn
--     JOIN unambiguous_owner owner ON owner.shipment_id = stn.id
--    WHERE stn.organization_id IS NULL;
-- Expected: 0.
--
-- Rollback: no automatic rollback. The guard writes only ownership derived from
-- unanimous tenant-owned references; clearing those values would recreate an
-- RLS-invisible integrity defect.

WITH ownership_evidence AS (
  SELECT o.shipment_id, o.organization_id
    FROM orders o
   WHERE o.shipment_id IS NOT NULL
     AND o.organization_id IS NOT NULL

  UNION ALL

  SELECT sl.shipment_id, sl.organization_id
    FROM shipment_links sl
   WHERE sl.shipment_id IS NOT NULL
     AND sl.organization_id IS NOT NULL

  UNION ALL

  SELECT pl.shipment_id, pl.organization_id
    FROM packer_logs pl
   WHERE pl.shipment_id IS NOT NULL
     AND pl.organization_id IS NOT NULL
), unambiguous_owner AS (
  SELECT shipment_id,
         MIN(organization_id::text)::uuid AS organization_id
    FROM ownership_evidence
   GROUP BY shipment_id
  HAVING COUNT(DISTINCT organization_id) = 1
)
UPDATE shipping_tracking_numbers stn
   SET organization_id = owner.organization_id,
       updated_at = now()
  FROM unambiguous_owner owner
 WHERE stn.id = owner.shipment_id
   AND stn.organization_id IS NULL;

DO $$
DECLARE
  remaining_derivable INTEGER;
BEGIN
  WITH ownership_evidence AS (
    SELECT o.shipment_id, o.organization_id
      FROM orders o
     WHERE o.shipment_id IS NOT NULL
       AND o.organization_id IS NOT NULL

    UNION ALL

    SELECT sl.shipment_id, sl.organization_id
      FROM shipment_links sl
     WHERE sl.shipment_id IS NOT NULL
       AND sl.organization_id IS NOT NULL

    UNION ALL

    SELECT pl.shipment_id, pl.organization_id
      FROM packer_logs pl
     WHERE pl.shipment_id IS NOT NULL
       AND pl.organization_id IS NOT NULL
  ), unambiguous_owner AS (
    SELECT shipment_id
      FROM ownership_evidence
     GROUP BY shipment_id
    HAVING COUNT(DISTINCT organization_id) = 1
  )
  SELECT COUNT(*) INTO remaining_derivable
    FROM shipping_tracking_numbers stn
    JOIN unambiguous_owner owner ON owner.shipment_id = stn.id
   WHERE stn.organization_id IS NULL;

  IF remaining_derivable <> 0 THEN
    RAISE EXCEPTION
      'POST-CHECK FAILED: % NULL-org tracking row(s) still have unambiguous ownership evidence',
      remaining_derivable;
  END IF;
END $$;

