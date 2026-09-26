/** Batch order lookup for the AI chat: */
import { NextRequest, NextResponse } from 'next/server';
import { shippingShippedHref } from '@/lib/shipping/shipped-desk';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { orderIds?: unknown };
  const raw = Array.isArray(body.orderIds) ? body.orderIds : [];
  const ids = Array.from(
    new Set(
      raw
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.replace(/^#/, '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);

  if (ids.length === 0) return NextResponse.json({ orders: [] });

  // orders is tenant-owned and o.order_id is a marketplace string key that collides across tenants — it MUST be org-scoped.
  const { rows } = await tenantQuery(
    ctx.organizationId,
    `
      SELECT
        o.id,
        o.order_id,
        o.product_title,
        o.sku,
        o.condition,
        o.is_out_of_stock,
        stn.tracking_number_raw,
        stn.carrier,
        stn.latest_status_label,
        stn.latest_status_description,
        stn.latest_status_category,
        stn.latest_event_at,
        stn.has_exception,
        stn.is_terminal,
        stn.delivered_at,
        COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
          OR stn.is_out_for_delivery OR stn.is_delivered, false) AS is_shipped,
        ts.name AS tester_name,
        ps.name AS packer_name
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN LATERAL (
        SELECT tested_by FROM tech_serial_numbers tsn
        WHERE tsn.tested_by IS NOT NULL
          AND tsn.organization_id = $2
          AND (
            tsn.order_id = o.id
            OR (
              tsn.order_id IS NULL
              AND o.shipment_id IS NOT NULL
              AND tsn.shipment_id = o.shipment_id
              AND NOT EXISTS (
                SELECT 1 FROM orders o2
                WHERE o2.shipment_id = o.shipment_id
                  AND o2.organization_id = o.organization_id
                  AND o2.id <> o.id
              )
            )
          )
        ORDER BY tsn.created_at DESC LIMIT 1
      ) tt ON TRUE
      LEFT JOIN staff ts ON ts.id = tt.tested_by
      LEFT JOIN LATERAL (
        SELECT packed_by FROM packer_logs
        WHERE shipment_id = o.shipment_id AND packed_by IS NOT NULL
          AND organization_id = $2
          AND completion_state = 'COMPLETED'
        ORDER BY created_at DESC LIMIT 1
      ) pp ON TRUE
      LEFT JOIN staff ps ON ps.id = pp.packed_by
      WHERE o.order_id = ANY($1::text[])
        AND o.organization_id = $2
      ORDER BY array_position($1::text[], o.order_id)
      LIMIT 50
    `,
    [ids, ctx.organizationId],
  );

  const orders = rows.map((r) => ({
    id: Number(r.id),
    orderId: String(r.order_id ?? ''),
    productTitle: String(r.product_title ?? ''),
    sku: r.sku ? String(r.sku) : null,
    condition: r.condition ? String(r.condition) : null,
    isOutOfStock: Boolean(r.is_out_of_stock),
    isShipped: Boolean(r.is_shipped),
    tracking: r.tracking_number_raw ? String(r.tracking_number_raw) : null,
    carrier: r.carrier ? String(r.carrier) : null,
    statusLabel: r.latest_status_label ? String(r.latest_status_label) : null,
    statusDescription: r.latest_status_description ? String(r.latest_status_description) : null,
    statusCategory: r.latest_status_category ? String(r.latest_status_category) : null,
    latestEventAt: r.latest_event_at ? String(r.latest_event_at) : null,
    hasException: r.has_exception == null ? null : Boolean(r.has_exception),
    isTerminal: r.is_terminal == null ? null : Boolean(r.is_terminal),
    deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
    testerName: r.tester_name ? String(r.tester_name) : null,
    packerName: r.packer_name ? String(r.packer_name) : null,
    // The Shipped DESK, not the To-ship queue with a legacy presence flag on
    // it: every row here has already left, which is that desk's whole subject.
    href: shippingShippedHref({ search: String(r.order_id ?? '') }),
  }));

  return NextResponse.json({ orders });
}, { permission: 'dashboard.view' });
