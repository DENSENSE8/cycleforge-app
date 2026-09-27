/**
 * ChatReads fixtures — real dev-DB values for the reconcile / customer /
 * worklist / staff-report / tracking goldens, picked read-only by SELECT, and
 * the one write those goldens make (a self-scoped tracking watch), read back
 * and deleted.
 */

import { Pool } from 'pg';

export interface ChatReadsFixtures {
  /** A 6-number vendor paste: 2 received, 2 not received, 1 pending order, 1 unknown. */
  reconcile: {
    received: [string, string];
    notReceivedTracking: string;
    notReceivedPo: string;
    pendingOrder: string;
    unknown: string;
  };
  /** A delivered UPS / FedEx package on an order, with carrier events on file. */
  tracking: { carrier: string; tracking: string; orderNumber: string };
  /** The busiest (staff, Pacific day) of the last 14 days at the pack bench. */
  staffDay: { name: string; day: string; boxes: number };
}

type Q = <R>(sql: string, params: unknown[]) => Promise<R[]>;

const canon = (col: string) => `upper(regexp_replace(COALESCE(${col}, ''), '[^A-Za-z0-9]', '', 'g'))`;

/** Inbound trackings on a Zoho PO whose carton received units — "Received". */
const RECEIVED = `
SELECT s.tracking_number_raw AS ref
  FROM receiving_carton r
  JOIN shipping_tracking_numbers s ON s.id = r.shipment_id
 WHERE r.organization_id = $1
   AND EXISTS (SELECT 1 FROM zoho_po_mirror m WHERE m.organization_id = $1 AND ${canon('m.reference_number')} = s.tracking_number_normalized)
   AND EXISTS (SELECT 1 FROM receiving_line rl WHERE rl.receiving_id = r.id AND rl.organization_id = $1 AND rl.quantity_received > 0)
 ORDER BY r.id DESC
 LIMIT 2`;

/** An issued Zoho PO whose tracking the warehouse has never seen — "Not received". `$2` non-null = UPS-shaped only; `$3` = a PO to skip. */
const NOT_RECEIVED = `
SELECT m.zoho_purchaseorder_number AS po, m.reference_number AS tracking
  FROM zoho_po_mirror m
 WHERE m.organization_id = $1 AND m.status = 'issued'
   AND ($2::text IS NULL OR m.reference_number ~ '^1Z[0-9A-Z]{16}$')
   AND m.zoho_purchaseorder_number IS DISTINCT FROM $3::text
   AND NOT EXISTS (SELECT 1 FROM shipping_tracking_numbers s WHERE s.tracking_number_normalized = ${canon('m.reference_number')})
 ORDER BY m.last_synced_at DESC NULLS LAST, m.zoho_purchaseorder_id
 LIMIT 2`;

/** A labeled, not-yet-moving marketplace order that is nobody's PO — "Pending". */
const PENDING_ORDER = `
SELECT o.order_id AS ref
  FROM orders o
  JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
 WHERE o.organization_id = $1
   AND NOT stn.is_carrier_accepted AND NOT stn.is_in_transit AND NOT stn.is_delivered
   AND o.order_id ~ '^\\d{3}-\\d{7}-\\d{7}$'
   AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
   AND NOT EXISTS (SELECT 1 FROM zoho_po_mirror m WHERE m.organization_id = $1
                     AND (m.zoho_purchaseorder_number_norm = ${canon('o.order_id')} OR ${canon('m.reference_number')} = ${canon('o.order_id')}))
   AND NOT EXISTS (SELECT 1 FROM station_activity_logs s WHERE s.organization_id = $1 AND s.shipment_id = o.shipment_id AND s.activity_type = 'SHIP_CONFIRM')
 ORDER BY o.id DESC
 LIMIT 1`;

const UNKNOWN_EXISTS = `
SELECT EXISTS (SELECT 1 FROM orders WHERE organization_id = $1 AND ${canon('order_id')} = ${canon('$2')})
    OR EXISTS (SELECT 1 FROM zoho_po_mirror WHERE organization_id = $1 AND (zoho_purchaseorder_number_norm = ${canon('$2')} OR ${canon('reference_number')} = ${canon('$2')}))
    OR EXISTS (SELECT 1 FROM shipping_tracking_numbers WHERE tracking_number_normalized = ${canon('$2')}) AS found`;

