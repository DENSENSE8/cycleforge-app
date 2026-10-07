import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { createStationActivityLog } from '@/lib/station-activity';
import { createPackerLog } from '@/lib/packing/packer-log-writer';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { publishActivityLogged, publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';

/**
 * Mark as packed (`POST`) — the Live feed's Picked-aisle desk verb. The
 * operator says who packed it (`packedByStaffId`); the write is the same
 * PACK_COMPLETED a pack-station scan leaves (`station_activity_logs`, station
 * PACK), so stage facts, the board lanes, and every pack-scan probe agree.
 * An order without a shipment (a counter pickup) cannot be keyed and is
 * reported back as skipped, not failed.
 */

const Body = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(500),
  packedByStaffId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(Body, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;

    const marked = await withTenantTransaction(orgId, async (client) => {
      const { rows } = await client.query<{
        id: number;
        shipment_id: number | null;
        tracking: string | null;
      }>(
        `SELECT o.id, o.shipment_id, stn.tracking_number_raw AS tracking
           FROM orders o
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
          WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
        [orgId, parsed.orderIds],
      );
      const markedIds: number[] = [];
      const shipmentIds: number[] = [];
      const activityIds: (number | null)[] = [];
      const skipped: { id: number; reason: string }[] = [];
      for (const row of rows) {
        if (row.shipment_id == null) {
          skipped.push({ id: row.id, reason: 'no shipment to key the pack on' });
          continue;
        }
        // The packer log is the ORDERS pack the ship-confirm trigger requires —
        // without it the box cannot scan out (migration 2026-09-30).
        await createPackerLog(client, {
          organizationId: orgId,
          shipmentId: row.shipment_id,
          scanRef: row.tracking ?? null,
          trackingType: 'ORDERS',
          packedBy: parsed.packedByStaffId,
          source: 'orders-mark-packed',
          onConflictDoNothing: true,
        });
        const activityId = await createStationActivityLog(client, {
          organizationId: orgId,
          station: 'PACK',
          activityType: 'PACK_COMPLETED',
          staffId: parsed.packedByStaffId,
          shipmentId: row.shipment_id,
          scanRef: row.tracking ?? null,
          notes: 'Marked packed — Live feed picked aisle',
          metadata: { source: 'live-feed-desk', order_id: row.id },
        });
        activityIds.push(activityId);
        markedIds.push(row.id);
        shipmentIds.push(row.shipment_id);
      }
      if (shipmentIds.length > 0) {
        await refreshOrderStageFacts(orgId, { shipmentIds }, client);
      }
      return { markedIds, skipped, activityIds };
    });

    if (marked.markedIds.length > 0) {
      await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], orgId);
      await publishOrderChanged({ organizationId: orgId, orderIds: marked.markedIds, source: 'orders.mark-packed' });
      for (const activityId of marked.activityIds) {
        if (activityId == null) continue;
        await publishActivityLogged({
          organizationId: orgId,
          id: activityId,
          station: 'PACK',
          activityType: 'PACK_COMPLETED',
          staffId: parsed.packedByStaffId,
          source: 'live-feed-desk',
        });
      }
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-mark-packed',
        action: AUDIT_ACTION.PACK_COMPLETED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: marked.markedIds[0] ?? 0,
        after: { packedByStaffId: parsed.packedByStaffId, orderIds: marked.markedIds },
      });
    }

    // A pickup without a shipment is a skip, not a failure — the rest still packed.
    return NextResponse.json({ success: true, markedIds: marked.markedIds, skipped: marked.skipped });
  } catch (error: unknown) {
    console.error('[POST /api/orders/mark-packed] error:', error);
    const details = error instanceof Error ? error.message : 'Failed to mark as packed';
    return NextResponse.json({ error: 'Failed to mark as packed', details }, { status: 500 });
  }
}
