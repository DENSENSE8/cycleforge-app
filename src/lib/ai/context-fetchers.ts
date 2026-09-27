import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntentParams } from '@/lib/ai/intent-router';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';

function normalizeLookupLike(value: string): string {
  return `%${value.trim()}%`;
}

function formatTitle(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value || '').trim();
  return cleaned || fallback;
}

function formatCountLabel(count: number, singular: string, plural?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural || `${singular}s`}`;
}

type QueryRow = Record<string, unknown>;

export async function fetchOrdersContext(params: IntentParams, orgId: OrgId): Promise<string> {
  if (params.orderId) {
    const specific = await tenantQuery(
      orgId,
      `
        SELECT
          o.order_id,
          o.product_title,
          o.condition,
          o.sku,
          o.status,
          o.is_out_of_stock,
          stn.tracking_number_raw,
          COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
            OR stn.is_out_for_delivery OR stn.is_delivered, false) AS is_shipped,
          wa_pick.assigned_tech_id,
          s.name AS picker_name,
          wa.deadline_at
        FROM orders o
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        LEFT JOIN LATERAL (
          SELECT deadline_at
          FROM work_assignments
          WHERE entity_type = 'ORDER'
            AND entity_id = o.id
            AND work_type = 'TEST'
            AND status <> 'CANCELED'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) wa ON TRUE
        LEFT JOIN LATERAL (
          SELECT assigned_tech_id
          FROM work_assignments
          WHERE organization_id = o.organization_id
            AND entity_type = 'ORDER'
            AND entity_id = o.id
            AND work_type = 'PICK'
            AND status <> 'CANCELED'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) wa_pick ON TRUE
        LEFT JOIN staff s ON s.id = wa_pick.assigned_tech_id AND s.organization_id = o.organization_id
        WHERE o.organization_id = $1
          AND o.order_id ILIKE $2
        ORDER BY o.id DESC
        LIMIT 1
      `,
      [orgId, normalizeLookupLike(params.orderId)]
    );

    if (specific.rows.length > 0) {
      const row = specific.rows[0] as QueryRow;
      const lines = [
        '=== ORDER LOOKUP (live) ===',
        `Order: ${formatTitle(row.order_id as string, 'Unknown')}`,
        `Product: ${formatTitle(row.product_title as string, 'Unknown product')}`,
        `Status: ${row.is_shipped ? 'Shipped' : 'Pending'}${row.status ? ` | Workflow: ${row.status}` : ''}`,
      ];
      if (row.picker_name) lines.push(`Assigned picker: ${row.picker_name}`);
      if (row.deadline_at) lines.push(`Deadline: ${row.deadline_at}`);
      if (row.tracking_number_raw) lines.push(`Tracking: ${row.tracking_number_raw}`);
      if (row.sku) lines.push(`SKU: ${row.sku}`);
      if (row.condition) lines.push(`Condition: ${row.condition}`);
      if (row.is_out_of_stock) lines.push(`Missing part / OOS: Out of stock`);
      return lines.join('\n');
    }
  }

  const [summary, overdue] = await Promise.all([
    tenantQuery(
      orgId,
      `
        SELECT
          COUNT(*) FILTER (
            WHERE NOT COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
              OR stn.is_out_for_delivery OR stn.is_delivered, false)
          )::int AS pending_total,
          COUNT(*) FILTER (
            WHERE NOT COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
              OR stn.is_out_for_delivery OR stn.is_delivered, false)
              AND wa_pick.assigned_tech_id IS NULL
          )::int AS unassigned,
          COUNT(*) FILTER (
            WHERE wa_d.deadline_at::date < CURRENT_DATE
              AND NOT COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
                OR stn.is_out_for_delivery OR stn.is_delivered, false)
          )::int AS overdue,
          COUNT(*) FILTER (
            WHERE wa_d.deadline_at::date = CURRENT_DATE
              AND NOT COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
                OR stn.is_out_for_delivery OR stn.is_delivered, false)
          )::int AS due_today,
          COUNT(*) FILTER (
            WHERE o.is_out_of_stock = true
          )::int AS out_of_stock
        FROM orders o
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        LEFT JOIN LATERAL (
          SELECT assigned_tech_id
          FROM work_assignments
          WHERE organization_id = o.organization_id
            AND entity_type = 'ORDER'
            AND entity_id = o.id
            AND work_type = 'PICK'
            AND status <> 'CANCELED'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) wa_pick ON TRUE
        LEFT JOIN LATERAL (
          SELECT deadline_at
          FROM work_assignments
          WHERE entity_type = 'ORDER'
            AND entity_id = o.id
            AND work_type = 'TEST'
            AND status <> 'CANCELED'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) wa_d ON TRUE
        WHERE o.organization_id = $1
      `,
      [orgId],
    ),
    tenantQuery(
      orgId,
      `
        SELECT
          o.order_id,
          o.product_title,
          COALESCE((CURRENT_DATE - wa.deadline_at::date), 0)::int AS days_overdue
        FROM orders o
        JOIN LATERAL (
          SELECT deadline_at
          FROM work_assignments
          WHERE entity_type = 'ORDER'
            AND entity_id = o.id
            AND work_type = 'TEST'
            AND status <> 'CANCELED'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) wa ON TRUE
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        WHERE o.organization_id = $1
          AND wa.deadline_at::date < CURRENT_DATE
          AND NOT COALESCE(stn.is_carrier_accepted OR stn.is_in_transit
            OR stn.is_out_for_delivery OR stn.is_delivered, false)
        ORDER BY wa.deadline_at ASC, o.id ASC
        LIMIT 5
      `,
      [orgId],
    ),
  ]);

  const counts = (summary.rows[0] || {}) as QueryRow;
  const urgent = overdue.rows
    .map((row) => {
      const orderId = String(row.order_id || '').trim();
      const shortOrderId = orderId ? `#${orderId.slice(-8)}` : 'Unknown order';
      const product = formatTitle(row.product_title as string, 'Unknown product');
      const days = Number(row.days_overdue || 0);
      return `${shortOrderId} (${product}, ${formatCountLabel(days, 'day')} overdue)`;
    })
    .join(', ');

  return [
    '=== PENDING ORDERS (live) ===',
    `Total unshipped: ${counts.pending_total ?? 0}`,
    `Overdue: ${counts.overdue ?? 0} | Due today: ${counts.due_today ?? 0} | No picker: ${counts.unassigned ?? 0}`,
    `Out of stock: ${counts.out_of_stock ?? 0}`,
    urgent ? `Most urgent: ${urgent}` : 'Most urgent: none',
  ].join('\n');
}

