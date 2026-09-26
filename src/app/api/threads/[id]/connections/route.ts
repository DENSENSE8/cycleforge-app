import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getThread } from '@/lib/threads/threads';
import { getThreadAssignment } from '@/lib/threads/thread-assignments';
import {
  resolveThreadConnections,
  resolveThreadLinksAsConnections,
} from '@/lib/threads/resolve-thread-connections';

/** GET /api/threads/[id]/connections — the thread's "connecting dots": */
function toId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = toId(rawId);
    if (threadId === null) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const orgId = gate.ctx.organizationId;
    const thread = await getThread(orgId, threadId);
    if (!thread) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    // Derived dots + curated links + owner, resolved independently so any one
    // degrading (e.g. an unresolved order) never fails the whole read.
    const [derived, curated, assignment] = await Promise.all([
      resolveThreadConnections(orgId, { entityType: thread.entityType, entityId: thread.entityId }).catch(() => []),
      resolveThreadLinksAsConnections(orgId, threadId).catch(() => []),
      getThreadAssignment(orgId, threadId).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      connections: [...derived, ...curated],
      assignment,
    });
  } catch (error: any) {
    console.error('Error in GET /api/threads/[id]/connections:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
