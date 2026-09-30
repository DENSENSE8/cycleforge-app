import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import type { CarrierEventsPayload } from '@/lib/queries/carrier-events-query';

/**
 * The carrier-event read for a record that owns a shipment
 * (`shipping_tracking_numbers` + its `shipment_tracking_events`, newest first,
 * limit 50). Receiving resolves the shipment via `receiving_carton.shipment_id`;
 * repair via `repair_service.source_tracking_number` → the canonical tracking key.
 * Returns null when the owning record does not exist in the tenant.
 */
export type CarrierEventsOwner = { kind: 'carton'; receivingId: number } | { kind: 'repair'; repairId: number };

interface CarrierEventReadRow {
  carrier: string | null;
  tracking_number: string | null;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  is_delivered: boolean | null;
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

const SHIPMENT_COLUMNS = `stn.estimated_delivery_at::text AS estimated_delivery_at,
              stn.delivered_at::text AS delivered_at,
              stn.is_delivered,
              e.id,
              e.event_occurred_at::text,
              e.normalized_status_category,
              e.external_status_label,
              e.external_status_description,
              e.event_city,
              e.event_state,
              e.exception_description,
              e.signed_by`;

const EVENTS_LATERAL = `LEFT JOIN LATERAL (
           SELECT ste.id, ste.event_occurred_at, ste.normalized_status_category,
                  ste.external_status_label, ste.external_status_description,
                  ste.event_city, ste.event_state, ste.exception_description,
                  ste.signed_by
             FROM shipment_tracking_events ste
            WHERE ste.shipment_id = stn.id
            ORDER BY ste.event_occurred_at DESC NULLS LAST, ste.id DESC
            LIMIT 50
         ) e ON TRUE`;

const EVENTS_ORDER = 'ORDER BY e.event_occurred_at DESC NULLS LAST, e.id DESC';

function toPayload(rows: CarrierEventReadRow[]): CarrierEventsPayload {
  const first = rows[0]!;
  return {
    carrier: first.carrier,
    trackingNumber: first.tracking_number,
    estimatedDeliveryAt: first.estimated_delivery_at,
    deliveredAt: first.delivered_at,
    isDelivered: first.is_delivered === true,
    events: rows
      .filter((row) => row.id != null)
      .map((row) => ({
        id: row.id!,
        eventOccurredAt: row.event_occurred_at,
        category: row.normalized_status_category,
        label: row.external_status_label,
        description: row.external_status_description,
        city: row.event_city,
        state: row.event_state,
        exception: row.exception_description,
        signedBy: row.signed_by,
      })),
  };
}

async function readCartonCarrierEvents(orgId: OrgId, receivingId: number): Promise<CarrierEventsPayload | null> {
  const result = await tenantQueryOneTrip<CarrierEventReadRow>(
    orgId,
    `SELECT COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier) AS carrier,
            COALESCE(stn.tracking_number_raw, stn.tracking_number_normalized) AS tracking_number,
            ${SHIPMENT_COLUMNS}
       FROM receiving_carton r
       LEFT JOIN shipping_tracking_numbers stn
         ON stn.id = r.shipment_id
        AND stn.organization_id = r.organization_id
       ${EVENTS_LATERAL}
      WHERE r.id = $1
        AND r.organization_id = $2
      ${EVENTS_ORDER}`,
    [receivingId, orgId],
  );
  return result.rows.length === 0 ? null : toPayload(result.rows);
}

async function readRepairCarrierEvents(orgId: OrgId, repairId: number): Promise<CarrierEventsPayload | null> {
  const repair = await tenantQueryOneTrip<{ source_tracking_number: string | null }>(
    orgId,
    `SELECT source_tracking_number FROM repair_service WHERE id = $1 AND organization_id = $2`,
    [repairId, orgId],
  );
  if (repair.rows.length === 0) return null;
  const rawTracking = repair.rows[0]!.source_tracking_number?.trim() || null;
  const canonical = rawTracking ? extractCanonicalTracking(rawTracking) : '';
  const empty: CarrierEventsPayload = {
    carrier: null,
    trackingNumber: rawTracking,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    isDelivered: false,
    events: [],
  };
  if (!canonical) return empty;

  const result = await tenantQueryOneTrip<CarrierEventReadRow>(
    orgId,
    `SELECT NULLIF(stn.carrier, 'UNKNOWN') AS carrier,
            COALESCE(stn.tracking_number_raw, stn.tracking_number_normalized) AS tracking_number,
            ${SHIPMENT_COLUMNS}
       FROM (SELECT s.* FROM shipping_tracking_numbers s
              WHERE s.organization_id = $2 AND s.tracking_number_normalized = $1
              ORDER BY s.id DESC LIMIT 1) stn
       ${EVENTS_LATERAL}
      ${EVENTS_ORDER}`,
    [canonical, orgId],
  );
  return result.rows.length === 0 ? empty : toPayload(result.rows);
}

export function readCarrierEvents(orgId: OrgId, owner: CarrierEventsOwner): Promise<CarrierEventsPayload | null> {
  return owner.kind === 'carton'
    ? readCartonCarrierEvents(orgId, owner.receivingId)
    : readRepairCarrierEvents(orgId, owner.repairId);
}
