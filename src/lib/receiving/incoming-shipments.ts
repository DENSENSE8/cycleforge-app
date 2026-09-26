import pool from '@/lib/db';
import { NOT_ZOHO_RECEIVED_PREDICATE } from '@/lib/receiving/delivered-unscanned';
import {
  INBOUND_MARKETPLACE_CARTON_SOURCES_SQL,
  INBOUND_MARKETPLACE_LINE_SOURCES_SQL,
  notLineInboundMirrorTerminalPredicate,
} from '@/lib/inbound/mirror';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isIncomingUniversal } from '@/lib/feature-flags';

interface IncomingShipmentRef {
  id: number;
  carrier: string;
}

/** Soft-join LATERAL body shared by org-scoped + global paths.
 *  Line-level zoho PO id reads from receiving_line_zoho (rz, joined by both
 *  callers before this LATERAL); carton-level r.zoho_purchaseorder_id stays. */
const RECEIVING_SOFT_JOIN = `
             SELECT r.* FROM receiving_carton r
              WHERE (r.id = rl.receiving_id
                 OR (rl.receiving_id IS NULL
                     AND r.source = 'zoho_po'
                     AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id)
                 OR (rl.receiving_id IS NULL
                     AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL}
                     AND r.source_order_id = rl.source_order_id
                     AND r.organization_id = rl.organization_id))
`;

/** The shipments backing the Incoming receiving table — the tracking#s an operator actually sees, NOT every active shipment. */
export async function selectIncomingShipmentIds(
  cap: number,
  orgId?: OrgId,
): Promise<IncomingShipmentRef[]> {
  // Tenant-scoped path:
  if (orgId) {
    const universal = await isIncomingUniversal(orgId);
    const lineScope = universal
      ? `(
            (rz.zoho_purchaseorder_id IS NOT NULL AND ${NOT_ZOHO_RECEIVED_PREDICATE})
            OR
            (rz.zoho_purchaseorder_id IS NULL
             AND ${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}
             AND rl.source_order_id IS NOT NULL
             AND ${notLineInboundMirrorTerminalPredicate()})
          )`
      : `(
            (rz.zoho_purchaseorder_id IS NOT NULL AND ${NOT_ZOHO_RECEIVED_PREDICATE})
            OR
            (${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}
             AND rl.source_order_id IS NOT NULL
             AND ${INBOUND_MARKETPLACE_CARTON_SOURCES_SQL})
          )`;

    const { rows } = await tenantQuery<IncomingShipmentRef>(
      orgId,
      `WITH incoming_shipments AS (
         SELECT DISTINCT ON (stn.id)
                stn.id,
                stn.carrier,
                stn.latest_status_category,
                stn.is_out_for_delivery,
                stn.is_in_transit,
                stn.is_carrier_accepted,
                stn.is_delivered,
                stn.has_exception,
                stn.latest_event_at,
                stn.next_check_at
           FROM receiving_line rl
           LEFT JOIN receiving_line_zoho rz
             ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
           LEFT JOIN zoho_po_mirror mirror
             ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
           JOIN LATERAL (
             ${RECEIVING_SOFT_JOIN}
                AND r.organization_id = $1
              ORDER BY (r.id = rl.receiving_id) DESC,
                       (r.shipment_id IS NOT NULL) DESC,
                       r.id DESC
              LIMIT 1
           ) r ON TRUE
           JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
          WHERE rl.workflow_status = 'EXPECTED'
            AND COALESCE(rl.quantity_received, 0) = 0
            AND rl.organization_id = $1
            AND ${lineScope}
            AND stn.carrier IN ('UPS','USPS','FEDEX')
            AND COALESCE(stn.is_terminal, false) = false
            AND COALESCE(stn.consecutive_error_count, 0) < 5
          ORDER BY stn.id
       )
       SELECT id, carrier
         FROM incoming_shipments
        ORDER BY CASE WHEN is_out_for_delivery THEN 0
                      WHEN latest_status_category = 'DELIVERED' OR is_delivered THEN 1
                      WHEN has_exception OR (
                        latest_event_at IS NOT NULL
                        AND latest_event_at < (NOW() - interval '72 hours')
                      ) THEN 2
                      WHEN latest_status_category IS NULL THEN 3
                      WHEN is_in_transit THEN 4
                      WHEN is_carrier_accepted THEN 5
                      ELSE 6 END,
                 next_check_at ASC NULLS FIRST
        LIMIT ${cap + 1}`,
      [orgId],
    );
    return rows;
  }

  // Global (cron) path: always include eBay-source cartons alongside Zoho POs.
  const { rows } = await pool.query<IncomingShipmentRef>(
    `WITH incoming_shipments AS (
       SELECT DISTINCT ON (stn.id)
              stn.id,
              stn.carrier,
              stn.latest_status_category,
              stn.is_out_for_delivery,
              stn.is_in_transit,
              stn.is_carrier_accepted,
              stn.is_delivered,
              stn.has_exception,
              stn.latest_event_at,
              stn.next_check_at
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         LEFT JOIN zoho_po_mirror mirror
           ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
         JOIN LATERAL (
           ${RECEIVING_SOFT_JOIN}
            ORDER BY (r.id = rl.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE rl.workflow_status = 'EXPECTED'
          AND COALESCE(rl.quantity_received, 0) = 0
          AND (
            (rz.zoho_purchaseorder_id IS NOT NULL AND ${NOT_ZOHO_RECEIVED_PREDICATE})
            OR
            (${INBOUND_MARKETPLACE_LINE_SOURCES_SQL}
             AND rl.source_order_id IS NOT NULL)
          )
          AND stn.carrier IN ('UPS','USPS','FEDEX')
          AND COALESCE(stn.is_terminal, false) = false
          AND COALESCE(stn.consecutive_error_count, 0) < 5
        ORDER BY stn.id
     )
     SELECT id, carrier
       FROM incoming_shipments
      ORDER BY CASE WHEN is_out_for_delivery THEN 0
                    WHEN latest_status_category = 'DELIVERED' OR is_delivered THEN 1
                    WHEN has_exception OR (
                      latest_event_at IS NOT NULL
                      AND latest_event_at < (NOW() - interval '72 hours')
                    ) THEN 2
                    WHEN latest_status_category IS NULL THEN 3
                    WHEN is_in_transit THEN 4
                    WHEN is_carrier_accepted THEN 5
                    ELSE 6 END,
               next_check_at ASC NULLS FIRST
      LIMIT ${cap + 1}`,
  );
  return rows;
}
