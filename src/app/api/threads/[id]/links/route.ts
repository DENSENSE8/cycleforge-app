import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ThreadLinkBody } from '@/lib/schemas/threads';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { listThreadLinks, linkThreadEntity } from '@/lib/threads/thread-links';
import pool from '@/lib/db';

/**
 * GET  /api/threads/[id]/links — curated cross-entity connections for a thread.
 * POST /api/threads/[id]/links — add one (validates the target exists in-org).
 * GET = support.thread.view, POST = support.thread.manage.
 */
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

    const links = await listThreadLinks(gate.ctx.organizationId, threadId);
    return NextResponse.json({ success: true, links });
  } catch (error: any) {
    console.error('Error in GET /api/threads/[id]/links:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
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
    const parsed = parseBody(ThreadLinkBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await linkThreadEntity({
      orgId: gate.ctx.organizationId,
      threadId,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      linkRole: parsed.linkRole,
      createdBy: gate.ctx.user?.staffId ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    if (result.created) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'threads-api',
        action: AUDIT_ACTION.THREAD_LINK,
        entityType: AUDIT_ENTITY.ENTITY_THREAD,
        entityId: threadId,
        after: { entityType: parsed.entityType, entityId: parsed.entityId, linkRole: parsed.linkRole },
      });
    }

    return NextResponse.json({ success: true, link: result.link, created: result.created });
  } catch (error: any) {
    console.error('Error in POST /api/threads/[id]/links:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 });
  }
}
