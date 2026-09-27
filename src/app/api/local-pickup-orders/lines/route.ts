import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listLocalPickupLines } from '@/lib/local-pickup/pickup-lines-query';

/** Local Pickup display feed — the flattened product rows for the `/pickup` receiving mode, grouped by their LCPU order (the Unbox-family… */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(req.url);
    const lines = await listLocalPickupLines(ctx.organizationId, {
      status: (searchParams.get('status') || '').trim().toUpperCase(),
      q: (searchParams.get('q') || '').trim(),
      limit: Math.min(Math.max(Number(searchParams.get('limit') || 500), 1), 1000),
    });
    return NextResponse.json({ success: true, lines });
  } catch (error: unknown) {
    console.error('[local-pickup-orders/lines][GET]', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch pickup lines';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'walk_in.view' });
