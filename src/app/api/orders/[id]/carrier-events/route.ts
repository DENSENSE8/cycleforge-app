import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

interface CarrierEventReadRow {
  order_row_id: number;
  carrier: string | null;
  tracking_number: string | null;
  id: number | null;
  event_occurred_at: string | null;
  normalized_status_category: string | null;
  external_status_label: string | null;
  external_status_description: string | null;
  event_city: string | null;
  event_state: string | null;
  exception_description: string | null;
  signed_by: string | null;
}

/**
 * GET /api/orders/[id]/carrier-events — the small external-fulfillment read.
 * This intentionally avoids the full order timeline fan-out: opening the
 * Fulfillment lens costs one tenant-scoped query for UPS/FedEx/carrier scans.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = Number(rawId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const result = await tenantQueryOneTrip<CarrierEventReadRow>(
      gate.ctx.organizationId as OrgId,
      `SELECT o.id AS order_row_id,
              stn.carrier,
              COALESCE(stn.tracking_number_raw, stn.tracking_number_normalized) AS tracking_number,
              e.id,
              e.event_occurred_at::text,
              e.normalized_status_category,
              e.external_status_label,
              e.external_status_description,
              e.event_city,
              e.event_state,
              e.exception_description,
              e.signed_by
         FROM orders o
         LEFT JOIN shipping_tracking_numbers stn
           ON stn.id = o.shipment_id
          AND stn.organization_id = o.organization_id
         LEFT JOIN LATERAL (
           SELECT ste.id, ste.event_occurred_at, ste.normalized_status_category,
                  ste.external_status_label, ste.external_status_description,
                  ste.event_city, ste.event_state, ste.exception_description,
                  ste.signed_by
             FROM shipment_tracking_events ste
            WHERE ste.shipment_id = stn.id
            ORDER BY ste.event_occurred_at DESC NULLS LAST, ste.id DESC
            LIMIT 50
         ) e ON TRUE
        WHERE o.id = $1
          AND o.organization_id = $2
        ORDER BY e.event_occurred_at DESC NULLS LAST, e.id DESC`,
      [orderId, gate.ctx.organizationId],
    );

    if (result.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const first = result.rows[0]!;
    return NextResponse.json({
      carrier: first.carrier,
      trackingNumber: first.tracking_number,
      events: result.rows
        .filter((row) => row.id != null)
        .map((row) => ({
          id: row.id,
          eventOccurredAt: row.event_occurred_at,
          category: row.normalized_status_category,
          label: row.external_status_label,
          description: row.external_status_description,
          city: row.event_city,
          state: row.event_state,
          exception: row.exception_description,
          signedBy: row.signed_by,
        })),
    });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]/carrier-events:', error);
    return NextResponse.json({ error: 'Could not read carrier events.' }, { status: 500 });
  }
}
