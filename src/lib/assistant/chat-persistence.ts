/**
 * Assistant chat persistence — org-explicit writes into the existing
 * ai_chat_sessions / ai_chat_messages tables (plan §-2 "AI runtime").
 *
 * Deliberately NOT reusing src/lib/ai/chat-persistence.ts: that helper runs
 * on the global Drizzle client with column-stamped org only. Both tables are
 * in the RLS-FORCEd cohort, so this module goes through tenantQuery (GUC +
 * explicit org) per the house tenancy rules.
 *
 * Fire-and-forget by contract: persistence failures are logged and dropped —
 * a chat turn must never fail because history could not be written.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { fallbackTitle } from '@/lib/ai/session-title';

export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One row of the home surface's thread list — the shape the panel renders. */
export interface AssistantSessionRow {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

/**
 * Recent threads for the signed-in org, newest first.
 *
 * Exists so the home surface can SEED its thread list from the server render
 * instead of firing `/api/ai/chat-sessions` after hydration: that fetch was a
 * post-hydration waterfall on the first screen an operator opens. The client
 * still refetches after a turn (the list changes), so this is a seed, not a
 * replacement for the route.
 */
export async function listAssistantSessions(
  orgId: OrgId,
  limit = 30,
): Promise<AssistantSessionRow[]> {
  const r = await tenantQuery<{
    id: string;
    title: string | null;
    updated_at: Date | string;
    message_count: string | number;
  }>(
    orgId,
    `SELECT s.id,
            s.title,
            s.updated_at,
            COUNT(m.id) AS message_count
       FROM ai_chat_sessions s
       LEFT JOIN ai_chat_messages m
              ON m.session_id = s.id
             AND m.organization_id = s.organization_id
      WHERE s.organization_id = $1
      GROUP BY s.id, s.title, s.updated_at
      ORDER BY s.updated_at DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: new Date(row.updated_at).toISOString(),
    messageCount: Number(row.message_count ?? 0),
  }));
}

export async function loadAssistantHistory(
  orgId: OrgId,
  sessionId: string,
  limit = 20,
): Promise<AssistantHistoryTurn[]> {
  const r = await tenantQuery<{ role: string; content: string }>(
    orgId,
    `SELECT role, content FROM (
       SELECT id, role, content FROM ai_chat_messages
        WHERE organization_id = $1 AND session_id = $2 AND role IN ('user','assistant')
        ORDER BY id DESC
        LIMIT $3
     ) latest ORDER BY id ASC`,
    [orgId, sessionId, limit],
  );
  return r.rows
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

/**
 * Persist one turn, creating the session on the first message. Returns
 * `{ created }` so the route can replace the provisional title (a real name
 * derived from the message via {@link fallbackTitle}) with an AI summary once
 * the model answers. `(xmax = 0)` is Postgres' insert-vs-conflict tell.
 */
export async function persistAssistantTurn(
  orgId: OrgId,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<{ created: boolean }> {
  try {
    const upsert = await tenantQuery<{ created: boolean }>(
      orgId,
      `INSERT INTO ai_chat_sessions (id, organization_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
       RETURNING (xmax = 0) AS created`,
      [sessionId, orgId, fallbackTitle(content)],
    );
    await tenantQuery(
      orgId,
      `INSERT INTO ai_chat_messages (organization_id, session_id, role, content, mode)
       VALUES ($1, $2, $3, $4, 'assistant')`,
      [orgId, sessionId, role, content],
    );
    return { created: upsert.rows[0]?.created === true };
  } catch (err) {
    console.warn('[assistant] chat persistence failed (non-fatal):', err);
    return { created: false };
  }
}

/**
 * Overwrite a session's title — the AI summary landing after creation. Scoped
 * to the org via the tenant connection so a stray id can never retitle another
 * tenant's thread.
 */
export async function setSessionTitle(
  orgId: OrgId,
  sessionId: string,
  title: string,
): Promise<void> {
  const next = title.trim();
  if (!next) return;
  try {
    await tenantQuery(
      orgId,
      `UPDATE ai_chat_sessions SET title = $3 WHERE id = $1 AND organization_id = $2`,
      [sessionId, orgId, next],
    );
  } catch (err) {
    console.warn('[assistant] setSessionTitle failed (non-fatal):', err);
  }
}
