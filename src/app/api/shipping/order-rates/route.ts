import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getShipStationV2,
  ShipFromNotConfiguredError,
  ShipStationNotConnectedError,
} from '@/lib/shipping/shipstation/config';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import { OrderRateDimensionsSchema } from '@/lib/shipping/shipstation/order-parcel';
import { buildOrderShipmentSpec } from '@/lib/shipping/shipstation/order-shipment-spec';
import { isLabelPurpose } from '@/lib/shipping/label-purpose';

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
 *         dimensions?: { length, width, height, unit: 'inch'|'centimeter' },
 *         purpose?: 'outbound'|'return'|'replacement' }
 * Parcel precedence: explicit body values → parcel stored on the order
 * (`parcel_weight_oz` + `parcel_*_in`) → ShipStation-stored weight.
 * `purpose: 'return'` rates the parcel the other way — buyer → warehouse —
 * the shipment a return label is bought against (buildOrderShipmentSpec).
 * Returns the normalized RateQuoteResult (see src/lib/shipping/shipstation/types).
 */
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
    if (body?.purpose != null && !isLabelPurpose(body.purpose)) {
      throw ApiError.badRequest('purpose must be outbound, return or replacement');
    }
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

    const { spec, buyerAddress, parcel } = await buildOrderShipmentSpec(orgId, {
      orderId,
      weightOzOverride,
      dimensions: bodyDimensions,
      carrierIds,
      purpose: body?.purpose ?? 'outbound',
    });

    const client = await getShipStationV2(orgId);
    const result = await client.getRates(spec);

    return NextResponse.json({
      ok: true,
      ...result,
      shipTo: buyerAddress,
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
