/** POST /api/receiving/[id]/acknowledge-unbox */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
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

    await withTenantTransaction(ctx.organizationId, (client) =>
      acknowledgeUnbox(client, ctx.organizationId, receivingId, ctx.staffId ?? null),
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
