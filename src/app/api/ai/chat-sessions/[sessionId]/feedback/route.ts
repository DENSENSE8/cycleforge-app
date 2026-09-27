import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { CLIENT_MSG_ID_RE, SESSION_ID_RE, setMessageFeedback } from '@/lib/assistant/chat-persistence';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    messageId: z.string().regex(CLIENT_MSG_ID_RE),
    rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
    note: z.string().max(500).optional(),
  })
  .strict();

/**
 * POST /api/ai/chat-sessions/[sessionId]/feedback — thumbs on one answer.
 * Body `{ messageId, rating: 1 | -1 | 0, note? }`; 0 clears. Only a live
 * assistant row of a thread the caller owns; anything else is 404.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const gate = await requireRoutePerm(req, 'assistant.chat');
  if (gate.denied) return gate.denied;
  const { sessionId } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Expected { messageId, rating, note? }' }, { status: 400 });
  }
  if (!SESSION_ID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  try {
    const ok = await setMessageFeedback(
      gate.ctx.organizationId,
      gate.ctx.staffId,
      sessionId,
      body.data.messageId,
      body.data.rating,
      body.data.note,
    );
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Message not found' }, { status: 404 });
  } catch (err) {
    console.error('[chat-sessions] feedback error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
