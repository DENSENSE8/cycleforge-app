/** Cron (every 10 min): the local Support loop per org — draft worker, due follow-up alerts, post-purchase check-ins. */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import { logger } from '@/lib/observability/logger';
import { runOrderCheckInSweep } from '@/lib/support/check-ins/sweep';
import { runSupportFollowUpDueSweep } from '@/lib/support/conversation/follow-up-due';
import { processPendingSupportDrafts } from '@/lib/support/drafts/process';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Totals {
  orgs: number;
  draftsProcessed: number;
  draftsReady: number;
  draftsFailed: number;
  followUpsAlerted: number;
  checkInsProjected: number;
  checkInsOpened: number;
  checkInsFollowUpDue: number;
  errors: number;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();
  const totals: Totals = {
    orgs: 0,
    draftsProcessed: 0,
    draftsReady: 0,
    draftsFailed: 0,
    followUpsAlerted: 0,
    checkInsProjected: 0,
    checkInsOpened: 0,
    checkInsFollowUpDue: 0,
    errors: 0,
  };

  try {
    const locked = await withCronLock('support-loop', () =>
      withCronRun('support-loop', async () => {
        // Explicit per-org loop: every sweep takes the org id it runs for.
        for (const orgId of await listSweepOrgIds()) {
          totals.orgs += 1;
          const nowMs = Date.now();
          // Check-ins first so a newly due check-in's task is in the follow-up sweep.
          const steps: Array<[string, () => Promise<void>]> = [
            ['check-ins', async () => {
              const r = await runOrderCheckInSweep(orgId, nowMs);
              totals.checkInsProjected += r.projected;
              totals.checkInsOpened += r.opened;
              totals.checkInsFollowUpDue += r.followUpDue;
            }],
            ['follow-ups', async () => {
              totals.followUpsAlerted += (await runSupportFollowUpDueSweep(orgId, nowMs)).alerted;
            }],
            ['drafts', async () => {
              const r = await processPendingSupportDrafts(orgId);
              totals.draftsProcessed += r.processed;
              totals.draftsReady += r.ready;
              totals.draftsFailed += r.failed;
            }],
          ];
          for (const [step, run] of steps) {
            try {
              await run();
            } catch (error) {
              totals.errors += 1;
              logger.error({ orgId, step, error: String(error) }, 'support loop cron step failed');
            }
          }
        }
        return totals;
      }),
    );
    if (!locked.ran) return NextResponse.json({ ok: true, skipped: 'locked' });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'support loop failed', ...totals },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ...totals });
}
