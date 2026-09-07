import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * After a shipment tracking status is updated (webhook or sync job), notify all
 * clients so the UI live-updates like the carrier's own website.
 *
 * Two audiences:
 *   1. **Always** — a `shipment.changed` event so the receiving/incoming carrier
 *      panels refresh, regardless of whether the shipment is tied to an order.
 *      (Inbound third-party tracking numbers usually have no order linkage.)
 *   2. **Order-linked only** — an `order.changed` event + cache invalidation so
 *      the dashboard/shipped views refresh.
 */
export async function publishShipmentStatusChange(
  shipmentId: number,
  source: string,
  trackingNumber: string | null | undefined,
  /**
   * Tenant scope — REQUIRED, un-defaulted. The realtime fan-out, the cache
   * invalidation and the orders lookup are all org-scoped by it. The removed
   * dogfood-org fallback silently published an org-less caller's events under
   * USAV; callers that genuinely cannot resolve an org (no threaded org, no
   * shipment row org, no linked order) must skip the publish loudly rather
   * than attribute it to a tenant that never owned the shipment.
   */
  orgId: OrgId,
): Promise<void> {

  // (1) Shipment-level event first — never gated on order linkage, so a bad
  // orders lookup can't suppress the receiving-panel live update.
  try {
    await publishShipmentChanged({ organizationId: orgId, shipmentId, trackingNumber, source });
  } catch (error) {
    console.error('[publish-on-status-change] shipment publish failed:', error);
  }

  // (2) Order-linked views.
  try {
    // `orders` is tenant-owned (organization_id present). Surrogate-PK column
    // shipment_id is an integer FK, so the org-scoping is the explicit
    // AND organization_id = $n predicate on the tenant pool.
    const result = await tenantQuery<{ id: number | string }>(
      orgId,
      'SELECT id FROM orders WHERE shipment_id = $1 AND organization_id = $2',
      [shipmentId, orgId],
    );
    const orderIds = result.rows
      .map((r) => Number(r.id))
      .filter(Number.isFinite);

    await invalidateAllOrdersApiCaches(['shipped', 'orders-next'], orgId);
    await publishOrderChanged({ organizationId: orgId, orderIds, source });
  } catch (error) {
    console.error('[publish-on-status-change] order publish failed:', error);
  }
}
