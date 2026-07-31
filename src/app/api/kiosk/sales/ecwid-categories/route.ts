/**
 * GET /api/kiosk/sales/ecwid-categories
 *
 * Device-authed retail category tree for the Buy/Sell left rail. Same response
 * shape as `/api/kiosk/repair/ecwid-categories`. Excludes the repair subtree.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadRetailCategoryLevelForOrg } from '@/lib/kiosk/sales-catalog';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  try {
    const level = await loadRetailCategoryLevelForOrg(
      ctx.organizationId as OrgId,
      req.nextUrl.searchParams.get('parentId'),
    );

    return NextResponse.json(
      { success: true, ...level },
      { headers: { 'Cache-Control': `private, max-age=${level.message ? 60 : 120}` } },
    );
  } catch (error: unknown) {
    console.error('GET /api/kiosk/sales/ecwid-categories error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
