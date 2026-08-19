import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { listPendingNasArchives } from '@/lib/receiving/nas-archive-pending';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cartons whose ticket has photos THIS staffer took after it was filed, still
 * not copied to the NAS claim folder.
 *
 * Read-only, so no audit row — and `staffId` comes from the verified session
 * (`ctx.staffId`), never the query string: the whole point of the org+staff
 * scope is that an operator sees their own outstanding work, and accepting a
 * staff id from the caller would let any signed-in user enumerate a
 * colleague's cartons.
 *
 * `?receivingId=` narrows to the open carton (the ticket chip); omitted, it
 * returns the staffer's open set (the archive prompt).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = req.nextUrl.searchParams.get('receivingId');
    const parsed = raw == null || raw === '' ? null : Number(raw);
    const receivingId =
      parsed != null && Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;

    const items = await listPendingNasArchives(ctx.organizationId, ctx.staffId, {
      receivingId,
    });

    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error, 'GET /api/receiving/nas-archive-pending');
  }
}, { permission: 'receiving.view' });