const DELIVERED = `
SELECT upper(stn.carrier) AS carrier, stn.tracking_number_raw AS tracking, o.order_id AS "orderNumber"
  FROM shipping_tracking_numbers stn
  JOIN orders o ON o.shipment_id = stn.id AND o.organization_id = $1
 WHERE stn.organization_id = $1 AND stn.is_delivered AND upper(stn.carrier) IN ('UPS', 'FEDEX')
   AND (SELECT COUNT(*) FROM shipment_tracking_events e WHERE e.shipment_id = stn.id) >= 3
   AND (SELECT COUNT(*) FROM orders o2 WHERE o2.organization_id = $1 AND o2.shipment_id = stn.id) = 1
 ORDER BY stn.delivered_at DESC NULLS LAST
 LIMIT 1`;

/** The packing KPI's own count: PACK_COMPLETED rows per staff per Pacific day. */
const BUSIEST_PACK_DAY = `
SELECT s.name, (timezone('America/Los_Angeles', sal.created_at))::date::text AS day, COUNT(*)::int AS boxes
  FROM station_activity_logs sal
  JOIN staff s ON s.id = sal.staff_id AND s.organization_id = $1 AND s.active
 WHERE sal.organization_id = $1 AND sal.station = 'PACK' AND sal.activity_type = 'PACK_COMPLETED'
   AND sal.created_at > now() - interval '14 days'
   AND s.name ~ '^[A-Z][a-z]+$'
   AND (SELECT COUNT(*) FROM staff s2 WHERE s2.organization_id = $1 AND s2.active AND lower(s2.name) = lower(s.name)) = 1
 GROUP BY s.name, 2
 ORDER BY boxes DESC, day DESC
 LIMIT 1`;

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`ai-eval chat-reads fixtures: no ${what} in the dev DB`);
  return v;
}

export async function loadChatReadsFixtures(q: Q, orgId: string): Promise<ChatReadsFixtures> {
  const received = await q<{ ref: string }>(RECEIVED, [orgId]);
  // One owed PO pasted by its UPS tracking, a different one by its PO number.
  const [owed] = await q<{ po: string; tracking: string }>(NOT_RECEIVED, [orgId, 'ups', null]);
  const [owedAgain] = await q<{ po: string; tracking: string }>(NOT_RECEIVED, [orgId, null, owed?.po ?? null]);
  const [pending] = await q<{ ref: string }>(PENDING_ORDER, [orgId]);
  const unknown = 'ZZ-NOPE-4417790';
  const [probe] = await q<{ found: boolean }>(UNKNOWN_EXISTS, [orgId, unknown]);
  if (probe?.found) throw new Error(`ai-eval chat-reads fixtures: "${unknown}" exists now — pick another`);
  const [delivered] = await q<ChatReadsFixtures['tracking']>(DELIVERED, [orgId]);
  const [busiest] = await q<ChatReadsFixtures['staffDay']>(BUSIEST_PACK_DAY, [orgId]);
  if (received.length < 2) throw new Error('ai-eval chat-reads fixtures: need two received inbound trackings');
  return {
    reconcile: {
      received: [received[0].ref, received[1].ref],
      // Two different POs: one pasted by tracking, the other by PO number.
      notReceivedTracking: need(owed, 'issued PO with an unseen tracking').tracking,
      notReceivedPo: need(owedAgain, 'second issued PO').po,
      pendingOrder: need(pending, 'unshipped marketplace order').ref,
      unknown,
    },
    tracking: need(delivered, 'delivered UPS / FedEx order package'),
    staffDay: need(busiest, 'pack-bench day in the last 14 days'),
  };
}

/** The golden's synthetic tracking watch — read back, then deleted. */
export async function readTrackingWatch(orgId: string, tracking: string): Promise<Array<{ staff_id: number; state: string }>> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT staff_id, state FROM staff_subscriptions
        WHERE organization_id = $1 AND subscription_kind = 'rule' AND match_tracking_normalized = $2`,
      [orgId, tracking],
    );
    return rows as Array<{ staff_id: number; state: string }>;
  } finally {
    await pool.end();
  }
}

export async function deleteTrackingWatch(orgId: string, tracking: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const res = await pool.query(
      `DELETE FROM staff_subscriptions
        WHERE organization_id = $1 AND subscription_kind = 'rule' AND match_tracking_normalized = $2`,
      [orgId, tracking],
    );
    return res.rowCount ?? 0;
  } finally {
    await pool.end();
  }
}
