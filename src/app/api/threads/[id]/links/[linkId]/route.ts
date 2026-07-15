import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { unlinkThreadEntity } from '@/lib/threads/thread-links';
import pool from '@/lib/db';

/**
 * DELETE /api/threads/[id]/links/[linkId] — remove a curated connection.
 * Idempotent; support.thread.manage.
 */
function toId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId, linkId: rawLink } = await params;
    const threadId = toId(rawId);
    const linkId = toId(rawLink);
    if (threadId === null || linkId === null) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const result = await unlinkThreadEntity(gate.ctx.organizationId, threadId, linkId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_UNLINK,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
        before: { linkId },
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error: any) {
    console.error('Error in DELETE /api/threads/[id]/links/[linkId]:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
