/**
 * Cron: drain ticket_work_outbox into the helpdesk.
 *
 * GET /api/cron/ticket-outbox?batch=25&maxBatches=10
 *
 * The compensating half of counter/repair intake. Intake never blocks on the
 * helpdesk being reachable — it queues the ticket work and returns — so this is
 * what actually lands the ticket. Without a drainer the queue is just a nicer
 * place to lose tickets than the old log-and-continue catch.
 *
 * Mirrors /api/cron/search-outbox: bounded drain batches under a cron lock, so a
 * burst can't run the function past its duration budget or overlap the next
 * invocation. A row whose org has no helpdesk connected is released without
 * burning an attempt, so an unconnected tenant's queue never dead-letters itself.
 *
 * Auth: CRON_SECRET bearer — the same gate as the other
 * /api/cron routes, which are session-less by design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import {
  drainTicketWorkOutbox,
  type DrainTicketWorkResult,
} from '@/lib/support/ticket-outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const batchSize = clampInt(req.nextUrl.searchParams.get('batch'), 25, 1, 200);
  const maxBatches = clampInt(req.nextUrl.searchParams.get('maxBatches'), 10, 1, 50);

  const totals: DrainTicketWorkResult = {
    claimed: 0,
    created: 0,
    attached: 0,
    replied: 0,
    failed: 0,
  };
  let batches = 0;

  try {
    const locked = await withCronLock('ticket-outbox', () =>
      withCronRun('ticket-outbox', async () => {
        for (let i = 0; i < maxBatches; i++) {
          const r = await drainTicketWorkOutbox({ batchSize });
          batches += 1;
          totals.claimed += r.claimed;
          totals.created += r.created;
          totals.attached += r.attached;
          totals.replied += r.replied;
          totals.failed += r.failed;
          if (r.claimed < batchSize) break; // queue drained
        }
        return { batches, ...totals };
      }),
    );
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
