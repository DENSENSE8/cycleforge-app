import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import {
  SESSION_ID_RE,
  SESSION_TITLE_MAX,
  getAssistantSession,
  renameAssistantSession,
  restoreAssistantSession,
  softDeleteAssistantSession,
} from '@/lib/assistant/chat-persistence';

export const runtime = 'nodejs';

type Params = { params: Promise<{ sessionId: string }> };

/**
 * One chat thread of the signed-in staffer. Every verb is org + staff scoped:
 * a foreign, legacy (org-shared) or deleted id answers 404 — never 403 — so
 * session ids do not leak across staff.
 */
const NOT_FOUND = () => NextResponse.json({ error: 'Session not found' }, { status: 404 });

/** GET — the thread and its live messages in one round trip (reopen / resume). */
export async function GET(req: NextRequest, { params }: Params) {
  const gate = await requireRoutePerm(req, 'assistant.chat');
  if (gate.denied) return gate.denied;
  const { sessionId } = await params;
  if (!SESSION_ID_RE.test(sessionId)) return NOT_FOUND();
  try {
    const thread = await getAssistantSession(gate.ctx.organizationId, gate.ctx.staffId, sessionId);
    return thread ? NextResponse.json(thread) : NOT_FOUND();
  } catch (err) {
    console.error('[chat-sessions] load error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
  }
}

const PatchSchema = z.union([
  z.object({ restore: z.literal(true) }).strict(),
  z.object({ title: z.string().trim().min(1).max(SESSION_TITLE_MAX) }).strict(),
]);

/**
 * PATCH — `{ title }` renames a live thread (does not bump `updated_at`:
 * renaming is not activity); `{ restore: true }` undoes a soft delete.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireRoutePerm(req, 'assistant.chat');
  if (gate.denied) return gate.denied;
  const { sessionId } = await params;
  if (!SESSION_ID_RE.test(sessionId)) return NOT_FOUND();
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Expected { title } or { restore: true }' }, { status: 400 });
  }
  const { organizationId, staffId } = gate.ctx;
  try {
    const ok =
      'restore' in body.data
        ? await restoreAssistantSession(organizationId, staffId, sessionId)
        : await renameAssistantSession(organizationId, staffId, sessionId, body.data.title);
    return ok ? NextResponse.json({ ok: true }) : NOT_FOUND();
  } catch (err) {
    console.error('[chat-sessions] patch error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

/**
 * DELETE — recoverable soft delete (`PATCH { restore: true }` undoes it). No
 * purge job exists, so nothing may promise a retention window.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const gate = await requireRoutePerm(req, 'assistant.chat');
  if (gate.denied) return gate.denied;
  const { sessionId } = await params;
  if (!SESSION_ID_RE.test(sessionId)) return NOT_FOUND();
  try {
    const ok = await softDeleteAssistantSession(gate.ctx.organizationId, gate.ctx.staffId, sessionId);
    return ok ? NextResponse.json({ ok: true }) : NOT_FOUND();
  } catch (err) {
    console.error('[chat-sessions] delete error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
