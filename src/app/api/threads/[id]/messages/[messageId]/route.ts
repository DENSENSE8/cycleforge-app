import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadMessageEditBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { editThreadMessage, deleteThreadMessage } from '@/lib/threads/threads';
import pool from '@/lib/db';

/**
 * PATCH  /api/threads/[id]/messages/[messageId] — edit a message body.
 * DELETE /api/threads/[id]/messages/[messageId] — soft-delete a message.
 * Gated by support.thread.manage; the manage grant authorizes moderating any
 * message (canManageAll), and we record the acting staff for the audit trail.
 */
function toId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId, messageId: rawMsg } = await params;
    const threadId = toId(rawId);
    const messageId = toId(rawMsg);
    if (threadId === null || messageId === null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(ThreadMessageEditBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await editThreadMessage({
      orgId: gate.ctx.organizationId,
      threadId,
      messageId,
      body: parsed.body,
      actorStaffId: gate.ctx.user?.staffId ?? null,
      canManageAll: true,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'threads-api',
      action: AUDIT_ACTION.THREAD_MESSAGE_EDIT,
      entityType: AUDIT_ENTITY.ENTITY_THREAD,
      entityId: threadId,
      after: { messageId },
    });

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error('Error in PATCH /api/threads/[id]/messages/[messageId]:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId, messageId: rawMsg } = await params;
    const threadId = toId(rawId);
    const messageId = toId(rawMsg);
    if (threadId === null || messageId === null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const result = await deleteThreadMessage({
      orgId: gate.ctx.organizationId,
      threadId,
      messageId,
      actorStaffId: gate.ctx.user?.staffId ?? null,
      canManageAll: true,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_MESSAGE_DELETE,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
        after: { messageId },
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error: any) {
    console.error('Error in DELETE /api/threads/[id]/messages/[messageId]:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
