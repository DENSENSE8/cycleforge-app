/** /api/my-day/watch — Today Watch rail. Tracking watches are written here; ticket ownership is the Support item's task assignees (PATCH /api/tasks/[id]), listed read-only. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { isHomeInbox } from '@/lib/feature-flags';
import { listSupportFollowupsForStaff } from '@/lib/inbox/support-followups-queries';
import { listReceivingWatchesForStaff } from '@/lib/notifications/subscriptions';
import { setTrackingWatch } from '@/lib/notifications/tracking-watch';

export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.literal('tracking'),
  value: z.string().trim().min(1).max(128),
  clientEventId: z.string().uuid().optional(),
  /**
   * Tracking only. `muted` is the operator's "Stop" — one verb for both arms,
   * because "stop watching this number" is one act to them even though it can
   * touch an entity row, a pre-arrival rule row, or both.
   */
  desired: z.enum(['subscribed', 'muted']).optional(),
});

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const context = 'GET /api/my-day/watch';
  try {
    const tickets = ctx.permissions.has('integrations.zendesk')
      ? (await listSupportFollowupsForStaff(ctx.organizationId, ctx.staffId)).map((row) => ({
          ticketId: row.ticketId,
          taskId: row.taskId,
          subject: row.subject,
          updatedAtMs: row.updatedAtMs,
        }))
      : [];

    let tracking: Array<{
      receivingId: number | null;
      tracking: string | null;
      preArrival: boolean;
      updatedAtMs: number;
    }> = [];
    if (
      ctx.permissions.has('home.subscriptions.manage') &&
      (await isHomeInbox(ctx.organizationId))
    ) {
      tracking = await listReceivingWatchesForStaff({
        orgId: ctx.organizationId,
        staffId: ctx.staffId,
      });
    }

    return NextResponse.json({ ok: true, tickets, tracking });
  } catch (err) {
    return errorResponse(err, context);
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const context = 'POST /api/my-day/watch';
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { value, clientEventId, desired = 'subscribed' } = parsed.data;

    if (!ctx.permissions.has('home.subscriptions.manage')) {
      throw new ApiError(403, 'Subscription permission required to watch tracking');
    }
    // Flag off → 404, not 403: match /api/subscriptions/toggle.
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const watch = await setTrackingWatch({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      permissions: [...ctx.permissions],
      value,
      desired,
      clientEventId: clientEventId ?? null,
    });

    await recordAudit(pool, ctx, req, {
      source: 'my-day-watch',
      action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: String(ctx.staffId),
      extra:
        watch.kind === 'stopped'
          ? { kind: 'tracking', tracking: watch.tracking, desired: 'muted' }
          : watch.kind === 'pre_arrival'
            ? { kind: 'tracking', tracking: watch.tracking, preArrival: true }
            : { kind: 'tracking', tracking: watch.tracking, receivingId: watch.receivingId, shipmentId: watch.shipmentId },
    });
    ctx.markAuditWritten();

    if (watch.kind === 'stopped') {
      return NextResponse.json({ ok: true, kind: 'tracking', tracking: watch.tracking, stopped: watch.stopped });
    }
    if (watch.kind === 'pre_arrival') {
      return NextResponse.json({
        ok: true,
        kind: 'tracking',
        tracking: watch.tracking,
        preArrival: true,
        alreadyWatching: !watch.created,
      });
    }
    return NextResponse.json({
      ok: true,
      kind: 'tracking',
      tracking: watch.tracking,
      receivingId: watch.receivingId,
      shipmentId: watch.shipmentId,
      subscription: watch.subscription,
    });
  } catch (err) {
    return errorResponse(err, context);
  }
});
