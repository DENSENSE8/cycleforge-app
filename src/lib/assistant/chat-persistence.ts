/** Assistant chat persistence — org-explicit writes into the existing ai_chat_sessions / ai_chat_messages tables (plan §-2 "AI runtime"). */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
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

export async function persistAssistantTurn(
  orgId: OrgId,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    await tenantQuery(
      orgId,
      `INSERT INTO ai_chat_sessions (id, organization_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [sessionId, orgId, content.slice(0, 80)],
    );
    await tenantQuery(
      orgId,
      `INSERT INTO ai_chat_messages (organization_id, session_id, role, content, mode)
       VALUES ($1, $2, $3, $4, 'assistant')`,
      [orgId, sessionId, role, content],
    );
  } catch (err) {
    console.warn('[assistant] chat persistence failed (non-fatal):', err);
  }
}
