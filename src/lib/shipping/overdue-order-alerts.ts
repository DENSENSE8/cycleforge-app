/** Past-ship-by outbound alert producer for the durable GlobalHeader inbox. */

import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { sqlOrderHasPackScan, sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { sqlOrderTestDeadlineAt } from '@/lib/orders/desk-view-sql';

export const OVERDUE_UNFULFILLED_EVENT = 'order.ship_by.overdue_unfulfilled';

interface OverdueOrderRow {
  organization_id: string;
  id: number | string;
  order_number: string;
  deadline_at: Date | string;
  tracking_number: string | null;
  carrier: string | null;
  carrier_status: string;
}

/**
 * Auto-follow this operational SLA for active staff. The fan-out worker still
 * applies the authoritative `orders.view` permission gate before it writes an
 * inbox row; this rule only names the interested cohort.
 */
export const ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL = `
  INSERT INTO staff_subscriptions
    (organization_id, staff_id, subscription_kind, state, reason,
     match_event_keys, match_extra)
  SELECT s.organization_id, s.id, 'rule', 'auto', 'sla',
         ARRAY[$1]::text[], '{"source":"outbound_ship_by"}'::jsonb
    FROM staff s
   WHERE COALESCE(s.active, true) = true
     AND COALESCE(s.status, 'active') = 'active'
     AND NOT EXISTS (
       SELECT 1
         FROM staff_subscriptions existing
        WHERE existing.organization_id = s.organization_id
          AND existing.staff_id = s.id
          AND existing.subscription_kind = 'rule'
          AND $1 = ANY(existing.match_event_keys)
     )
`;

const deadline = sqlOrderTestDeadlineAt('o');
const packed = sqlOrderHasPackScan('o');
const scannedOut = sqlOrderHasShipConfirm('o');

/** One representative row per marketplace order, never one alert per line. */
export const OVERDUE_UNFULFILLED_ORDERS_SQL = `
  WITH order_facts AS MATERIALIZED (
    SELECT o.organization_id,
           o.id,
           COALESCE(NULLIF(BTRIM(o.order_id), ''), o.id::text) AS order_number,
           ${deadline} AS deadline_at,
           stn.tracking_number_normalized AS tracking_number,
           stn.carrier,
           COALESCE(
             NULLIF(BTRIM(stn.latest_status_label), ''),
             NULLIF(BTRIM(stn.latest_status_category), ''),
             CASE WHEN o.shipment_id IS NULL THEN 'No tracking' ELSE 'Not checked' END
           ) AS carrier_status,
           ${packed} AS packed,
           ${scannedOut} AS scanned_out
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     WHERE COALESCE(o.fulfillment_channel, '') <> 'AFN'
       AND UPPER(COALESCE(o.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'VOIDED')
  ), logical_orders AS MATERIALIZED (
    SELECT DISTINCT ON (organization_id, order_number)
           organization_id, id, order_number, deadline_at,
           tracking_number, carrier, carrier_status
      FROM order_facts
     WHERE deadline_at < NOW()
       AND packed = false
       AND scanned_out = false
     ORDER BY organization_id, order_number, deadline_at ASC, id ASC
  )
  SELECT organization_id, id, order_number, deadline_at,
         tracking_number, carrier, carrier_status
    FROM logical_orders
   WHERE NOT EXISTS (
       SELECT 1
         FROM ops_events prior_alert
        WHERE prior_alert.organization_id = logical_orders.organization_id
          AND prior_alert.entity_type = 'order'
          AND prior_alert.entity_id = logical_orders.id
          AND prior_alert.event_type = '${OVERDUE_UNFULFILLED_EVENT}'
     )
   ORDER BY organization_id, order_number, deadline_at ASC, id ASC
   LIMIT $1
`;

export interface OverdueOrderAlertResult {
  candidates: number;
  subscriptionsAdded: number;
}

/**
 * Emit idempotent ops events. The normal notification outbox owns permission
 * filtering, durable inbox delivery, realtime push, and read-state semantics.
 */
export async function emitOverdueOrderAlerts(
  args: { limit?: number } = {},
): Promise<OverdueOrderAlertResult> {
  const limit = Math.min(Math.max(args.limit ?? 250, 1), 1000);
  const subscriptions = await pool.query(ENSURE_OVERDUE_ORDER_SUBSCRIPTIONS_SQL, [
    OVERDUE_UNFULFILLED_EVENT,
  ]);
  const candidates = await pool.query<OverdueOrderRow>(OVERDUE_UNFULFILLED_ORDERS_SQL, [limit]);

  for (const row of candidates.rows) {
    const deadlineIso = new Date(row.deadline_at).toISOString();
    await recordOpsEvent({
      organizationId: row.organization_id,
      entityType: 'order',
      entityId: Number(row.id),
      eventType: OVERDUE_UNFULFILLED_EVENT,
      clientEventId: `outbound-overdue:${row.organization_id}:${row.order_number}:${deadlineIso}`,
      payload: {
        orderNumber: row.order_number,
        shipBy: deadlineIso,
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        carrierStatus: row.carrier
          ? `${row.carrier} · ${row.carrier_status}`
          : row.carrier_status,
      },
    });
  }

  return {
    candidates: candidates.rows.length,
    subscriptionsAdded: subscriptions.rowCount ?? 0,
  };
}
