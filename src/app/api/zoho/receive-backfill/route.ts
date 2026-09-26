/** Manual half of the Zoho purchase-receive backfill — the Backfill button on the Zoho connection (Settings → Integrations). */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getReceiveBacklog, runZohoReceiveBackfill } from '@/lib/zoho/receive-backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Groups per click. */
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
    const report = await runZohoReceiveBackfill(ctx.organizationId, {
      maxGroups: MANUAL_MAX_GROUPS,
    });
    return NextResponse.json({ success: true, ...report });
  },
  { permission: 'integrations.zoho' },
);
