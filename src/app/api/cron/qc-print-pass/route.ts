/** Cron: retry QC print-pass presses whose background run did not land (qc_print_pass_outbox). */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { sweepQcPrintPass } from '@/lib/tech/qc-print-pass';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const limit = clampInt(req.nextUrl.searchParams.get('limit'), 25, 1, 200);

  try {
    const locked = await withCronLock('qc-print-pass', () =>
      withCronRun('qc-print-pass', () => sweepQcPrintPass(limit)),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
    return NextResponse.json({ ok: true, ...locked.result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sweep failed' },
      { status: 500 },
    );
  }
}
