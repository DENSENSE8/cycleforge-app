/**
 * POST /api/kiosk/exchange/confirm
 *
 * Two-key confirmation for an in-store channel exchange: does this online
 * order number belong to this phone? Device-authed, so the answer is a
 * BOOLEAN plus the order's own public number — never the buyer, never the
 * lines, never a candidate list.
 *
 * ## Why this route returns nothing else
 *
 * The tablet is unattended-capable. `getEcwidOrder` (the full read this
 * confirmation gates) hands back the buyer's name, email, phone and address
 * off ONE key, and an order number is a short sequential integer a stranger
 * can guess. So the device principal gets the confirmation and the desk gets
 * the order: the staff-authed counter submit calls `getEcwidOrder` itself
 * once the visit is being written (see `submitCounterTransaction`).
 *
 * That is the same reason `/api/ecwid/order-search` — which exists to hand an
 * authenticated operator a rich candidate list — is not reachable from here.
 *
 * Miss and phone mismatch are one answer, deliberately: distinguishing them
 * turns this into an oracle for "is 4788 a real order?".
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { confirmOrderNumberForPhone } from '@/lib/ecwid/client';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  orderNumber: z.string().trim().min(1).max(64),
  // Min 7 mirrors confirmOrderNumberForPhone's own floor: a shorter tail would
  // match far too many orders to be an identity check.
  phone: z.string().trim().min(7).max(32),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const confirmedRef = await confirmOrderNumberForPhone({
    orgId: ctx.organizationId as OrgId,
    orderNumber: parsed.data.orderNumber,
    phone: parsed.data.phone,
  });

  if (!confirmedRef) {
    // One answer for "no such order", "wrong phone", and "the store is
    // unreachable" — the helper itself cannot distinguish them either, by
    // design. The tablet says the same true thing in all three cases: we
    // could not confirm this, ask the counter.
    return NextResponse.json({ error: 'NOT_CONFIRMED' }, { status: 404 });
  }

  return NextResponse.json(
    { confirmedRef },
    { headers: { 'cache-control': 'no-store' } },
  );
});
