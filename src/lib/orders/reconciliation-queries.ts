/** CF-03 / CF-04 reconciliation reads for the Operations Reconciliation Monitor. */

import { tenantQuery } from '@/lib/tenancy/db';

export type SmearCandidateRow = {
  orderRowId: number;
  orderId: string;
  shipmentId: number;
  productTitle: string | null;
  siblingCount: number;
  unboundSerialCount: number;
};

export type OpenExceptionRow = {
  id: number;
  tracking: string;
  sourceStation: string;
  reason: string;
  staffName: string | null;
  createdAt: string | null;
  ageHours: number;
};

type ReconciliationSnapshot = {
  smearCandidates: SmearCandidateRow[];
  openExceptions: OpenExceptionRow[];
  generatedAt: string;
};

/**
 * Orders that share a carton with siblings AND still have unbound
 * (`order_id IS NULL`) tech_serial_numbers on that shipment — the dual-read
 * sunset risk set.
 */
async function listSmearCandidates(
  orgId: string,
  limit = 40,
): Promise<SmearCandidateRow[]> {
  const result = await tenantQuery<{
    id: number;
    order_id: string | null;
    shipment_id: number;
    product_title: string | null;
    sibling_count: string;
    unbound_serial_count: string;
  }>(
    orgId,
    `SELECT
       o.id,
       o.order_id,
       o.shipment_id,
       o.product_title,
       (
         SELECT COUNT(*)::int
         FROM orders o2
         WHERE o2.shipment_id = o.shipment_id
           AND o2.organization_id = o.organization_id
           AND o2.id <> o.id
       ) AS sibling_count,
       (
         SELECT COUNT(*)::int
         FROM tech_serial_numbers tsn
         WHERE tsn.shipment_id = o.shipment_id
           AND tsn.organization_id = o.organization_id
           AND tsn.order_id IS NULL
       ) AS unbound_serial_count
     FROM orders o
     WHERE o.organization_id = $1
       AND o.shipment_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM orders o2
         WHERE o2.shipment_id = o.shipment_id
           AND o2.organization_id = o.organization_id
           AND o2.id <> o.id
       )
       AND EXISTS (
         SELECT 1 FROM tech_serial_numbers tsn
         WHERE tsn.shipment_id = o.shipment_id
           AND tsn.organization_id = o.organization_id
           AND tsn.order_id IS NULL
       )
     ORDER BY unbound_serial_count DESC, o.id DESC
     LIMIT $2`,
    [orgId, limit],
  );

  return result.rows.map((r) => ({
    orderRowId: Number(r.id),
    orderId: String(r.order_id ?? ''),
    shipmentId: Number(r.shipment_id),
    productTitle: r.product_title,
    siblingCount: Number(r.sibling_count) || 0,
    unboundSerialCount: Number(r.unbound_serial_count) || 0,
  }));
}

/** Open unmatched-tracking exceptions (past ~24h ages first for triage). */
async function listOpenExceptions(
  orgId: string,
  limit = 40,
): Promise<OpenExceptionRow[]> {
  const result = await tenantQuery<{
    id: number;
    shipping_tracking_number: string;
    source_station: string;
    exception_reason: string;
    staff_name: string | null;
    created_at: string | null;
    age_hours: string;
  }>(
    orgId,
    `SELECT
       oe.id,
       oe.shipping_tracking_number,
       oe.source_station,
       oe.exception_reason,
       oe.staff_name,
       to_char(oe.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       EXTRACT(EPOCH FROM (NOW() - oe.created_at)) / 3600.0 AS age_hours
     FROM orders_exceptions oe
     WHERE oe.organization_id = $1
       AND oe.status = 'open'
     ORDER BY oe.created_at ASC NULLS LAST
     LIMIT $2`,
    [orgId, limit],
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    tracking: String(r.shipping_tracking_number ?? ''),
    sourceStation: String(r.source_station ?? ''),
    reason: String(r.exception_reason ?? ''),
    staffName: r.staff_name,
    createdAt: r.created_at,
    ageHours: Math.round(Number(r.age_hours) || 0),
  }));
}

export async function getReconciliationSnapshot(orgId: string): Promise<ReconciliationSnapshot> {
  const [smearCandidates, openExceptions] = await Promise.all([
    listSmearCandidates(orgId),
    listOpenExceptions(orgId),
  ]);
  return {
    smearCandidates,
    openExceptions,
    generatedAt: new Date().toISOString(),
  };
}
