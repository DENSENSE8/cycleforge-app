import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadStatusPatchBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { updateThreadStatus, softDeleteThread } from '@/lib/threads/threads';
import pool from '@/lib/db';

/** PATCH /api/threads/[id] — update thread status (open | snoozed | resolved). */
function parseThreadId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = parseThreadId(rawId);
    if (threadId === null) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(ThreadStatusPatchBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await updateThreadStatus({
      orgId: gate.ctx.organizationId,
      threadId,
      status: parsed.status,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'threads-api',
      action: AUDIT_ACTION.THREAD_STATUS_UPDATE,
      entityType: AUDIT_ENTITY.ENTITY_THREAD,
      entityId: threadId,
      after: { status: parsed.status },
    });

    return NextResponse.json({ success: true, thread: result.thread });
  } catch (error: any) {
    console.error('Error in PATCH /api/threads/[id]:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = parseThreadId(rawId);
    if (threadId === null) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const result = await softDeleteThread(gate.ctx.organizationId, threadId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_DELETE,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error: any) {
    console.error('Error in DELETE /api/threads/[id]:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
