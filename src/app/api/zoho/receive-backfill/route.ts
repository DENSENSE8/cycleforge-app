/**
 * Manual half of the Zoho purchase-receive backfill — the Backfill button on
 * the Zoho connection (Settings → Integrations).
 *
 *   GET  → backlog readout. Poll this while a run is in flight: the progress
 *          bar IS `pending` falling, because the worklist is derived rather
 *          than a queue, so there is no separate progress channel that could
 *          disagree with the work actually left.
 *   POST → drain now for the caller's org. A cadence override, not a fork:
 *          same `runZohoReceiveBackfill` the cron calls.
 *
 * Org comes from the auth context, never the body. No audit row: this pushes
 * no new local state — it reconciles rows the floor already committed, and the
 * provider-side record is the purchase receive itself.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getReceiveBacklog, runZohoReceiveBackfill } from '@/lib/zoho/receive-backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Groups per click. Each is a PO round-trip behind a 750 ms dispatch floor, so
 * this is the largest batch that reliably finishes inside maxDuration. A deeper
 * backlog needs a second click (or the cron) — which the returned `pending`
 * makes obvious rather than hiding behind a timeout.
 */
const MANUAL_MAX_GROUPS = 40;

export const GET = withAuth(
  async (_req, ctx) => {
    const backlog = await getReceiveBacklog(ctx.organizationId);
    return NextResponse.json({ success: true, ...backlog });
  },
  { permission: 'integrations.zoho' },
);

export const POST = withAuth(
  async (_req, ctx) => {
    try {
      const report = await runZohoReceiveBackfill(ctx.organizationId, {
        maxGroups: MANUAL_MAX_GROUPS,
      });
      return NextResponse.json({ success: true, ...report });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'backfill failed';
      console.error('[zoho/receive-backfill] manual run failed', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'integrations.zoho' },
);
