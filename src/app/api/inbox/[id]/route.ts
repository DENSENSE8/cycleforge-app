/**
 * PATCH /api/inbox/[id] — triage one inbox row (read / unread / done / snooze).
 *
 * Scoped to `ctx.staffId` inside the UPDATE's WHERE clause, so a guessed id
 * belonging to another staffer simply matches zero rows → 404. "Not found" and
 * "not yours" are deliberately indistinguishable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { isHomeInbox } from '@/lib/feature-flags';
import { triageInboxItem } from '@/lib/notifications/inbox';

export const dynamic = 'force-dynamic';

const TriageBody = z.object({
  action: z.enum(['read', 'unread', 'done', 'snooze']),
  /** Snooze duration; the default (24h) is the Linear/GitHub convention. */
  snoozeHours: z.number().int().min(1).max(720).optional(),
});

/** withAuth doesn't forward Next's params — resolve [id] from the path. */
function itemIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 1]);
}

export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const itemId = itemIdFromPath(req.nextUrl.pathname);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const parsed = TriageBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const outcome = await triageInboxItem({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      itemId,
      action: parsed.data.action,
      snoozeHours: parsed.data.snoozeHours,
      permissions: [...ctx.permissions],
    });

    if (outcome === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (outcome === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await recordAudit(pool, ctx, req, {
      source: 'home-inbox',
      action: AUDIT_ACTION.INBOX_TRIAGE,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: String(ctx.staffId),
      extra: { inboxItemId: itemId, triage: parsed.data.action },
    });
    ctx.markAuditWritten();

    return NextResponse.json({ ok: true });
  },
  { permission: 'home.inbox.view' },
);
