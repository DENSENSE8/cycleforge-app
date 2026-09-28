import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseImportParams } from '@/lib/imports/params';
import { listImportRuns } from '@/lib/imports/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/imports/runs — the import record's runs, newest first by default
 * (`/operations/imports`). Params: `src/lib/imports/params.ts` (handoff §6).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const filters = parseImportParams('runs', new URL(req.url).searchParams);
      return NextResponse.json(await listImportRuns(ctx.organizationId, filters), {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      return errorResponse(error, 'GET /api/imports/runs');
    }
  },
  { permission: 'orders.view' },
);
