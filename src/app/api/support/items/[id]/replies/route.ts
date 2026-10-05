/** `POST /api/support/items/[id]/replies` — Send (connected transport) | Copy & open | Log a reply, then answers + follow-up + next step. */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportReplySchema } from '@/lib/schemas/support-items';
import { readSupportItemBundle } from '@/lib/support/conversation/bundle';
import { recordSupportReply } from '@/lib/support/conversation/reply';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const parsed = parseBody(SupportReplySchema, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const { organizationId: orgId, staffId } = gate.ctx;

    const r = await recordSupportReply({
      orgId,
      supportItemId: id,
      staffId,
      action: parsed.action,
      body: parsed.body,
      answersMessageIds: parsed.answersMessageIds,
      draftId: parsed.draftId ?? null,
      contactChannel: parsed.contactChannel,
      nextStep: parsed.nextStep ?? null,
      clientEventId: parsed.clientEventId,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    if (!r.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'support-api',
        action: AUDIT_ACTION.SUPPORT_REPLY,
        entityType: AUDIT_ENTITY.SUPPORT_TICKET,
        entityId: id,
        after: {
          action: parsed.action,
          messageId: r.messageId,
          deliveryState: r.deliveryState,
          answeredMessageIds: r.answeredMessageIds,
          followUpId: r.followUpId,
          draftId: parsed.draftId ?? null,
          nextStep: parsed.nextStep?.kind ?? null,
          policyChanges: r.policyChanges,
          sendError: r.sendError,
        },
      });
    }
    const bundle = await readSupportItemBundle(orgId, id);
    const payload = {
      messageId: r.messageId,
      deliveryState: r.deliveryState,
      answeredMessageIds: r.answeredMessageIds,
      followUpId: r.followUpId,
      idempotent: r.idempotent,
      policyChanges: r.policyChanges,
      resolveBlockers: r.resolve && !r.resolve.ok && 'blockers' in r.resolve ? r.resolve.blockers : [],
      item: bundle?.item ?? null,
    };
    // The provider refused: the row is stored `failed` (a resolve blocker) — say so loudly.
    if (r.deliveryState === 'failed') return NextResponse.json({ ...payload, error: r.sendError }, { status: 502 });
    return NextResponse.json(payload, { status: r.idempotent ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, 'POST /api/support/items/[id]/replies');
  }
}
