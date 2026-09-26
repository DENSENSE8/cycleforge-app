import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveScanObjectState } from '@/lib/scan/object-state';
import { createScanObjectStateDeps } from '@/lib/scan/object-state-deps';

/** Read-only scan object state — `GET /api/scan/object-state?value=`. */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const value = (url.searchParams.get('value') ?? '').trim();
    if (!value) {
      return NextResponse.json(
        { success: false, error: 'value is required' },
        { status: 400 },
      );
    }

    const result = await resolveScanObjectState(
      value,
      createScanObjectStateDeps(ctx.organizationId),
    );
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'unrecognized scan' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, ...result });
  },
  { permission: 'receiving.view' },
);
