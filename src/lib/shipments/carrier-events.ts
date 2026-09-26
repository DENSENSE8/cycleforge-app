import pool from '@/lib/db';

/**
 * The carrier scan trail for one package — `shipment_tracking_events` rows,
 * newest first. Shared by the order timeline (`GET /api/orders/[id]/timeline`)
 * and the shipment record (`getShipmentRecord`) so both read the same rows.
 *
 * Carrier events are carrier-global and are mostly written with a NULL
 * `organization_id` by the sync worker, so under the RLS-subject tenant pool
 * (`TENANT_APP_DATABASE_URL`) a GUC-scoped read returns NOTHING for them. The
 * read therefore runs on the owner pool, and tenant isolation rides on
 * `shipmentId`, which every caller MUST have resolved from an org-checked row —
 * never from the request.
 */
export interface CarrierEventRow {
  id: number | string;
  event_occurred_at: Date | string | null;
  normalized_status_category: string | null;
  external_status_label: string | null;
  external_status_description: string | null;
  event_city: string | null;
  event_state: string | null;
  exception_description: string | null;
  signed_by: string | null;
}

export async function listShipmentCarrierEvents(shipmentId: number, limit = 200): Promise<CarrierEventRow[]> {
  const res = await pool.query<CarrierEventRow>(
    `SELECT id, event_occurred_at, normalized_status_category,
            external_status_label, external_status_description,
            event_city, event_state, exception_description, signed_by
       FROM shipment_tracking_events
      WHERE shipment_id = $1
      ORDER BY event_occurred_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [shipmentId, limit],
  );
  return res.rows;
}
