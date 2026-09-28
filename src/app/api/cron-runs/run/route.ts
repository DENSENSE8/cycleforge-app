/** POST /api/cron-runs/run?job=<key> — admin "Run now". */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { CRON_JOB_TRIGGER_PATH } from '@/lib/cron/registry';
import { triggerCronPath } from '@/lib/cron/trigger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = withAuth(
  async (req: NextRequest) => {
    const job = new URL(req.url).searchParams.get('job')?.trim() || '';
    const path = CRON_JOB_TRIGGER_PATH[job];
    if (!path) {
      return NextResponse.json({ ok: false, error: `Unknown or non-triggerable job: ${job}` }, { status: 400 });
    }
    const run = await triggerCronPath(new URL(req.url).origin, path);
    if (run.error) {
      return NextResponse.json({ ok: false, error: run.error }, { status: run.status });
    }
    return NextResponse.json({ ok: run.ok, status: run.status, result: run.result });
  },
  { permission: 'admin.view' },
);
