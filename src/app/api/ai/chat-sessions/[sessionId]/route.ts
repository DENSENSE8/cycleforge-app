import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';
import { aiChatSessions } from '@/lib/drizzle/schema';
import { withAuth } from '@/lib/auth/withAuth';

export const runtime = 'nodejs';

/**
 * The session id is the last path segment. Parsed from the URL (not the Next
 * `params` arg) so the handler composes cleanly under `withAuth(req, ctx)` —
 * the same shape `/api/studio/templates/[id]/import` uses.
 */
function sessionIdFromReq(req: NextRequest): string | null {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  return id && id !== 'chat-sessions' ? decodeURIComponent(id) : null;
}

/**
 * PATCH /api/ai/chat-sessions/[sessionId] — rename or restore a session.
 *
 * Body `{ title }` renames. Tenant-scoped; a soft-deleted session cannot be
 * renamed (the `deleted_at IS NULL` conjunct also makes a stale id a clean
 * 404). The rename does NOT bump `updated_at` — renaming is not activity, so
 * the row keeps its place in the recent list.
 *
 * Body `{ restore: true }` clears `deleted_at`, the undo half of the
 * soft-delete: the promise the delete toast makes has to be a real write, or
 * the recovery affordance is a lie. Tenant-scoped and idempotent — restoring a
 * live session is an `ok` no-op; an unknown id is a 404. `updated_at` is left
 * alone so an undone delete lands back where the thread already sat.
 */
export const PATCH = withAuth(
  async (req: NextRequest, ctx) => {
    const sessionId = sessionIdFromReq(req);
    if (!sessionId) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    let body: { title?: unknown; restore?: unknown };
    try {
      body = (await req.json()) as { title?: unknown; restore?: unknown };
    } catch {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 });
    }

    if (body.restore === true) {
      try {
        const rows = await db
          .update(aiChatSessions)
          .set({ deletedAt: null })
          .where(
            and(
              eq(aiChatSessions.id, sessionId),
              eq(aiChatSessions.organizationId, ctx.organizationId),
            ),
          )
          .returning({ id: aiChatSessions.id, title: aiChatSessions.title });
        if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
        return NextResponse.json({ ok: true, session: rows[0] });
      } catch (err) {
        console.error('[chat-sessions] restore error:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Failed to restore session' }, { status: 500 });
      }
    }

    const trimmed = typeof body.title === 'string' ? body.title.trim() : '';
    if (!trimmed) return NextResponse.json({ error: 'title is required' }, { status: 400 });
    const title = trimmed.slice(0, 200);

    try {
      const rows = await db
        .update(aiChatSessions)
        .set({ title })
        .where(
          and(
            eq(aiChatSessions.id, sessionId),
            eq(aiChatSessions.organizationId, ctx.organizationId),
            isNull(aiChatSessions.deletedAt),
          ),
        )
        .returning({ id: aiChatSessions.id, title: aiChatSessions.title });
      if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json({ ok: true, session: rows[0] });
    } catch (err) {
      console.error('[chat-sessions] rename error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'Failed to rename session' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view', feature: 'aiChat' },
);

/**
 * DELETE /api/ai/chat-sessions/[sessionId] — recoverable soft-delete.
 *
 * Sets `deleted_at`; the row leaves every list but stays restorable through
 * `PATCH { restore: true }`. NO purge job exists today, so nothing here — and
 * nothing in the UI — may promise a retention window: an unenforced number of
 * days is a promise the product cannot keep. Tenant-scoped and idempotent —
 * deleting an already-deleted or unknown id is a no-op `ok`.
 */
export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    const sessionId = sessionIdFromReq(req);
    if (!sessionId) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    try {
      await db
        .update(aiChatSessions)
        .set({ deletedAt: sql`now()` })
        .where(
          and(
            eq(aiChatSessions.id, sessionId),
            eq(aiChatSessions.organizationId, ctx.organizationId),
            isNull(aiChatSessions.deletedAt),
          ),
        );
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('[chat-sessions] soft-delete error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
  },
  { permission: 'dashboard.view', feature: 'aiChat' },
);
