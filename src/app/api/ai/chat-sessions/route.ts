import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listAssistantSessions } from '@/lib/assistant/chat-persistence';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * GET /api/ai/chat-sessions?limit=30&before=<cursor>&q=<title search>
 *
 * The signed-in staffer's live threads, newest first — private per staff,
 * never the org's. Keyset-paged: pass the previous page's `nextBefore` as
 * `before`. Response `{ sessions: [{id,title,updatedAt,messageCount}], nextBefore }`.
 * Per-thread writes live on `/api/ai/chat-sessions/[sessionId]`.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const params = req.nextUrl.searchParams;
  const parsed = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  try {
    const page = await listAssistantSessions(ctx.organizationId, ctx.staffId, {
      limit,
      before: params.get('before') ?? undefined,
      q: params.get('q')?.slice(0, 200) ?? undefined,
    });
    return NextResponse.json(page);
  } catch (err) {
    console.error('[chat-sessions] list error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}, { permission: 'assistant.chat' });
