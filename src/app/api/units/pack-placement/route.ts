import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolvePackPlaceableLocations } from '@/lib/packing/pack-placement';
import { countOpenUnitPlacementsByLocation } from '@/lib/packing/unit-pack-placement';

/**
 * GET /api/units/pack-placement — packing DESK/STAGING locations + open
 * loose-unit staged counts per location (Ready-to-Pack unit placement).
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const [locations, counts] = await Promise.all([
    resolvePackPlaceableLocations(ctx.organizationId),
    countOpenUnitPlacementsByLocation(ctx.organizationId),
  ]);
  const totalPlaced = counts.reduce((sum, row) => sum + row.count, 0);
  return NextResponse.json({
    success: true,
    locations,
    counts,
    totalPlaced,
  });
}, { permission: 'orders.view' });
