/** One order → the ShipStation v2 shipment to rate / buy. */

import 'server-only';
import { ApiError } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveShipFrom } from '@/lib/shipping/shipstation/config';
import { resolveOrderShipTo } from '@/lib/shipping/shipstation/order-ship-to';
import {
  PARCEL_FALLBACK_SELECT_SQL,
  parcelFallbackJoinSql,
  resolveParcelWithSource,
  type ParcelFallbackColumns,
} from '@/lib/orders/parcel-dims';
import { resolveOrderRateParcel } from '@/lib/shipping/shipstation/order-parcel';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';
import type { Parcel, ShipAddress, ShipmentSpec } from '@/lib/shipping/shipstation/types';

// `type` (not `interface`) so it satisfies pg/tenantQuery's `QueryResultRow`
// constraint — interfaces lack the implicit index signature.
type OrderRow = {
  id: number;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
  parcel_weight_oz: string | number | null;
  parcel_length_in: string | number | null;
  parcel_width_in: string | number | null;
  parcel_height_in: string | number | null;
} & ParcelFallbackColumns;

/** pg returns `numeric` as text — normalize to a positive number or null. */
function numericColumn(value: string | number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface OrderShipmentSpecInput {
  orderId: number;
  weightOzOverride?: number | null;
  dimensions?: Parcel['dimensions'];
  carrierIds?: string[];
  purpose?: LabelPurpose;
}

interface OrderShipmentSpec {
  spec: ShipmentSpec;
  /** The BUYER's address, whatever direction the parcel travels. */
  buyerAddress: ShipAddress;
  parcel: Parcel;
  orderRef: string | null;
}

/** The `details` of the 400s below — what the chat turns into a "Still needed" ask. */
export const ORDER_SPEC_MISSING = { shipTo: 'MISSING_SHIP_TO', weight: 'MISSING_PARCEL_WEIGHT' } as const;

/** Throws ApiError 404 (no order) / 400 (no ship-to, no parcel weight; `details` from ORDER_SPEC_MISSING). */
export async function buildOrderShipmentSpec(
  orgId: OrgId,
  input: OrderShipmentSpecInput,
): Promise<OrderShipmentSpec> {
  const res = await tenantQuery<OrderRow>(
    orgId,
    `SELECT o.id, o.order_id, o.account_source, o.customer_id,
            o.parcel_weight_oz, o.parcel_length_in, o.parcel_width_in, o.parcel_height_in,
            ${PARCEL_FALLBACK_SELECT_SQL}
       FROM orders o
       ${parcelFallbackJoinSql('o')}
      WHERE o.id = $1 AND o.organization_id = $2 LIMIT 1`,
    [input.orderId, orgId],
  );
  const order = res.rows[0];
  if (!order) throw ApiError.notFound('order', input.orderId);

  const { shipTo, engineWeight } = await resolveOrderShipTo(orgId, order);
  if (!shipTo) {
    throw ApiError.badRequest(
      'No ship-to address on this order. Add a customer shipping address (or sync it from ShipStation).',
      ORDER_SPEC_MISSING.shipTo,
    );
  }

  // The order's own parcel, else what its SKU / item number remembers.
  const stored = resolveParcelWithSource(
    {
      weightOz: numericColumn(order.parcel_weight_oz),
      lengthIn: numericColumn(order.parcel_length_in),
      widthIn: numericColumn(order.parcel_width_in),
      heightIn: numericColumn(order.parcel_height_in),
    },
    order,
  );
  const parcel = resolveOrderRateParcel({
    stored: {
      weightOz: stored.weightOz,
      lengthIn: stored.lengthIn,
      widthIn: stored.widthIn,
      heightIn: stored.heightIn,
    },
    bodyWeightOz: input.weightOzOverride ?? null,
    bodyDimensions: input.dimensions ?? null,
    fallbackWeight: engineWeight,
  });
  if (!parcel) {
    throw ApiError.badRequest(
      'No parcel weight available. Provide weightOz, set the parcel on the order, or ensure the ShipStation order carries a weight.',
      ORDER_SPEC_MISSING.weight,
    );
  }

  const warehouse = await resolveShipFrom(orgId);
  const isReturn = input.purpose === 'return';
  return {
    spec: {
      shipTo: isReturn ? warehouse : shipTo,
      shipFrom: isReturn ? shipTo : warehouse,
      parcels: [parcel],
      carrierIds: input.carrierIds && input.carrierIds.length ? input.carrierIds : undefined,
    },
    buyerAddress: shipTo,
    parcel,
    orderRef: order.order_id,
  };
}
