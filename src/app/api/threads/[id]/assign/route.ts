import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadAssignBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { assignThread, unassignThread } from '@/lib/threads/thread-assignments';
import { createStaffMessage } from '@/lib/neon/staff-messages-queries';
import pool from '@/lib/db';

/** POST /api/threads/[id]/assign — set/replace the thread OWNER (one per thread). */
function toId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = toId(rawId);
    if (threadId === null) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(ThreadAssignBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await assignThread({
      orgId: gate.ctx.organizationId,
      threadId,
      assignedStaffId: parsed.assignedStaffId,
      assignedBy: gate.ctx.user?.staffId ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    // Only audit + notify when the owner actually changed — a same-assignee
    // retry / double-click is an idempotent no-op (no duplicate audit or nudge).
    const changed = result.previousStaffId !== parsed.assignedStaffId;
    if (changed) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_ASSIGN,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
        after: { assignedStaffId: parsed.assignedStaffId, reassigned: result.reassigned },
      });
    }

    // Notify the new owner (best-effort). Skip self-assignment + unchanged.
    const senderId = gate.ctx.user?.staffId ?? null;
    if (changed && senderId != null && senderId !== parsed.assignedStaffId) {
      after(async () => {
        try {
          await createStaffMessage({
            organizationId: gate.ctx.organizationId,
            senderId,
            recipientId: parsed.assignedStaffId,
            body: 'You were assigned a conversation thread.',
            kind: 'support_assignment',
            context: { threadId },
          });
        } catch {
          /* nudge is best-effort */
        }
      });
    }

    return NextResponse.json({ success: true, assignment: result.assignment });
  } catch (error: any) {
    console.error('Error in POST /api/threads/[id]/assign:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = toId(rawId);
    if (threadId === null) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const result = await unassignThread(gate.ctx.organizationId, threadId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_UNASSIGN,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
        before: { assignedStaffId: result.previousStaffId },
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error: any) {
    console.error('Error in DELETE /api/threads/[id]/assign:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
