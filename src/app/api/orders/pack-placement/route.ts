import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  countOpenPlacementsByLocation,
  fetchRecentPackPlacement,
  resolvePackPlaceableLocations,
} from '@/lib/packing/pack-placement';

/** GET /api/orders/pack-placement — packing DESK/STAGING locations + open ready-to-pack package counts per location. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const excludeRaw = new URL(req.url).searchParams.get('excludeOrderId');
  const excludeOrderId =
    excludeRaw != null && excludeRaw.trim() !== '' ? Number(excludeRaw) : null;
  if (
    excludeOrderId != null &&
    (!Number.isFinite(excludeOrderId) || excludeOrderId <= 0)
  ) {
    return NextResponse.json(
      { success: false, error: 'excludeOrderId must be a positive integer' },
      { status: 400 },
    );
  }

  const [locations, counts, recent] = await Promise.all([
    resolvePackPlaceableLocations(ctx.organizationId),
    countOpenPlacementsByLocation(ctx.organizationId),
    fetchRecentPackPlacement(ctx.organizationId, {
      excludeOrderId,
      staffId: ctx.staffId,
    }),
  ]);
  const totalPlaced = counts.reduce((sum, row) => sum + row.count, 0);
  return NextResponse.json({
    success: true,
    locations,
    counts,
    totalPlaced,
    recent,
  });
}, { permission: 'orders.view' });
