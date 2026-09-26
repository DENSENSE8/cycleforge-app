import pool from '@/lib/db';

/** The carrier scan trail for one package — `shipment_tracking_events` rows, newest first. */
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
