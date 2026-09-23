/**
 * Cron: poll Zendesk for watched-ticket updates.
 *
 * GET /api/cron/zendesk/ticket-watch?limit=100
 *
 * For each org with Zendesk connected, walks `support_ticket_assignments`,
 * pulls live ticket state, refreshes `support_tickets` caches, and notifies
 * the assignee via staff_messages + Ably when subject/status change.
 *
 * Auth: CRON_SECRET bearer — same gate as other /api/cron
 * routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import {
  runZendeskTicketWatch,
  type ZendeskTicketWatchResult,
} from '@/lib/jobs/zendesk-ticket-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function emptyTotals(): ZendeskTicketWatchResult {
  return { checked: 0, changed: 0, notified: 0, skipped: 0, errors: 0 };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const limit = clampInt(req.nextUrl.searchParams.get('limit'), 100, 1, 500);
  const totals = emptyTotals();
  let orgs = 0;

  try {
    const locked = await withCronLock('zendesk-ticket-watch', () =>
      withCronRun('zendesk-ticket-watch', async () => {
        const perOrg = await forEachOrgWithProvider(
          'zendesk',
          (orgId) => runZendeskTicketWatch(orgId, { limit }),
        );
        for (const r of perOrg) {
          orgs += 1;
          if (!r.ok || !r.result) continue;
          totals.checked += r.result.checked;
          totals.changed += r.result.changed;
          totals.notified += r.result.notified;
          totals.skipped += r.result.skipped;
          totals.errors += r.result.errors;
        }
        return { orgs, ...totals };
      }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'ticket-watch failed',
        orgs,
        ...totals,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, orgs, ...totals });
}
