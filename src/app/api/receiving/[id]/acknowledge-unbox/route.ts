/** POST /api/receiving/[id]/acknowledge-unbox */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQueryOneTrip, withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { acknowledgeUnbox } from '@/lib/receiving/acknowledge-unbox';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid receiving id' }, { status: 400 });
    }

    // Fired on every page load of an open carton. When the stamp is already
    // complete the set-once upsert below would change nothing but updated_at, so
    // answer from one read and skip the write and its cache/realtime fan-out.
    // The predicate mirrors upsertReceivingUnbox's conflict arm for this patch:
    // unboxed_at / unboxed_by are COALESCE-once, intake_path keeps a derived value.
    const staffId = ctx.staffId ?? null;
    const done = await tenantQueryOneTrip(
      ctx.organizationId,
      `SELECT 1 FROM receiving_unbox
        WHERE receiving_id = $1 AND organization_id = $2
          AND unboxed_at IS NOT NULL
          AND ${staffId == null ? 'TRUE' : 'unboxed_by IS NOT NULL'}
          AND intake_path IN ('unbox_only', 'triage_first')
        LIMIT 1`,
      [receivingId, ctx.organizationId],
    );
    if (done.rows.length > 0) {
      return NextResponse.json({ success: true });
    }

    await withTenantTransaction(ctx.organizationId, (client) =>
      acknowledgeUnbox(client, ctx.organizationId, receivingId, staffId),
    );

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.acknowledge-unbox',
        });
      } catch (err) {
        console.warn('acknowledge-unbox: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true });
  },
  { permission: 'receiving.mark_received' },
);
