/**
 * Cron: drain notification_outbox into staff_inbox_items.
 *
 * GET /api/cron/notification-outbox?batch=50&maxBatches=10
 *
 * The async half of the Home subscription pipeline (ops_events trigger →
 * outbox → worker → per-staff inbox). Loops bounded drain batches until the
 * queue is empty or maxBatches is hit, so a burst of receives can't run the
 * function past its duration budget.
 *
 * Auth: Vercel cron origin or CRON_SECRET bearer — the same gate as every other
 * /api/cron route. Cron routes are session-less by design (route-permissions
 * exemption pattern for /api/cron/*).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isVercelCronOrigin } from '@/lib/cron/auth';
import { withCronLock } from '@/lib/cron/lock';
import { drainNotificationOutbox, type FanoutResult } from '@/lib/notifications/fanout-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

export async function GET(req: NextRequest) {
  if (!isVercelCronOrigin(req.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchSize = clampInt(req.nextUrl.searchParams.get('batch'), 50, 1, 200);
  const maxBatches = clampInt(req.nextUrl.searchParams.get('maxBatches'), 10, 1, 50);

  const totals: FanoutResult = {
    claimed: 0,
    skippedNotNotifiable: 0,
    delivered: 0,
    collapsed: 0,
    failed: 0,
  };
  let batches = 0;

  try {
    // Overlap guard (house pattern): a budget-length run would otherwise
    // overlap the next invocation and re-claim the same window.
    const locked = await withCronLock('notification-outbox', async () => {
      for (let i = 0; i < maxBatches; i++) {
        const r = await drainNotificationOutbox({ batchSize });
        batches += 1;
        totals.claimed += r.claimed;
        totals.skippedNotNotifiable += r.skippedNotNotifiable;
        totals.delivered += r.delivered;
        totals.collapsed += r.collapsed;
        totals.failed += r.failed;
        if (r.claimed < batchSize) break; // queue drained
      }
    });
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'drain failed',
        batches,
        ...totals,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, batches, ...totals });
}
