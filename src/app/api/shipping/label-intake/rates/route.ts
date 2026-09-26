import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseBody } from '@/lib/schemas/parse';
import { LabelIntakeRatesBody } from '@/lib/schemas/label-intake';
import { toParcel, toShipAddress } from '@/lib/shipping/shipstation/rate-request';
import { rateReferenceLabel } from '@/lib/shipping/label-intake';
import { labelIntakeErrorResponse } from '@/lib/shipping/label-intake-errors';

export const dynamic = 'force-dynamic';

/** POST /api/shipping/label-intake/rates */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const body = parseBody(LabelIntakeRatesBody, raw);
    if (body instanceof NextResponse) return body;
    const result = await rateReferenceLabel(ctx.organizationId as OrgId, {
      purpose: body.purpose,
      customer: toShipAddress(body.shipTo),
      parcel: toParcel(body.parcel),
    });
    return NextResponse.json({ ok: true, rates: result.rates, invalidRates: result.invalidRates });
  } catch (error) {
    return labelIntakeErrorResponse(error, 'POST /api/shipping/label-intake/rates');
  }
}, { permission: 'shipping.buy_label' });
