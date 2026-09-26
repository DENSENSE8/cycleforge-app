import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withCronRun } from '@/lib/cron/run-log';
import { runReplenishmentSync } from '@/lib/replenishment';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST /api/replenishment/sync */
export const POST = withAuth(async (_req, ctx) => {
  await withCronRun('replenishment.sync', async () => {
    await runReplenishmentSync(ctx.organizationId);
    return { ok: true };
  }, { trigger: 'manual' });
  return NextResponse.json({ ok: true });
}, { permission: 'replenish.create_po' });
