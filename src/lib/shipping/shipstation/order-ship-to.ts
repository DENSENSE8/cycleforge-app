/** Order → ship-to resolution, shared by the rate-shop and label-purchase routes. */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getShipStationV1 } from './config';
import type { Parcel, ShipAddress } from './types';

/** The order fields ship-to resolution reads. Both routes' row shapes satisfy it. */
type ShipToOrderRow = {
  /** orders.id — pairs the row to its ShipStation order via `shipstation_order_refs`. */
  id?: number | string | null;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
};

/** The buyer's stored ship-to (the current-address cache) and when staff last corrected it. */
export type CustomerShipToTier = { shipTo: ShipAddress | null; editedAt: Date | null; orderCreatedAt: Date | null };

/** Load the buyer's stored ship-to from `customers`, plus the staff-correction stamp and the order's creation time. */
async function loadCustomerShipTo(
  orgId: OrgId,
  customerId: number,
  orderRowId: number | null,
): Promise<CustomerShipToTier> {
  const res = await tenantQuery<{
    name: string | null;
    phone: string | null;
    addr1: string | null;
    addr2: string | null;
    city: string | null;
    state: string | null;
    postal: string | null;
    country: string | null;
    edited_at: Date | null;
    order_created_at: Date | null;
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
       NULLIF(shipping_country, '')   AS country,
       shipping_edited_at             AS edited_at,
       (SELECT o.created_at FROM orders o WHERE o.id = $3 AND o.organization_id = $2) AS order_created_at
     FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [customerId, orgId, orderRowId],
  );
  const r = res.rows[0];
  if (!r) return { shipTo: null, editedAt: null, orderCreatedAt: null };
  return {
    shipTo:
      r.addr1 && r.city
        ? {
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
          }
        : null,
    editedAt: r.edited_at,
    orderCreatedAt: r.order_created_at,
  };
}

/**
 * Which ship-to a label is bought to. ShipStation's own order ship-to wins,
 * except over a staff CORRECTION (`customers.shipping_edited_at`) made at or
 * after the order was created — a later order carries the buyer's newer
 * address, so an old correction never overrides it. The customer tier is the
 * fallback when ShipStation has nothing.
 */
export function pickOrderShipTo(
  shipStation: ShipAddress | null,
  customer: CustomerShipToTier,
): ShipAddress | null {
  const { shipTo, editedAt, orderCreatedAt } = customer;
  const staffCorrected =
    shipTo != null && editedAt != null && (orderCreatedAt == null || editedAt.getTime() >= orderCreatedAt.getTime());
  return staffCorrected ? shipTo : (shipStation ?? shipTo);
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

/** Resolve ship-to (+ the engine-stored weight when the v1 order carries one)
 * per {@link pickOrderShipTo}. Never throws for a missing v1 connection —
 * falls through to the local customer tier. */
export async function resolveOrderShipTo(
  orgId: OrgId,
  order: ShipToOrderRow,
): Promise<{ shipTo: ShipAddress | null; engineWeight: Parcel['weight'] | null }> {
  let shipStationShipTo: ShipAddress | null = null;
  let engineWeight: Parcel['weight'] | null = null;

  if (order.order_id && (await isShipStationOrder(orgId, order).catch(() => false))) {
    const v1 = await getShipStationV1(orgId).catch(() => null);
    if (v1) {
      const ssOrder = await v1.getOrderByNumber(order.order_id).catch(() => null);
      if (ssOrder) {
        shipStationShipTo = ssOrder.shipTo;
        if (ssOrder.weight) engineWeight = ssOrder.weight;
      }
    }
  }

  const orderRowId = Number(order.id);
  const customer = order.customer_id
    ? await loadCustomerShipTo(orgId, order.customer_id, Number.isFinite(orderRowId) && orderRowId > 0 ? orderRowId : null)
    : { shipTo: null, editedAt: null, orderCreatedAt: null };

  return { shipTo: pickOrderShipTo(shipStationShipTo, customer), engineWeight };
}

/** Facts snapshot onto the label's STN row — the as-shipped record. */
interface ShipmentSnapshotMeta {
  shipTo: ShipAddress;
  customerId: number | null;
  orderRef: string;
  labelId: string | number | null;
  service: string | null;
  cost: number | null;
  currency: string | null;
  purchasedBy: string | number | null;
}

/** Snapshot the AS-SHIPPED ship-to (+ purchase facts) onto the tracking row. */
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
