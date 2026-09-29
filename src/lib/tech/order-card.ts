import type { Pool } from 'pg';

type Queryable = Pick<Pool, 'query'>;

/**
 * The picker desk's "active order card" row: one SELECT (order + primary
 * tracking + ship-by + live PICK / PACK assignees) behind both anchors — a
 * shipment / tracking ({@link findOrderByShipment}) or the order row itself
 * ({@link findOrderById}, walk-in / Pickup orders carry no tracking). The
 * assignee is the ORDER/PICK picker — the desk picks; QC is a unit fact.
 */
const ORDER_CARD_SELECT = `SELECT
       o.id, o.shipment_id, o.order_id, o.product_title, o.item_number, o.sku,
       o.condition, o.notes, o.account_source, o.status, o.status_history,
       o.is_out_of_stock, o.order_date, o.created_at, o.quantity,
       COALESCE(stn.tracking_number_raw, '') AS shipping_tracking_number,
       COALESCE(stn.is_carrier_accepted OR stn.is_in_transit OR stn.is_out_for_delivery OR stn.is_delivered, false) AS is_shipped,
       to_char(wa_d.deadline_at, 'YYYY-MM-DD') AS ship_by_date,
       wa_pick.assigned_tech_id AS picker_id,
       wa_p.assigned_packer_id AS packer_id
     FROM orders o
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     LEFT JOIN LATERAL (
       SELECT wa.deadline_at FROM work_assignments wa
       WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id AND wa.work_type = 'TEST'
       ORDER BY CASE wa.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'OPEN' THEN 3 WHEN 'DONE' THEN 4 ELSE 5 END,
                wa.updated_at DESC, wa.id DESC LIMIT 1
     ) wa_d ON TRUE
     LEFT JOIN LATERAL (
       SELECT assigned_tech_id FROM work_assignments
       WHERE organization_id = o.organization_id
         AND entity_type = 'ORDER' AND entity_id = o.id AND work_type = 'PICK' AND status NOT IN ('CANCELED','DONE')
       ORDER BY id DESC LIMIT 1
     ) wa_pick ON TRUE
     LEFT JOIN LATERAL (
       SELECT assigned_packer_id FROM work_assignments
       WHERE entity_type = 'ORDER' AND entity_id = o.id AND work_type = 'PACK' AND status NOT IN ('CANCELED','DONE')
       ORDER BY id DESC LIMIT 1
     ) wa_p ON TRUE`;

/** Card row for a shipment / tracking scan (desk tracking scan, serial `add-to-last`). */
export async function findOrderByShipment(
  db: Queryable,
  shipmentId: number | null,
  key18: string | null,
  last8: string | null,
  orgId: string,
) {
  if (!shipmentId && !key18 && !last8) return null;
  const r = await db.query(
    `${ORDER_CARD_SELECT}
     WHERE o.organization_id = $4
       AND (
         ($1::bigint IS NOT NULL AND o.shipment_id = $1)
          OR (stn.id IS NOT NULL AND $2::text IS NOT NULL
              AND RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized,'')), '[^A-Z0-9]', '', 'g'), 18) = $2)
          OR (stn.id IS NOT NULL AND $3::text IS NOT NULL
              AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized,''), '[^0-9]', '', 'g'), 8) = $3)
       )
     ORDER BY
       CASE
         WHEN $1::bigint IS NOT NULL AND o.shipment_id = $1 THEN 0
         WHEN stn.id IS NOT NULL AND $2::text IS NOT NULL
           AND RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized,'')), '[^A-Z0-9]', '', 'g'), 18) = $2 THEN 1
         WHEN stn.id IS NOT NULL AND $3::text IS NOT NULL
           AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized,''), '[^0-9]', '', 'g'), 8) = $3 THEN 2
         ELSE 3
       END,
       o.id DESC
     LIMIT 1`,
    [shipmentId, key18, last8, orgId],
  );
  return r.rows[0] ?? null;
}

/** Card row for an order anchored by its row id — the pick anchors on the order, tracking or not. */
export async function findOrderById(db: Queryable, orderId: number, orgId: string) {
  const r = await db.query(
    `${ORDER_CARD_SELECT}
     WHERE o.organization_id = $2 AND o.id = $1
     LIMIT 1`,
    [orderId, orgId],
  );
  return r.rows[0] ?? null;
}

/** Map an orders row to the active-card payload the picker desk consumes. */
export function buildOrderPayload(row: any, overrides: Record<string, unknown> = {}) {
  return {
    id: row?.id ?? null,
    orderId: row?.order_id || '—',
    productTitle: row?.product_title || 'Unknown Product',
    itemNumber: row?.item_number || null,
    sku: row?.sku || '—',
    condition: row?.condition || '—',
    notes: row?.notes || '',
    tracking: row?.shipping_tracking_number || '',
    serialNumbers: [] as string[],
    testDateTime: null as string | null,
    testedBy: null as number | null,
    accountSource: row?.account_source || null,
    quantity: row?.quantity || 1,
    status: row?.status || null,
    statusHistory: row?.status_history || [],
    isShipped: row?.is_shipped || false,
    packerId: row?.packer_id || null,
    pickerId: row?.picker_id || null,
    isOutOfStock: row?.is_out_of_stock || false,
    shipByDate: row?.ship_by_date || null,
    orderDate: row?.order_date || null,
    createdAt: row?.created_at || null,
    ...overrides,
  };
}
