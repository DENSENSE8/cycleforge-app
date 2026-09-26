/** POST /api/receiving/[id]/contents-confirm */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { confirmContents } from '@/lib/receiving/confirm-contents';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid receiving id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirmed?: unknown };
    if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') {
      return NextResponse.json({ success: false, error: 'confirmed must be a boolean' }, { status: 400 });
    }
    const confirmed = body.confirmed !== false;

    await withTenantTransaction(ctx.organizationId, (client) =>
      confirmContents(client, {
        orgId: ctx.organizationId,
        receivingId,
        staffId: ctx.staffId ?? null,
        confirmed,
      }),
    );

    await recordAudit(pool, ctx, request, {
      source: 'receiving.contents-confirm',
      action: confirmed
        ? AUDIT_ACTION.RECEIVING_CONTENTS_CONFIRMED
        : AUDIT_ACTION.RECEIVING_CONTENTS_REOPENED,
      entityType: AUDIT_ENTITY.RECEIVING,
      entityId: receivingId,
      after: { contents_confirmed: confirmed },
      method: 'manual',
    });

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.contents-confirm',
        });
      } catch (err) {
        console.warn('contents-confirm: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true, confirmed });
  },
  { permission: 'receiving.mark_received' },
);
