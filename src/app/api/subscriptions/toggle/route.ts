/** POST /api/subscriptions/toggle — follow / mute one entity. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { isHomeInbox } from '@/lib/feature-flags';
import {
  getEntitySubscription,
  toggleEntitySubscription,
} from '@/lib/notifications/subscriptions';
import { NOTIFIABLE_ENTITY_TYPES } from '@/lib/notifications/event-vocabulary';

export const dynamic = 'force-dynamic';

const ToggleBody = z.object({
  entityType: z.enum(NOTIFIABLE_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  /** Omit to flip the current state; send explicitly for an idempotent set. */
  desired: z.enum(['subscribed', 'muted']).optional(),
  clientEventId: z.string().uuid().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    // Flag off → 404, not 403: an un-enabled surface should be indistinguishable
    // from one that does not exist.
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = ToggleBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const result = await toggleEntitySubscription({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType: body.entityType,
      entityId: body.entityId,
      desired: body.desired,
      permissions: [...ctx.permissions],
      clientEventId: body.clientEventId ?? null,
    });

    if (result.outcome === 'invalid_entity') {
      return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 });
    }
    // You cannot follow what you cannot open. 403 (not 404) because the entity
    // type itself is public vocabulary — only your access to it is the gate.
    if (result.outcome === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await recordAudit(pool, ctx, req, {
      source: 'home-inbox',
      action: AUDIT_ACTION.SUBSCRIPTION_TOGGLE,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: String(ctx.staffId),
      extra: {
        targetEntityType: body.entityType,
        targetEntityId: body.entityId,
        outcome: result.outcome,
      },
    });
    ctx.markAuditWritten();

    return NextResponse.json({ ok: true, ...result });
  },
  { permission: 'home.subscriptions.manage' },
);

/**
 * GET /api/subscriptions/toggle?entityType=receiving&entityId=123 — the bell's
 * current state for one entity. Read-only, so it is gated on the view
 * permission rather than the manage one.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const entityType = req.nextUrl.searchParams.get('entityType') ?? '';
    const entityId = Number(req.nextUrl.searchParams.get('entityId'));
    if (!Number.isFinite(entityId) || entityId <= 0) {
      return NextResponse.json({ error: 'Invalid entityId' }, { status: 400 });
    }

    const subscription = await getEntitySubscription({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType,
      entityId,
    });

    return NextResponse.json({ subscription });
  },
  { permission: 'home.inbox.view' },
);
