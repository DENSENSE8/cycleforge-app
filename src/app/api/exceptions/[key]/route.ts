import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { getExceptionRecord } from '@/lib/exceptions/hub';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exceptions/[key] → `ExceptionRecordResponse` (`{ row, facts }`):
 * the row plus the kind's resolver facts. 404 once the key has left its kind
 * (resolved); 403 when the caller may not see that kind.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    // /api/exceptions/{key} → last segment (the key is URL-encoded: `pairs:TMP-…`).
    const segment = req.nextUrl.pathname.split('/').filter(Boolean).pop() ?? '';
    const result = await getExceptionRecord(
      { orgId: ctx.organizationId, has: (permission) => ctx.permissions.has(permission) },
      decodeURIComponent(segment),
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json(result.record, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/exceptions/[key]');
  }
});
