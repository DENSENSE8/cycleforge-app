/** GET /api/cron/receiving/incoming-tracking-sync (Vercel cron, every 15 min) */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { selectIncomingShipmentIds } from '@/lib/receiving/incoming-shipments';
import { syncShipmentsByIds } from '@/lib/shipping/scheduler';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH_CAP = 250;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('receiving.incoming_tracking', () =>
      withCronRun('receiving.incoming_tracking', async () => {
        const rows = await selectIncomingShipmentIds(BATCH_CAP);
        const capped = rows.length > BATCH_CAP;
        const batch = rows.slice(0, BATCH_CAP);
        const result = await syncShipmentsByIds(batch, { concurrency: 5 });

        if (result.terminal > 0 || result.synced > 0) {
          try {
            await invalidateReceivingViews(null);
          } catch {
            /* non-fatal */
          }
        }

        return {
          scanned: batch.length,
          delivered: result.terminal,
          updated: result.synced,
          errors: result.errors,
          capped,
        };
      }),
    );

    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
    const summary = locked.result!;
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'incoming tracking sync failed';
    console.error('[cron.receiving.incoming-tracking-sync] fatal', { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
