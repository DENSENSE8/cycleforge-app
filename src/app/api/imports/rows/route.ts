import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseImportParams } from '@/lib/imports/params';
import { listImportRows } from '@/lib/imports/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/imports/rows — one row per order an import touched, across runs
 * (or one run's, `?run=`). Params: `src/lib/imports/params.ts` (handoff §6).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const filters = parseImportParams('rows', new URL(req.url).searchParams);
      return NextResponse.json(await listImportRows(ctx.organizationId, filters), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      return errorResponse(error, 'GET /api/imports/rows');
    }
  },
  { permission: 'orders.view' },
);
