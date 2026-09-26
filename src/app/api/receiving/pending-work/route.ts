import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { listPendingWork } from '@/lib/receiving/pending-work';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Follow-up work this staffer owes on cartons they have scanned away from — every registered source, merged newest-first. */
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
