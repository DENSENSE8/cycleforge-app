import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  countOpenPlacementsByLocation,
  resolvePackPlaceableLocations,
} from '@/lib/packing/pack-placement';

/**
 * GET /api/orders/pack-placement — packing DESK/STAGING locations + open
 * ready-to-pack package counts per location.
 *
 * Readable with either tech or packing view (Ready to Pack + Pack + To-ship).
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const [locations, counts] = await Promise.all([
      resolvePackPlaceableLocations(ctx.organizationId),
      countOpenPlacementsByLocation(ctx.organizationId),
    ]);
    const totalPlaced = counts.reduce((sum, row) => sum + row.count, 0);
    return NextResponse.json({
      success: true,
      locations,
      counts,
      totalPlaced,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load pack placement';
    console.error('Error in GET /api/orders/pack-placement:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'orders.view' });
