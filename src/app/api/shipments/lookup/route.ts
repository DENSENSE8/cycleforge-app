import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ShipmentLookupQuery } from '@/lib/schemas/shipments';
import { lookupShipmentByTrackingKey } from '@/lib/shipments/shipment-lookup';

/**
 * GET /api/shipments/lookup?tracking= — resolve a carrier tracking to the
 * org's package (exact normalized → key18 → unambiguous last-8). READ-ONLY:
 * never registers a shipment. 404 when no package carries it.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = ShipmentLookupQuery.safeParse({
    tracking: new URL(req.url).searchParams.get('tracking') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'A tracking number is required' }, { status: 400 });
  }

  try {
    const hit = await lookupShipmentByTrackingKey(ctx.organizationId, parsed.data.tracking);
    if (!hit) return NextResponse.json({ error: 'No package carries this tracking' }, { status: 404 });
    return NextResponse.json(hit, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error in GET /api/shipments/lookup:', error);
    return NextResponse.json({ error: 'Tracking lookup failed' }, { status: 500 });
  }
}, { permission: 'shipping.view' });
