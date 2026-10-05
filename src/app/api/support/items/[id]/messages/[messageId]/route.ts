/** `PATCH /api/support/items/[id]/messages/[messageId]` — Mark sent (after Copy & open) | no reply required (staff + reason). */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportMessagePatchSchema } from '@/lib/schemas/support-items';
import { readSupportItemBundle } from '@/lib/support/conversation/bundle';
import { markSupportMessageNoReplyRequired } from '@/lib/support/conversation/item-actions';
import { markSupportReplySent } from '@/lib/support/conversation/reply';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;
    const raw = await params;
    const id = Number(raw.id);
    const messageId = Number(raw.messageId);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(messageId) || messageId <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const parsed = parseBody(SupportMessagePatchSchema, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const { organizationId: orgId, staffId } = gate.ctx;

    if ('delivery' in parsed) {
      const r = await markSupportReplySent({ orgId, supportItemId: id, messageId, staffId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      if (!r.idempotent) {
        await recordAudit(pool, gate.ctx, req, {
          source: 'support-api',
          action: AUDIT_ACTION.SUPPORT_REPLY_MARK_SENT,
          entityType: AUDIT_ENTITY.SUPPORT_TICKET,
          entityId: id,
          after: { messageId, answeredMessageIds: r.answeredMessageIds, followUpId: r.followUpId },
        });
      }
      const bundle = await readSupportItemBundle(orgId, id);
      return NextResponse.json({
        ok: true,
        idempotent: r.idempotent,
        answeredMessageIds: r.answeredMessageIds,
        followUpId: r.followUpId,
        resolveBlockers: r.resolve && !r.resolve.ok ? ('blockers' in r.resolve ? r.resolve.blockers : []) : [],
        item: bundle?.item ?? null,
      });
    }

    const r = await markSupportMessageNoReplyRequired({ orgId, supportItemId: id, messageId, staffId, reason: parsed.reason });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (!r.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'support-api',
        action: AUDIT_ACTION.SUPPORT_MESSAGE_NO_REPLY,
        entityType: AUDIT_ENTITY.SUPPORT_TICKET,
        entityId: id,
        reasonCode: 'SUPPORT_NO_REPLY_REQUIRED',
        note: parsed.reason,
        after: { messageId, pendingInboundCount: r.pendingInboundCount },
      });
    }
    const bundle = await readSupportItemBundle(orgId, id);
    return NextResponse.json({ ok: true, idempotent: r.idempotent, item: bundle?.item ?? null });
  } catch (error) {
    return errorResponse(error, 'PATCH /api/support/items/[id]/messages/[messageId]');
  }
}
