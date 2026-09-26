import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  lookupShippedOrderForCompare,
  suggestShippedOrdersByNumber,
} from '@/lib/receiving/returned-serial-link';

/** GET /api/receiving/shipped-order-lookup?order_number=<n>&received_serial=<s> */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  // Typeahead mode: `?q=<partial>` returns candidate orders for the Auto-match
  // order-number list. Read-only; no compare, no mutation.
  const suggestQuery = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (suggestQuery) {
    const candidates = await suggestShippedOrdersByNumber(suggestQuery, ctx.organizationId);
    return NextResponse.json({ success: true, candidates });
  }

  const orderNumber = (request.nextUrl.searchParams.get('order_number') ?? '').trim();
  const receivedSerial =
    (request.nextUrl.searchParams.get('received_serial') ?? '').trim() || null;

  if (!orderNumber) {
    return NextResponse.json(
      { success: false, error: 'order_number is required' },
      { status: 400 },
    );
  }

  const result = await lookupShippedOrderForCompare(
    { orderNumber, receivedSerial },
    ctx.organizationId,
  );
  return NextResponse.json({ success: true, ...result });
}, { permission: 'receiving.scan_po' });
