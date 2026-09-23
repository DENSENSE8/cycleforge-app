import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { runEcwidPackingSlipLifecycleBatch } from '@/lib/documents/ecwid-packing-slip-lifecycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();
  const limit = Number(new URL(request.url).searchParams.get('limit') || 25);
  try {
    const locked = await withCronLock('documents.ecwid_packing_slips', () =>
      withCronRun('documents.ecwid_packing_slips', () =>
        runEcwidPackingSlipLifecycleBatch(limit),
      ),
    );
    if (!locked.ran) return NextResponse.json({ success: true, skipped: 'locked' });
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (error) {
    console.error('[cron/documents/ecwid-packing-slips]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'ECWID slip retry failed' },
      { status: 500 },
    );
  }
}

