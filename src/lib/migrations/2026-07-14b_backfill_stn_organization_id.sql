-- ============================================================================
-- 2026-07-14b_backfill_stn_organization_id.sql
--
-- Heal shipping_tracking_numbers rows that have organization_id IS NULL.
-- Under FORCE RLS + app_tenant, those orphans are invisible to tenant-scoped
-- joins (orders API Pack/staged queues return tracking_number: null even when
-- the carrier tracking exists on the STN row).
--
-- Stamp from an unambiguous single-org parent link (same rule as
-- resolveShipmentOrgId): orders.shipment_id, shipment_links, receiving_carton,
-- fba_shipment_tracking. Skip shipments claimed by more than one distinct org.
--
-- Safe to re-run (WHERE organization_id IS NULL). Runs as migration owner
-- (BYPASSRLS) so NULL-org STN rows are visible to UPDATE.
--
-- Verify after apply:
--   SELECT count(*) FROM shipping_tracking_numbers WHERE organization_id IS NULL;
--   -- then tenant-scoped: tracking_number for a previously-blank Packed row
--     should be non-null (e.g. order 112-1059837-6097801 → …2332).
-- ============================================================================

BEGIN;

UPDATE shipping_tracking_numbers stn
   SET organization_id = src.org_id,
       updated_at = now()
  FROM (
    SELECT shipment_id,
           (array_agg(organization_id ORDER BY organization_id::text))[1] AS org_id
      FROM (
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

        SELECT r.shipment_id, r.organization_id
          FROM receiving_carton r
         WHERE r.shipment_id IS NOT NULL
           AND r.organization_id IS NOT NULL

        UNION ALL

        SELECT fst.tracking_id AS shipment_id, fst.organization_id
          FROM fba_shipment_tracking fst
         WHERE fst.tracking_id IS NOT NULL
           AND fst.organization_id IS NOT NULL
      ) links
     GROUP BY shipment_id
    HAVING COUNT(DISTINCT organization_id) = 1
  ) src
 WHERE stn.id = src.shipment_id
   AND stn.organization_id IS NULL;

COMMIT;
