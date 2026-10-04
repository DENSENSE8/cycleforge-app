import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { listOpenUnmatchedScans, type OpenUnmatchedScansResponse } from '@/lib/orders-exceptions';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders-exceptions/unmatched — every open unmatched scan (pack scan
 * or dock scan-out that matched no order), newest first. Fulfilled paints the
 * dock misses from it and copies every tracking number from it.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const scans = await listOpenUnmatchedScans(ctx.organizationId as OrgId);
    const body: OpenUnmatchedScansResponse = { count: scans.length, scans };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/orders-exceptions/unmatched');
  }
}, { permission: 'packing.view' });
