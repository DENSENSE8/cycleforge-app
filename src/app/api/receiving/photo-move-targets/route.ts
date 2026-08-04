import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { searchReceivingPhotoMoveTargets } from '@/lib/receiving/photo-move-targets';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/receiving/photo-move-targets
 *
 * Carton targets for Move photos. Broader than /api/receiving/po/list:
 * unmatched / ticket-anchored cartons (no Zoho PO lines) resolve by tracking,
 * PO #, carton QR (`R-<id>`), or support ticket id (`#232` / short digits /
 * Zendesk external id).
 *
 * Query:
 *   ?search=…   needle (optional — empty browses Unboxed-rail cartons)
 *   ?limit=25   max 100
 *   ?exclude=N  drop this receiving_id (the carton the move is relative to)
 *
 * When search + exclude empties because the needle only matched the excluded
 * carton, `targets` is the recent browse and `matchedExcludedSelf` is true.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const params = req.nextUrl.searchParams;
    const search = String(params.get('search') || '').trim();
    const limit = Number(params.get('limit') || 25);
    const excludeRaw = params.get('exclude');
    const excludeReceivingId =
      excludeRaw != null && excludeRaw !== ''
        ? Number(excludeRaw)
        : null;

    const { targets, matchedExcludedSelf } = await searchReceivingPhotoMoveTargets({
      orgId: ctx.organizationId as OrgId,
      search,
      limit,
      excludeReceivingId:
        excludeReceivingId != null &&
        Number.isFinite(excludeReceivingId) &&
        excludeReceivingId > 0
          ? excludeReceivingId
          : null,
    });

    return NextResponse.json({ success: true, targets, matchedExcludedSelf });
  } catch (error) {
    return errorResponse(error, 'GET /api/receiving/photo-move-targets');
  }
}, { permission: 'receiving.view' });
