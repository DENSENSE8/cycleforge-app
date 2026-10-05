import pool from '@/lib/db';
import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { tenantQuery, transitionalDogfoodOrgId } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordOrderCheckInMilestonesForShipment } from '@/lib/support/check-ins/milestones-db';

/** After a shipment tracking status is updated (webhook or sync job), notify all clients so the UI live-updates like the carrier's own website. */
export async function publishShipmentStatusChange({
  shipmentId,
  source,
  trackingNumber,
  carrier,
  statusCategory,
  orgId,
}: {
  shipmentId: number;
  source: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  /** The `latest_status_category` the update just stored (`updateShipmentSummary`'s return). */
  statusCategory?: string | null;
  orgId?: OrgId;
}): Promise<void> {
  // TRANSITIONAL:
  const publishOrgId = orgId ?? transitionalDogfoodOrgId();

  // (1) Shipment-level event first — never gated on order linkage, so a bad
  // orders lookup can't suppress the receiving-panel live update.
  try {
    await publishShipmentChanged({ organizationId: publishOrgId, shipmentId, trackingNumber, carrier, statusCategory, source });
  } catch (error) {
    console.error('[publish-on-status-change] shipment publish failed:', error);
  }

  // (1b) Post-purchase check-in milestone: a delivery projects the owning
  // orders' check-in (tenant-explicit only — never the transitional org).
  // Never throws; the sweep re-projects anything a failure here missed.
  if (orgId && statusCategory === 'DELIVERED') {
    await recordOrderCheckInMilestonesForShipment(orgId, shipmentId);
  }

  // (2) Order-linked views.
  try {
    // `orders` is tenant-owned (organization_id present). Surrogate-PK column
    // shipment_id is an integer FK, so the only org-scoping needed is an
    // explicit AND organization_id = $n when a tenant is threaded.
    const result = orgId
      ? await tenantQuery(
          orgId,
          'SELECT id FROM orders WHERE shipment_id = $1 AND organization_id = $2',
          [shipmentId, orgId]
        )
      : await pool.query(
          'SELECT id FROM orders WHERE shipment_id = $1',
          [shipmentId]
        );
    const orderIds = result.rows
      .map((r: any) => Number(r.id))
      .filter(Number.isFinite);
    if (orderIds.length === 0) return;

    await invalidateAllOrdersApiCaches(['shipped', 'orders-next'], publishOrgId);
    await publishOrderChanged({ organizationId: publishOrgId, orderIds, source });
  } catch (error) {
    console.error('[publish-on-status-change] order publish failed:', error);
  }
}
