import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runEnsureOutboundDocsBatch } from '@/lib/documents/ensure-outbound-docs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/documents/ensure-outbound
 *
 * JIT pack Phase 4 reconciler — for pack-ready (tech-scanned) orders still
 * missing shipping_label / packing_slip, run marketplace fetch. Does not buy
 * postage. Complements the after() hook on publishOrderTested paths.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Number(new URL(request.url).searchParams.get('limit') || 25);

  try {
    const locked = await withCronLock('documents.ensure_outbound', () =>
      withCronRun('documents.ensure_outbound', async () => runEnsureOutboundDocsBatch(limit)),
    );
    if (!locked.ran) {
      return NextResponse.json({ success: true, skipped: 'locked' });
    }
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (err: unknown) {
    console.error('[cron/documents/ensure-outbound]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Ensure outbound docs cron failed',
      },
      { status: 500 },
    );
  }
}
