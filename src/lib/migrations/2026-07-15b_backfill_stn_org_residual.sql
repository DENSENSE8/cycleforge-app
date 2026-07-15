-- ============================================================================
-- 2026-07-15b_backfill_stn_org_residual.sql
--
-- Residual heal for shipping_tracking_numbers rows that still have
-- organization_id IS NULL after 2026-07-14b. New STNs created after that
-- migration (label/sync/import paths that skip healShipmentOrganizationId)
-- leave Packed / staged queue tracking chips blank under FORCE RLS + app_tenant:
-- LEFT JOIN matches o.shipment_id but all stn.* columns return null.
--
-- Same rule as 2026-07-14b: stamp from an unambiguous single-org parent link
-- (orders.shipment_id, shipment_links, receiving_carton, fba_shipment_tracking).
-- Skip shipments claimed by more than one distinct org.
--
-- Safe to re-run (WHERE organization_id IS NULL). Runs as migration owner
-- (BYPASSRLS) so NULL-org STN rows are visible to UPDATE.
--
-- Rollback: none (data heal). Setting organization_id NULL again would re-break
-- tenant-scoped reads — do not reverse.
--
-- Verify after apply:
--   SELECT count(*) FROM shipping_tracking_numbers WHERE organization_id IS NULL;
--   -- Packed rows that previously showed blank tracking (e.g. order 4888,
--   -- 114-2895113-3727432, 111-7073881-0637814) should return non-null
--   -- tracking_number under SET LOCAL app.current_org = '<org>'.
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
