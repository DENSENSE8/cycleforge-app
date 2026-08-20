import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { listPendingWork } from '@/lib/receiving/pending-work';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Follow-up work this staffer owes on cartons they have scanned away from —
 * every registered source, merged newest-first.
 *
 * Read-only, so no audit row. `staffId` comes from the verified session
 * (`ctx.staffId`), never the query string: the org+staff scope exists so an
 * operator sees their OWN outstanding work, and taking a staff id from the
 * caller would let any signed-in user enumerate a colleague's cartons.
 *
 * `?receivingId=` narrows to one carton (the ticket chip); omitted, it returns
 * the staffer's open set (the prompt).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = req.nextUrl.searchParams.get('receivingId');
    const parsed = raw == null || raw === '' ? null : Number(raw);
    const receivingId =
      parsed != null && Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;

    const items = await listPendingWork(ctx.organizationId, ctx.staffId, { receivingId });
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error, 'GET /api/receiving/pending-work');
  }
}, { permission: 'receiving.view' });
