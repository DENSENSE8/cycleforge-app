import { db } from '@/lib/drizzle/db';
import { aiChatSessions, aiChatMessages } from '@/lib/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { fallbackTitle } from '@/lib/ai/session-title-text';

/**
 * Ensure a session row exists, then insert one message. Fire-and-forget from
 * the chat route — errors are logged, never thrown.
 *
 * Returns `{ created }` so the route knows this was the FIRST message and can
 * replace the provisional title with an AI summary (see `generateSessionTitle`
 * + {@link setSessionTitle}). The provisional title is a real name derived from
 * the message, never a "New Chat" placeholder.
 */
export async function persistChatMessage(opts: {
  organizationId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: string | null;
  analysis?: unknown;
  error?: boolean;
}): Promise<{ created: boolean }> {
  try {
    // Upsert session (create if first message, update timestamp otherwise)
    const existing = await db
      .select({ id: aiChatSessions.id })
      .from(aiChatSessions)
      .where(eq(aiChatSessions.id, opts.sessionId))
      .limit(1);

    const created = existing.length === 0;
    if (created) {
      await db.insert(aiChatSessions).values({
        organizationId: opts.organizationId,
        id: opts.sessionId,
        title: fallbackTitle(opts.content),
      });
    } else {
      await db
        .update(aiChatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(aiChatSessions.id, opts.sessionId));
    }

    // Insert message
    await db.insert(aiChatMessages).values({
      organizationId: opts.organizationId,
      sessionId: opts.sessionId,
      role: opts.role,
      content: opts.content,
      mode: opts.mode ?? null,
      analysis: opts.analysis ?? null,
      error: opts.error ?? false,
    });
    return { created };
  } catch (err) {
    console.error('[chat-persistence] error:', err instanceof Error ? err.message : String(err));
    return { created: false };
  }
}

/**
 * Overwrite a session's title — the AI summary landing after creation. Scoped
 * to the org so a stray id can never retitle another tenant's thread.
 */
export async function setSessionTitle(
  organizationId: string,
  sessionId: string,
  title: string,
): Promise<void> {
  const next = title.trim();
  if (!next) return;
  try {
    await db
      .update(aiChatSessions)
      .set({ title: next })
      .where(
        and(
          eq(aiChatSessions.id, sessionId),
          eq(aiChatSessions.organizationId, organizationId),
        ),
      );
  } catch (err) {
    console.error('[chat-persistence] setSessionTitle error:', err instanceof Error ? err.message : String(err));
  }
}
