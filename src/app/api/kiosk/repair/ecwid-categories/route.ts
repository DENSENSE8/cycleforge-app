/**
 * GET /api/kiosk/repair/ecwid-categories
 *
 * Device-authed twin of `/api/repair/ecwid-categories` — same
 * `resolveRepairCategoryLevel` walk of the Ecwid repair category tree, gated
 * by `withKioskAuth` instead of a staff session/permission so the front-desk
 * tablet can browse categories the same way staff do.
 *
 * Read-only and confined to the repair subtree by the shared resolver (a
 * `parentId` outside a repair root is ignored, not honored).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveEcwidStoreCreds, resolveRepairCategoryLevelCached } from '@/lib/repair/ecwid-repair-catalog';

export const runtime = 'nodejs';

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  try {
    const { storeId, token } = resolveEcwidStoreCreds();
    const level = await resolveRepairCategoryLevelCached(
      storeId,
      token,
      req.nextUrl.searchParams.get('parentId'),
      ctx.organizationId,
    );

    return NextResponse.json(
      { success: true, ...level },
      { headers: { 'Cache-Control': `private, max-age=${level.message ? 60 : 120}` } },
    );
  } catch (error: unknown) {
    console.error('GET /api/kiosk/repair/ecwid-categories error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
