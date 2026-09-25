/**
 * Order → ship-to resolution, shared by the rate-shop and label-purchase
 * routes. Precedence:
 *
 *   1. ShipStation-sourced order → the LIVE v1 order's stored ship-to (the
 *      marketplace is the system of record for it)
 *   2. otherwise → the linked local `customers` row's shipping columns (the
 *      customer book the syncs maintain)
 *
 * Extracted from POST /api/shipping/order-rates when label purchase needed the
 * same resolution — two private copies of one precedence is how they drift.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getShipStationV1 } from './config';
import type { Parcel, ShipAddress } from './types';

/** The order fields ship-to resolution reads. Both routes' row shapes satisfy it. */
export type ShipToOrderRow = {
  /** orders.id — pairs the row to its ShipStation order via `shipstation_order_refs`. */
  id?: number | string | null;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
};

/** Load the buyer's stored ship-to from `customers` (the current-address cache). */
export async function loadCustomerShipTo(
  orgId: OrgId,
  customerId: number,
): Promise<ShipAddress | null> {
  const res = await tenantQuery<{
    name: string | null;
    phone: string | null;
    addr1: string | null;
    addr2: string | null;
    city: string | null;
    state: string | null;
    postal: string | null;
    country: string | null;
  }>(
    orgId,
    `SELECT
       COALESCE(NULLIF(display_name, ''), NULLIF(customer_name, ''),
                NULLIF(CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(last_name, '')), ''), '') AS name,
       NULLIF(phone, '')              AS phone,
       NULLIF(shipping_address_1, '') AS addr1,
       NULLIF(shipping_address_2, '') AS addr2,
       NULLIF(shipping_city, '')      AS city,
       NULLIF(shipping_state, '')     AS state,
       NULLIF(shipping_postal_code, '') AS postal,
       NULLIF(shipping_country, '')   AS country
     FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [customerId, orgId],
  );
  const r = res.rows[0];
  if (!r || !r.addr1 || !r.city) return null;
  return {
    name: r.name || 'Customer',
    phone: r.phone,
    company: null,
    addressLine1: r.addr1,
    addressLine2: r.addr2,
    cityLocality: r.city,
    stateProvince: r.state ?? '',
    postalCode: r.postal ?? '',
    countryCode: (r.country ?? 'US').toUpperCase(),
    residential: true,
  };
}

/**
 * Is this order a ShipStation order? Imports carry their PLATFORM account_source
 * (never 'shipstation'), so the durable answer is a `shipstation_order_refs` row;
 * the legacy 'shipstation' source still counts until those rows are re-keyed.
 */
export async function isShipStationOrder(orgId: OrgId, order: ShipToOrderRow): Promise<boolean> {
  if (!order.order_id) return false;
  if (String(order.account_source ?? '').trim().toLowerCase() === 'shipstation') return true;
  const id = Number(order.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const res = await tenantQuery<{ one: number }>(
    orgId,
    `SELECT 1 AS one FROM shipstation_order_refs WHERE organization_id = $1 AND order_row_id = $2 LIMIT 1`,
    [orgId, id],
  );
  return res.rows.length > 0;
}

/** Resolve ship-to (+ the engine-stored weight when the v1 order carries one),
 * preferring ShipStation's own data. Never throws for a missing v1 connection —
 * falls through to the local customer tier. */
export async function resolveOrderShipTo(
  orgId: OrgId,
  order: ShipToOrderRow,
): Promise<{ shipTo: ShipAddress | null; engineWeight: Parcel['weight'] | null }> {
  let shipTo: ShipAddress | null = null;
  let engineWeight: Parcel['weight'] | null = null;

  if (order.order_id && (await isShipStationOrder(orgId, order).catch(() => false))) {
    const v1 = await getShipStationV1(orgId).catch(() => null);
    if (v1) {
      const ssOrder = await v1.getOrderByNumber(order.order_id).catch(() => null);
      if (ssOrder) {
        shipTo = ssOrder.shipTo;
        if (ssOrder.weight) engineWeight = ssOrder.weight;
      }
    }
  }

  if (!shipTo && order.customer_id) {
    shipTo = await loadCustomerShipTo(orgId, order.customer_id);
  }

  return { shipTo, engineWeight };
}

/** Facts snapshot onto the label's STN row — the as-shipped record. */
export interface ShipmentSnapshotMeta {
  shipTo: ShipAddress;
  customerId: number | null;
  orderRef: string;
  labelId: string | number | null;
  service: string | null;
  cost: number | null;
  currency: string | null;
  purchasedBy: string | number | null;
}

/**
 * Snapshot the AS-SHIPPED ship-to (+ purchase facts) onto the tracking row.
 * The address a label was bought against otherwise exists only inside the PDF
 * bytes — unrecoverable for a return/replacement label once the marketplace
 * order ages out. Merge-semantics (`metadata ||`), never a wholesale
 * overwrite, so carrier-webhook metadata survives.
 */
export async function snapshotShipToOnShipment(
  orgId: OrgId,
  shipmentId: number,
  meta: ShipmentSnapshotMeta,
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE shipping_tracking_numbers
        SET metadata = metadata || $3::jsonb, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      shipmentId,
      orgId,
      JSON.stringify({
        ship_to: meta.shipTo,
        customer_id: meta.customerId,
        order_ref: meta.orderRef,
        label_id: meta.labelId,
        service: meta.service,
        cost: meta.cost,
        currency: meta.currency,
        purchased_by: meta.purchasedBy,
      }),
    ],
  );
}
