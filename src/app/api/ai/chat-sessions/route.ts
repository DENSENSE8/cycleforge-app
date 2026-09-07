import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/drizzle/db';
import { aiChatSessions, aiChatMessages } from '@/lib/drizzle/schema';
import { desc, eq, and, count, isNull, sql } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/withAuth';

export const runtime = 'nodejs';

/**
 * GET /api/ai/chat-sessions — list recent sessions (sidebar)
 * Returns the 30 most recent sessions with message count and preview.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    // db is neon-HTTP on the owner DSN (BYPASSRLS, no app.current_org GUC): the
    // organization_id predicate is the only isolation on these transcripts.
    const sessions = await db
      .select({
        id: aiChatSessions.id,
        title: aiChatSessions.title,
        createdAt: aiChatSessions.createdAt,
        updatedAt: aiChatSessions.updatedAt,
        messageCount: count(aiChatMessages.id),
      })
      .from(aiChatSessions)
      .leftJoin(
        aiChatMessages,
        and(
          eq(aiChatSessions.id, aiChatMessages.sessionId),
          eq(aiChatMessages.organizationId, ctx.organizationId),
        ),
      )
      .where(and(eq(aiChatSessions.organizationId, ctx.organizationId), isNull(aiChatSessions.deletedAt)))
      .groupBy(aiChatSessions.id)
      .orderBy(desc(aiChatSessions.updatedAt))
      .limit(30);

    return NextResponse.json({ sessions });
  } catch (err: any) {
    console.error('[chat-sessions] list error:', err?.message);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}, { permission: 'dashboard.view', feature: 'aiChat' });

/**
 * DELETE /api/ai/chat-sessions?id=<sessionId> — delete a session
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const sessionId = req.nextUrl.searchParams.get('id');
    if (!sessionId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    // Soft-delete (recoverable): the canonical path is DELETE
    // /api/ai/chat-sessions/[sessionId]; this query-param form stays for
    // existing callers but now archives rather than destroying the transcript.
    await db
      .update(aiChatSessions)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.organizationId, ctx.organizationId)));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[chat-sessions] delete error:', err?.message);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}, { permission: 'dashboard.view', feature: 'aiChat' });
