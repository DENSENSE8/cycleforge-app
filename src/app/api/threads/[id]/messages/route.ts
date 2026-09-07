import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadMessagePostBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { listThreadMessages, postThreadMessage } from '@/lib/threads/threads';
import { publishDbEvent } from '@/lib/realtime/db-events';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * Tenant scoping: listThreadMessages / postThreadMessage run inside their own
 * tenant transactions (GUC + org conjuncts); the audit write below runs under
 * withTenantTransaction too, so every statement the route issues is
 * app.current_org-scoped.
 */

/**
 * GET /api/threads/[id]/messages?limit&before — ascending page of messages
 * (keyset: `before` = message id, returns strictly older rows).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = Number(rawId);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || 50);
    const beforeRaw = searchParams.get('before');
    const beforeId = beforeRaw ? Number(beforeRaw) : null;
    if (beforeId != null && (!Number.isFinite(beforeId) || beforeId <= 0)) {
      return NextResponse.json({ success: false, error: 'Invalid before cursor' }, { status: 400 });
    }

    const result = await listThreadMessages({
      orgId: gate.ctx.organizationId,
      threadId,
      limit: Number.isFinite(limit) ? limit : 50,
      beforeId,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, messages: result.messages });
  } catch (error: any) {
    console.error('Error in GET /api/threads/[id]/messages:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}

/**
 * POST /api/threads/[id]/messages — post a message. Idempotent on
 * clientEventId (a flaky-network retry returns the original message with
 * `idempotent: true` and fires no second side-effect).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'support.thread.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const threadId = Number(rawId);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid thread id' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(ThreadMessagePostBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const result = await postThreadMessage({
      orgId,
      threadId,
      authorStaffId: gate.ctx.staffId ?? null,
      provider: 'internal',
      visibility: parsed.visibility,
      body: parsed.body,
      clientEventId: parsed.clientEventId ?? safeRandomUUID(),
      meta: parsed.meta ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      await withTenantTransaction(gate.ctx.organizationId, (client) =>
        recordAudit(client, gate.ctx, req, {
          source: 'threads-api',
          action: AUDIT_ACTION.THREAD_MESSAGE_POST,
          entityType: AUDIT_ENTITY.ENTITY_THREAD,
          entityId: threadId,
          after: { messageId: result.message.id, visibility: result.message.visibility },
        }),
      );

      // Best-effort realtime nudge so open panels refetch — never blocks the response.
      const message = result.message;
      after(async () => {
        try {
          await publishDbEvent({
            orgId,
            id: `thread-message:${message.id}`,
            schema: 'public',
            table: 'thread_messages',
            pk: { id: message.id },
            op: 'INSERT',
            actorStaffId: message.authorStaffId,
            payload: { thread_id: threadId },
            needsRefetch: true,
          });
        } catch (err) {
          console.warn('[threads] realtime publish failed (non-fatal):', err);
        }
      });
    }

    return NextResponse.json(
      { success: true, message: result.message, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error: any) {
    console.error('Error in POST /api/threads/[id]/messages:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
