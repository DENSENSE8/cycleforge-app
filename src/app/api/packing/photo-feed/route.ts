import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadPackingPhotoFeed } from '@/lib/packing/photo-feed';
import { withTenantTransaction } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/packing/photo-feed — the phone Packing photo feed (`/m/packing`):
 * the signed-in staff member's latest packs with their photo counts. Read
 * uncached so a photo taken a moment ago is already counted on return.
 */
export const GET = withAuth(async (_req, ctx) => {
  if (!Number.isSafeInteger(ctx.staffId) || ctx.staffId <= 0) {
    return NextResponse.json({ success: false, error: 'Sign in as a staff member to see your packs' }, { status: 403 });
  }
  const rows = await withTenantTransaction(ctx.organizationId, (client) =>
    loadPackingPhotoFeed(client, ctx.organizationId, ctx.staffId),
  );
  return NextResponse.json({ success: true, rows }, { headers: { 'Cache-Control': 'no-store' } });
}, { permission: 'packing.view' });
