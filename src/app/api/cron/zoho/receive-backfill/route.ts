/**
 * GET /api/cron/zoho/receive-backfill?limit=25
 *
 * The scheduled half of the Zoho purchase-receive push. Since 2026-09-23 the
 * push no longer rides the `mark-received-po` request tail — the floor commits
 * locally and this drain reconciles the provider in bulk, one receive per PO.
 *
 * Why a drain and not a queue: the worklist is DERIVED (locally DONE + Zoho
 * linked + no purchase-receive id), so there is nothing to check out and a run
 * that dies mid-flight self-heals on the next tick. Retry state lives on
 * `receiving_line_zoho` (2026-09-23c) so one permanently-refused PO cannot
 * starve the POs behind it.
 *
 * Fans out per Zoho-connected org; a failing tenant never blocks another. The
 * summary this returns lands verbatim in `cron_runs.summary`, which is what
 * paints the counters in the Automations view and drives the health dot.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { runZohoReceiveBackfill } from '@/lib/zoho/receive-backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * PO groups per org per tick. Each group is one `GET /purchaseorders` plus one
 * `POST /purchasereceives`, and the Zoho limiter spaces dispatches 750 ms
 * apart, so 25 groups is ~40 s of transport — comfortably inside maxDuration
 * even with several orgs.
 */
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
