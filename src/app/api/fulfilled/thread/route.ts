/** /api/fulfilled/thread — one fulfilled order's thread: the staff notes on its lines and the desk's events on them (`src/lib/outbound/fulfilled-thread.ts`). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { readFulfilledThread } from '@/lib/outbound/fulfilled-thread-read';
import { FulfilledThreadQuery } from '@/lib/schemas/nav';

export const dynamic = 'force-dynamic';

/**
 * GET ?orders=<orders.id>,… → `FulfilledThreadRead`. Gated by the Fulfilled
 * page's own permission (`packing.view`): the desk reads the order's thread
 * where it reads the order. Writing a note stays the order's own
 * (`POST /api/orders/[id]/notes`).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = FulfilledThreadQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: parsed.error.issues.map((issue) => issue.message).join('; ') }, { status: 400 });
    }
    const thread = await readFulfilledThread(ctx.organizationId, parsed.data.orders);
    return NextResponse.json(thread, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/fulfilled/thread');
  }
}, { permission: 'packing.view' });
