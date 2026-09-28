import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import type { OrgId } from '@/lib/tenancy/constants';
import { getShipStationV2, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import { ShipAddressSchema, toShipAddress } from '@/lib/shipping/shipstation/rate-request';
import { addressCheckError } from '@/lib/shipping/shipstation/address-validation';

export const dynamic = 'force-dynamic';

const ValidateAddressBody = z.object({ address: ShipAddressSchema });

/**
 * POST /api/shipping/addresses/validate — check one ship-to against ShipStation
 * v2 address validation. Answers 200 with an `AddressCheckResult`; `checked`
 * is false when the validator was never reached (ShipStation not connected, or
 * the engine failed) — that is 'error' with the reason, not a verdict on the address.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(ValidateAddressBody, await req.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;
  const address = toShipAddress(parsed.address);

  try {
    const client = await getShipStationV2(ctx.organizationId as OrgId);
    const [result] = await client.validateAddresses([address]);
    if (!result) return NextResponse.json({ ok: true, checked: false, ...addressCheckError('ShipStation returned no result.') });
    return NextResponse.json({ ok: true, checked: true, ...result });
  } catch (error) {
    if (error instanceof ShipStationNotConnectedError || (error instanceof ShipStationApiError && error.isNotConnected)) {
      return NextResponse.json({ ok: true, checked: false, ...addressCheckError('ShipStation is not connected.') });
    }
    if (error instanceof ShipStationApiError) {
      return NextResponse.json({ ok: true, checked: false, ...addressCheckError(error.message) });
    }
    console.error('[POST /api/shipping/addresses/validate] error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to validate the address' }, { status: 500 });
  }
}, { permission: 'orders.create' });
