/**
 * POST /api/receiving/[id]/acknowledge-unbox
 *
 * Set-once "Unboxed" acknowledgement for a CARTON that has no receiving_line
 * rows yet (an unmatched / lineless carton — "PO ITEMS · 0"). The line-scoped
 * condition PATCH routes stamp the milestone via a line's receiving_id, but a
 * lineless carton has no line to hang that on, so its "operator opened & graded
 * it" acknowledgement comes through here. Idempotent: `acknowledgeUnbox` →
 * `upsertReceivingUnbox` is COALESCE-once, so repeated calls never re-stamp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
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
        await invalidateCacheTags(['receiving-lines', 'receiving-logs']);
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
