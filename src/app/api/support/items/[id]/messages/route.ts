/** `POST /api/support/items/[id]/messages` — staff log a pasted customer message or an internal update (through the ingest waist). */

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';

import pool from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { SupportItemMessageSchema } from '@/lib/schemas/support-items';
import { readSupportItemHead } from '@/lib/support/conversation/bundle';
import { ingestSupportMessage, supportIngestDeps } from '@/lib/support/conversation/ingest';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const parsed = parseBody(SupportItemMessageSchema, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const { organizationId: orgId, staffId } = gate.ctx;

    const head = await readSupportItemHead(orgId, id);
    if (!head) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const inbound = parsed.direction === 'inbound' ? parsed : null;
    const result = await ingestSupportMessage(
      {
        orgId,
        source: inbound ? 'manual_paste' : 'staff',
        supportItemId: id,
        channel: inbound?.channel ?? head.channel,
        direction: parsed.direction,
        body: parsed.body,
        occurredAt: inbound?.occurredAt ?? null,
        externalMessageId: inbound?.externalMessageId ?? null,
        authorStaffId: staffId,
        clientEventId: parsed.clientEventId,
        mode: 'live',
      },
      { ...supportIngestDeps, runAfterCommit: (work) => after(work) },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'support-api',
        action: AUDIT_ACTION.SUPPORT_MESSAGE_LOG,
        entityType: AUDIT_ENTITY.SUPPORT_TICKET,
        entityId: id,
        after: {
          direction: parsed.direction,
          messageId: result.messageId,
          taskId: result.taskId,
          reopened: result.reopened,
          createdTask: result.createdTask,
        },
      });
    }
    return NextResponse.json(
      {
        messageId: result.messageId,
        taskId: result.taskId,
        reopened: result.reopened,
        idempotent: result.idempotent,
        alertedStaffIds: result.alertedStaffIds,
        draftId: result.draftId,
      },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error, 'POST /api/support/items/[id]/messages');
  }
}
