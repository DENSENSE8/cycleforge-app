import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  getShipStationV1,
  getShipStationV2,
  resolveShipFrom,
  ShipFromNotConfiguredError,
  ShipStationNotConnectedError,
} from '@/lib/shipping/shipstation/config';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import {
  OrderRateDimensionsSchema,
  resolveOrderRateParcel,
} from '@/lib/shipping/shipstation/order-parcel';
import type { Parcel, ShipAddress, ShipmentSpec } from '@/lib/shipping/shipstation/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/shipping/order-rates
 *
 * Rate-shop a single order via the ShipStation v2 engine. Ship-to + parcel
 * weight come from the order's stored ShipStation data when it's ShipStation-
 * sourced (the user's chosen weight source, fetched live from v1); otherwise
 * from the local customer + an explicit weight override. Read-only — no DB
 * mutation, no label purchased.
 *
 * Body: { orderId: number, carrierIds?: string[], weightOz?: number,
 *         dimensions?: { length, width, height, unit: 'inch'|'centimeter' } }
 * Parcel precedence: explicit body values → parcel stored on the order
 * (`parcel_weight_oz` + `parcel_*_in`) → ShipStation-stored weight.
 * Returns the normalized RateQuoteResult (see src/lib/shipping/shipstation/types).
 */

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
};

async function loadOrder(orgId: OrgId, orderId: number): Promise<OrderRow | null> {
  const res = await tenantQuery<OrderRow>(
    orgId,
    `SELECT id, order_id, account_source, customer_id,
            parcel_weight_oz, parcel_length_in, parcel_width_in, parcel_height_in
       FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [orderId, orgId],
  );
  return res.rows[0] ?? null;
}

/** pg returns `numeric` as text — normalize to a positive number or null. */
function numericColumn(value: string | number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadCustomerShipTo(orgId: OrgId, customerId: number): Promise<ShipAddress | null> {
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

/** Resolve ship-to + the engine-side weight, preferring ShipStation data. */
async function resolveShipToAndEngineWeight(
  orgId: OrgId,
  order: OrderRow,
): Promise<{ shipTo: ShipAddress | null; engineWeight: Parcel['weight'] | null }> {
  let shipTo: ShipAddress | null = null;
  let engineWeight: Parcel['weight'] | null = null;

  if (order.account_source === 'shipstation' && order.order_id) {
    const v1 = await getShipStationV1(orgId);
    if (v1) {
      const ssOrder = await v1.getOrderByNumber(order.order_id);
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

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId as OrgId;
    const body = await req.json().catch(() => null);
    const orderId = Number(body?.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw ApiError.badRequest('Valid orderId is required');
    }
    const carrierIds = Array.isArray(body?.carrierIds)
      ? body.carrierIds.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const weightOzOverride =
      typeof body?.weightOz === 'number' && body.weightOz > 0 ? body.weightOz : null;
    // Optional dimensions — the exact `ParcelSchema.dimensions` shape, so the
    // triage form and the Labels workbench speak one parcel vocabulary.
    let bodyDimensions = null;
    if (body?.dimensions != null) {
      const parsed = OrderRateDimensionsSchema.safeParse(body.dimensions);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'dimensions must be { length, width, height, unit: inch|centimeter } with positive numbers',
        );
      }
      bodyDimensions = parsed.data;
    }

    const order = await loadOrder(orgId, orderId);
    if (!order) throw ApiError.notFound('order', orderId);

    const { shipTo, engineWeight } = await resolveShipToAndEngineWeight(orgId, order);
    if (!shipTo) {
      throw ApiError.badRequest(
        'No ship-to address on this order. Add a customer shipping address (or sync it from ShipStation).',
      );
    }

    const parcel = resolveOrderRateParcel({
      stored: {
        weightOz: numericColumn(order.parcel_weight_oz),
        lengthIn: numericColumn(order.parcel_length_in),
        widthIn: numericColumn(order.parcel_width_in),
        heightIn: numericColumn(order.parcel_height_in),
      },
      bodyWeightOz: weightOzOverride,
      bodyDimensions,
      fallbackWeight: engineWeight,
    });
    if (!parcel) {
      throw ApiError.badRequest(
        'No parcel weight available. Provide weightOz, set the parcel on the order, or ensure the ShipStation order carries a weight.',
      );
    }

    const shipFrom = await resolveShipFrom(orgId);
    const spec: ShipmentSpec = {
      shipTo,
      shipFrom,
      parcels: [parcel],
      carrierIds: carrierIds && carrierIds.length ? carrierIds : undefined,
    };

    const client = await getShipStationV2(orgId);
    const result = await client.getRates(spec);

    return NextResponse.json({
      ok: true,
      ...result,
      shipTo,
      weight: parcel.weight,
      dimensions: parcel.dimensions ?? null,
    });
  } catch (error) {
    if (error instanceof ShipStationNotConnectedError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'SHIPSTATION_NOT_CONNECTED' },
        { status: 400 },
      );
    }
    if (error instanceof ShipFromNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: 'SHIP_FROM_NOT_CONFIGURED' },
        { status: 400 },
      );
    }
    if (error instanceof ShipStationApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.isNotConnected ? 400 : 502 },
      );
    }
    return errorResponse(error, 'POST /api/shipping/order-rates');
  }
}, { permission: 'shipping.buy_label' });
