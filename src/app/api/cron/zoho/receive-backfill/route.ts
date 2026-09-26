/** GET /api/cron/zoho/receive-backfill?limit=25 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { runZohoReceiveBackfill } from '@/lib/zoho/receive-backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** PO groups per org per tick. */
const DEFAULT_MAX_GROUPS = 25;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const limitRaw = Number(req.nextUrl.searchParams.get('limit'));
  const maxGroups =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : DEFAULT_MAX_GROUPS;

  try {
    const locked = await withCronLock('zoho.receive_backfill', () =>
      withCronRun('zoho.receive_backfill', async () => {
        const perOrg = await forEachOrgWithProvider('zoho', (orgId) =>
          runZohoReceiveBackfill(orgId, { maxGroups }),
        );

        // Flat numeric counters at the top level: the Automations view reads
        // run counters generically off any numeric field in `summary`.
        let groups = 0;
        let posted = 0;
        let noop = 0;
        let failed = 0;
        let lines = 0;
        let settledFromMirror = 0;
        let pending = 0;
        let disconnected = 0;
        const errors: Array<{ orgId: string; zohoPurchaseOrderId?: string; error: string }> = [];

        for (const run of perOrg) {
          if (!run.ok) {
            errors.push({
              orgId: run.orgId,
              error: run.error instanceof Error ? run.error.message : String(run.error),
            });
            continue;
          }
          const r = run.result!;
          groups += r.groups;
          posted += r.posted;
          noop += r.noop;
          failed += r.failed;
          lines += r.lines;
          settledFromMirror += r.settledFromMirror;
          pending += r.pendingAfter;
          if (r.notConnected) disconnected += 1;
          for (const e of r.errors) {
            errors.push({ orgId: run.orgId, zohoPurchaseOrderId: e.zohoPurchaseOrderId, error: e.error });
          }
        }

        return {
          orgs: perOrg.length,
          groups,
          posted,
          noop,
          failed,
          lines,
          settled_from_mirror: settledFromMirror,
          pending,
          // Not rolled into `failed`: a disconnected tenant needs an operator
          // to re-authorize, not an engineer to read a stack trace.
          disconnected,
          ...(errors.length > 0 ? { errors: errors.slice(0, 25) } : {}),
        };
      }),
    );

    if (!locked.ran) return NextResponse.json({ ok: true, skipped: 'locked' });
    return NextResponse.json({ ok: true, ...locked.result! });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'receive-backfill failed';
    console.error('[cron/zoho/receive-backfill]', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
