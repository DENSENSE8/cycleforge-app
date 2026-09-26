/** GET /api/kiosk/customer?phone=5551234567 — "is this phone on file?" */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { findCounterCustomerByPhoneDigits } from '@/lib/counter/submit-counter-transaction';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const digits = (req.nextUrl.searchParams.get('phone') ?? '').replace(/\D/g, '');
  // A whole 10-digit number or nothing: a partial number is a prefix search,
  // which on a customer-facing screen is a directory browse.
  if (digits.length !== 10) {
    return NextResponse.json({ error: 'PHONE_INCOMPLETE' }, { status: 400, headers: NO_STORE });
  }
  const match = await findCounterCustomerByPhoneDigits(ctx.organizationId as OrgId, digits);
  return NextResponse.json(
    { customer: match ? { name: match.storedName } : null },
    { headers: NO_STORE },
  );
});