/**
 * The open Unbox carton — product briefing for Ask, not warehouse-wide queues
 * and not internal receiving ids.
 */
export async function fetchReceivingCartonContext(orgId: OrgId, receivingId: number): Promise<string> {
  const { formatReceivingCartonBrief } = await import('@/lib/assistant/carton-ask-brief');
  const [carton, lines] = await Promise.all([
    tenantQuery(
      orgId,
      `
        SELECT
          r.carrier,
          r.intake_type,
          r.is_return,
          r.source_platform,
          r.zoho_purchaseorder_number,
          rt.pairing_state,
          stn.tracking_number_raw AS tracking
        FROM receiving_carton r
        LEFT JOIN receiving_triage rt
          ON rt.receiving_id = r.id
         AND rt.organization_id = r.organization_id
        LEFT JOIN shipping_tracking_numbers stn
          ON stn.id = r.shipment_id
        WHERE r.organization_id = $1
          AND r.id = $2
        LIMIT 1
      `,
      [orgId, receivingId],
    ),
    tenantQuery(
      orgId,
      `
        SELECT
          rl.sku,
          rl.item_name,
          rl.quantity_expected,
          rl.quantity_received,
          rl.workflow_status,
          rl.source_order_id,
          sc.product_title AS catalog_title,
          sc.category,
          sc.notes AS catalog_notes,
          zi.name AS item_title,
          zi.description AS item_description,
          rlt.condition_grade,
          rlt.needs_test
        FROM receiving_line rl
        LEFT JOIN sku_catalog sc
          ON sc.id = rl.sku_catalog_id
         AND sc.organization_id = rl.organization_id
        LEFT JOIN receiving_line_zoho rz
          ON rz.receiving_line_id = rl.id
         AND rz.organization_id = rl.organization_id
        LEFT JOIN items zi
          ON zi.zoho_item_id = rz.zoho_item_id
         AND zi.organization_id = rl.organization_id
        LEFT JOIN receiving_line_testing rlt
          ON rlt.receiving_line_id = rl.id
         AND rlt.organization_id = rl.organization_id
        WHERE rl.organization_id = $1
          AND rl.receiving_id = $2
        ORDER BY rl.id
        LIMIT 20
      `,
      [orgId, receivingId],
    ),
  ]);
  const photos = await tenantQuery(
    orgId,
    `
      SELECT COUNT(*)::int AS n
        FROM photo_entity_links l
       WHERE l.organization_id = $1
         AND (
           (l.entity_type = 'RECEIVING' AND l.entity_id = $2)
           OR (l.entity_type = 'RECEIVING_LINE' AND l.entity_id IN (
             SELECT id FROM receiving_line
              WHERE organization_id = $1 AND receiving_id = $2
           ))
         )
    `,
    [orgId, receivingId],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  const row = carton.rows[0] as QueryRow | undefined;
  if (!row) {
    return formatReceivingCartonBrief({ products: [] });
  }
  const lineRows = lines.rows as QueryRow[];
  const products = lineRows.map((l) => {
    const title =
      String(l.catalog_title || '').trim() ||
      String(l.item_title || '').trim() ||
      String(l.item_name || '').trim() ||
      String(l.sku || '').trim();
    const notes = [l.catalog_notes, l.item_description]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ');
    return {
      title,
      sku: String(l.sku || '').trim() || null,
      qtyExpected: l.quantity_expected != null ? Number(l.quantity_expected) : null,
      qtyReceived: l.quantity_received != null ? Number(l.quantity_received) : null,
      condition: String(l.condition_grade || '').trim() || null,
      needsTest: typeof l.needs_test === 'boolean' ? l.needs_test : null,
      workflow: String(l.workflow_status || '').trim() || null,
      marketplaceOrder: String(l.source_order_id || '').trim() || null,
      category: String(l.category || '').trim() || null,
      notes: notes || null,
    };
  });
  const photoCount = Number((photos.rows[0] as QueryRow | undefined)?.n ?? 0);
  return formatReceivingCartonBrief({
    tracking: String(row.tracking || '').trim() || null,
    carrier: String(row.carrier || '').trim() || null,
    pairing: String(row.pairing_state || '').trim() || null,
    intake: String(row.intake_type || '').trim() || null,
    isReturn: Boolean(row.is_return),
    platform: String(row.source_platform || '').trim() || null,
    poNumber: String(row.zoho_purchaseorder_number || '').trim() || null,
    photoCount: Number.isFinite(photoCount) ? photoCount : null,
    products,
  });
}

export async function fetchShippedContext(params: IntentParams, orgId: OrgId): Promise<string> {
  if (!params.orderId && !params.trackingNumber) return '';

  const values: Array<string | OrgId> = [orgId];
  let orderCondition = 'FALSE';
  let trackingCondition = 'FALSE';

  if (params.orderId) {
    values.push(normalizeLookupLike(params.orderId));
    orderCondition = `o.order_id ILIKE $${values.length}`;
  }
  if (params.trackingNumber) {
    values.push(normalizeTrackingCanonical(params.trackingNumber));
    trackingCondition = `stn.tracking_number_normalized = $${values.length}`;
  }

  const result = await tenantQuery(
    orgId,
    `
      SELECT
        o.order_id,
        o.product_title,
        o.condition,
        stn.tracking_number_raw,
        stn.latest_status_label,
        stn.latest_status_category,
        stn.carrier,
        stn.delivered_at,
        STRING_AGG(DISTINCT tsn.serial_number, ', ') FILTER (WHERE tsn.serial_number IS NOT NULL) AS serials,
        STRING_AGG(DISTINCT s.name, ', ') FILTER (WHERE s.name IS NOT NULL) AS tested_by
      FROM orders o
      JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN tech_serial_numbers tsn ON /* CF-03 */ (
      tsn.organization_id = o.organization_id
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
    )
      LEFT JOIN staff s ON s.id = tsn.tested_by
      WHERE o.organization_id = $1
        AND (${orderCondition} OR ${trackingCondition})
      GROUP BY o.id, stn.id
      ORDER BY o.id DESC
      LIMIT 3
    `,
    values
  );

  if (result.rows.length === 0) {
    return '=== SHIPPED LOOKUP ===\nNo shipped order matched that order ID or tracking number.';
  }

  return [
    '=== SHIPPED LOOKUP ===',
    ...result.rows.map((row) => {
      const parts = [
        `${formatTitle(row.order_id as string, 'Unknown order')} (${formatTitle(row.product_title as string, 'Unknown product')})`,
        row.latest_status_label ? `status: ${row.latest_status_label}` : null,
        row.latest_status_category ? `category: ${row.latest_status_category}` : null,
        row.carrier ? `carrier: ${row.carrier}` : null,
        row.delivered_at ? `delivered_at: ${row.delivered_at}` : null,
        row.serials ? `serials: ${row.serials}` : null,
        row.tested_by ? `tested_by: ${row.tested_by}` : null,
        row.tracking_number_raw ? `tracking: ${row.tracking_number_raw}` : null,
        row.condition ? `condition: ${row.condition}` : null,
      ].filter(Boolean);
      return `  ${parts.join(' | ')}`;
    }),
  ].join('\n');
}

