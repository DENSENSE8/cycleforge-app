/**
 * Assistant chat persistence — the ONE data layer for ai_chat_sessions /
 * ai_chat_messages (plan K2).
 *
 * Every statement is scoped by organization AND owning staff: a session is
 * private to the staffer who started it. Reads and writes join
 * `ai_chat_sessions s ON s.id = $session AND s.organization_id = $org AND
 * s.staff_id = $staff AND s.deleted_at IS NULL`, so a foreign, legacy
 * (`staff_id IS NULL`) or soft-deleted thread is indistinguishable from a
 * missing one — callers answer 404, never 403, so ids are not leaked.
 *
 * Both tables are in the RLS-FORCEd cohort, so everything goes through
 * tenantQuery (GUC + explicit org) per the house tenancy rules.
 *
 * Message identity: the client mints `m-<uuid>` for both rows of a turn and
 * the server stores it in `client_id`. Legacy rows without one surface as
 * `db-<serial>`; {@link MESSAGE_ID_MATCH} resolves either form.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { fallbackTitle } from '@/lib/ai/session-title-text';
import type { PersistedTurnTrace } from '@/lib/assistant/turn-trace';

/** Client-minted message id; legacy rows surface as `db-<serial>`. */
export type ClientMsgId = string;
export const CLIENT_MSG_ID_RE = /^[A-Za-z0-9._:-]{8,80}$/;
export function isClientMsgId(value: unknown): value is ClientMsgId {
  return typeof value === 'string' && CLIENT_MSG_ID_RE.test(value);
}

/** Session ids are client-generated text PKs (e.g. `oc-…`). */
export const SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,120}$/;

export const SESSION_TITLE_MAX = 200;

export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One row of the sidebar's recent list. */
export interface ChatSessionRow {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

/** One live message of a reopened thread. */
export interface ChatHistoryRow {
  id: ClientMsgId;
  role: 'user' | 'assistant';
  content: string;
  analysis: unknown;
  error: boolean;
  feedback: -1 | 1 | null;
  createdAt: string;
}

export interface PersistTurnRow {
  role: 'user' | 'assistant';
  content: string;
  clientId: ClientMsgId;
  analysis?: PersistedTurnTrace | null;
  error?: boolean;
}

/** Owner predicate on alias `s`: $1 org, $2 session, $3 staff. */
const OWNED_LIVE_SESSION = `s.organization_id = $1 AND s.id = $2 AND s.staff_id = $3 AND s.deleted_at IS NULL`;

/**
 * Matches message alias `m` against a ClientMsgId parameter: the stored
 * `client_id`, or a legacy `db-<serial>` row that never had one.
 */
const MESSAGE_ID_MATCH = (param: string) =>
  `(m.client_id = ${param} OR (m.client_id IS NULL AND ${param} = 'db-' || m.id::text))`;

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

// ─── Turn engine ──────────────────────────────────────────────────────────────

/**
 * Create the session for its owner, or touch it when the caller already owns
 * it. `{ ok: false }` = the id exists but belongs to another org/staffer or is
 * deleted — the route answers `error{code:'foreign_session'}` and writes
 * nothing. `created` tells the route to replace the provisional title.
 * Throws on DB failure (the caller decides whether the turn can proceed).
 */
export async function claimSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  firstMessage: string,
): Promise<{ ok: true; created: boolean } | { ok: false }> {
  const r = await tenantQuery<{ created: boolean }>(
    orgId,
    `INSERT INTO ai_chat_sessions AS s (id, organization_id, staff_id, title, created_at, updated_at)
     VALUES ($2, $1, $3, $4, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      WHERE s.organization_id = EXCLUDED.organization_id
        AND s.staff_id = EXCLUDED.staff_id
        AND s.deleted_at IS NULL
     RETURNING (xmax = 0) AS created`,
    [orgId, sessionId, staffId, fallbackTitle(firstMessage)],
  );
  const row = r.rows[0];
  return row ? { ok: true, created: row.created === true } : { ok: false };
}

/**
 * Append one row to a thread the caller owns. Idempotent on `clientId` (a
 * retried send is a no-op) and a silent no-op when the session is not the
 * caller's. Fire-and-forget: failures are logged, never thrown — a chat turn
 * must not fail because history could not be written.
 */
export async function persistAssistantTurn(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  row: PersistTurnRow,
): Promise<void> {
  try {
    await tenantQuery(
      orgId,
      `INSERT INTO ai_chat_messages
              (organization_id, session_id, role, content, mode, analysis, error, client_id)
       SELECT $1, s.id, $4, $5, 'assistant', $6::jsonb, $7, $8
         FROM ai_chat_sessions s
        WHERE ${OWNED_LIVE_SESSION}
       ON CONFLICT (organization_id, session_id, client_id)
          WHERE client_id IS NOT NULL AND superseded_at IS NULL
       DO NOTHING`,
      [
        orgId,
        sessionId,
        staffId,
        row.role,
        row.content,
        row.analysis ? JSON.stringify(row.analysis) : null,
        row.error === true,
        row.clientId,
      ],
    );
  } catch (err) {
    console.warn('[assistant] chat persistence failed (non-fatal):', err);
  }
}

/**
 * The model's context: the newest `limit` live, non-error rows of an owned
 * thread, oldest first. `excludeClientId` keeps the turn being answered out
 * of its own history (it rides as the user message instead).
 */
export async function loadAssistantHistory(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  opts: { excludeClientId?: ClientMsgId; limit?: number } = {},
): Promise<AssistantHistoryTurn[]> {
  const r = await tenantQuery<{ role: string; content: string }>(
    orgId,
    `SELECT role, content FROM (
       SELECT m.id, m.role, m.content
         FROM ai_chat_messages m
         JOIN ai_chat_sessions s ON s.id = m.session_id AND s.organization_id = m.organization_id
        WHERE ${OWNED_LIVE_SESSION}
          AND m.organization_id = $1 AND m.session_id = $2
          AND m.role IN ('user','assistant')
          AND m.superseded_at IS NULL
          AND m.error IS NOT TRUE
          AND ($5::text IS NULL OR NOT ${MESSAGE_ID_MATCH('$5')})
        ORDER BY m.id DESC
        LIMIT $4
     ) latest ORDER BY id ASC`,
    [orgId, sessionId, staffId, opts.limit ?? 20, opts.excludeClientId ?? null],
  );
  return r.rows
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

/**
 * Rewind an owned thread to a user message: supersede every live row after
 * it, and the anchor itself in `edit` mode. Returns the anchor's stored
 * content (authoritative for `regenerate`), or null when the anchor is not a
 * live user row of a thread the caller owns. Rows are superseded, never
 * deleted, so feedback and eval evidence survive.
 */
export async function rewindSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  rewind: { messageId: ClientMsgId; mode: 'edit' | 'regenerate' },
): Promise<{ anchorContent: string } | null> {
  const r = await tenantQuery<{ content: string }>(
    orgId,
    `WITH anchor AS (
       SELECT m.id, m.content
         FROM ai_chat_messages m
         JOIN ai_chat_sessions s ON s.id = m.session_id AND s.organization_id = m.organization_id
        WHERE ${OWNED_LIVE_SESSION}
          AND m.organization_id = $1 AND m.session_id = $2
          AND ${MESSAGE_ID_MATCH('$4')}
          AND m.role = 'user'
          AND m.superseded_at IS NULL
        ORDER BY m.id DESC
        LIMIT 1
     ), rewound AS (
       UPDATE ai_chat_messages m SET superseded_at = NOW()
         FROM anchor a
        WHERE m.organization_id = $1 AND m.session_id = $2
          AND m.superseded_at IS NULL
          AND (m.id > a.id OR ($5::boolean AND m.id = a.id))
        RETURNING m.id
     )
     SELECT a.content, (SELECT count(*) FROM rewound) AS rewound FROM anchor a`,
    [orgId, sessionId, staffId, rewind.messageId, rewind.mode === 'edit'],
  );
  const row = r.rows[0];
  return row ? { anchorContent: row.content } : null;
}

/** Overwrite an owned, live session's title (the AI summary landing). */
export async function setSessionTitle(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  title: string,
): Promise<void> {
  const next = title.trim().slice(0, SESSION_TITLE_MAX);
  if (!next) return;
  try {
    await tenantQuery(
      orgId,
      `UPDATE ai_chat_sessions s SET title = $4 WHERE ${OWNED_LIVE_SESSION}`,
      [orgId, sessionId, staffId, next],
    );
  } catch (err) {
    console.warn('[assistant] setSessionTitle failed (non-fatal):', err);
  }
}

// ─── Sessions API ─────────────────────────────────────────────────────────────

/** Keyset cursor = base64url(`<updated_at µs ISO>|<id>`), opaque in URLs. */
function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const bar = raw.indexOf('|');
    if (bar <= 0) return null;
    const updatedAt = raw.slice(0, bar);
    const id = raw.slice(bar + 1);
    if (Number.isNaN(Date.parse(updatedAt)) || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

/**
 * The caller's live threads, newest first, keyset-paged on
 * `(updated_at, id)`. `messageCount` counts live rows only. An unparseable
 * `before` is treated as the first page.
 */
export async function listAssistantSessions(
  orgId: OrgId,
  staffId: number,
  opts: { limit: number; before?: string; q?: string },
): Promise<{ sessions: ChatSessionRow[]; nextBefore: string | null }> {
  const cursor = opts.before ? decodeCursor(opts.before) : null;
  // ILIKE with the pattern metacharacters escaped: a literal `%` or `_` in the query matches itself.
  const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const r = await tenantQuery<{
    id: string;
    title: string | null;
    updated_at: Date | string;
    cursor_at: string;
    message_count: string | number;
  }>(
    orgId,
    `SELECT s.id,
            s.title,
            s.updated_at,
            to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
            (SELECT count(*) FROM ai_chat_messages m
              WHERE m.organization_id = s.organization_id
                AND m.session_id = s.id
                AND m.superseded_at IS NULL) AS message_count
       FROM ai_chat_sessions s
      WHERE s.organization_id = $1
        AND s.staff_id = $2
        AND s.deleted_at IS NULL
        AND ($4::timestamptz IS NULL OR (s.updated_at, s.id) < ($4::timestamptz, $5::text))
        AND ($6::text IS NULL OR s.title ILIKE $6 ESCAPE '\\')
      ORDER BY s.updated_at DESC, s.id DESC
      LIMIT $3`,
    [orgId, staffId, opts.limit + 1, cursor?.updatedAt ?? null, cursor?.id ?? null, q],
  );
  const page = r.rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    sessions: page.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: iso(row.updated_at),
      messageCount: Number(row.message_count ?? 0),
    })),
    nextBefore:
      r.rows.length > opts.limit && last
        ? Buffer.from(`${last.cursor_at}|${last.id}`, 'utf8').toString('base64url')
        : null,
  };
}

/** One owned, live thread with its live messages (oldest first), or null. */
export async function getAssistantSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
): Promise<{
  session: { id: string; title: string | null; updatedAt: string };
  messages: ChatHistoryRow[];
} | null> {
  const s = await tenantQuery<{ id: string; title: string | null; updated_at: Date | string }>(
    orgId,
    `SELECT s.id, s.title, s.updated_at FROM ai_chat_sessions s WHERE ${OWNED_LIVE_SESSION}`,
    [orgId, sessionId, staffId],
  );
  const session = s.rows[0];
  if (!session) return null;
  const m = await tenantQuery<{
    id: number;
    client_id: string | null;
    role: string;
    content: string;
    analysis: unknown;
    error: boolean | null;
    feedback: number | null;
    created_at: Date | string;
  }>(
    orgId,
    `SELECT m.id, m.client_id, m.role, m.content, m.analysis, m.error, m.feedback, m.created_at
       FROM ai_chat_messages m
      WHERE m.organization_id = $1 AND m.session_id = $2
        AND m.role IN ('user','assistant')
        AND m.superseded_at IS NULL
      ORDER BY m.id ASC`,
    [orgId, sessionId],
  );
  return {
    session: { id: session.id, title: session.title, updatedAt: iso(session.updated_at) },
    messages: m.rows.map((row) => ({
      id: row.client_id ?? `db-${row.id}`,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      analysis: row.analysis ?? null,
      error: row.error === true,
      feedback: row.feedback === 1 || row.feedback === -1 ? row.feedback : null,
      createdAt: iso(row.created_at),
    })),
  };
}

/** Rename an owned, live thread. Renaming is not activity: `updated_at` stays. */
export async function renameAssistantSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  title: string,
): Promise<boolean> {
  const next = title.trim().slice(0, SESSION_TITLE_MAX);
  if (!next) return false;
  const r = await tenantQuery(
    orgId,
    `UPDATE ai_chat_sessions s SET title = $4 WHERE ${OWNED_LIVE_SESSION}`,
    [orgId, sessionId, staffId, next],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Soft-delete an owned, live thread (restorable via {@link restoreAssistantSession}). */
export async function softDeleteAssistantSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
): Promise<boolean> {
  const r = await tenantQuery(
    orgId,
    `UPDATE ai_chat_sessions s SET deleted_at = NOW() WHERE ${OWNED_LIVE_SESSION}`,
    [orgId, sessionId, staffId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** The undo half of a soft delete. Idempotent: restoring a live owned thread is `true`. */
export async function restoreAssistantSession(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
): Promise<boolean> {
  const r = await tenantQuery(
    orgId,
    `UPDATE ai_chat_sessions s SET deleted_at = NULL
      WHERE s.organization_id = $1 AND s.id = $2 AND s.staff_id = $3`,
    [orgId, sessionId, staffId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Thumbs on a live assistant row of an owned thread. `rating` 0 clears the
 * feedback (and its note). Returns false when no such row exists.
 */
export async function setMessageFeedback(
  orgId: OrgId,
  staffId: number,
  sessionId: string,
  clientId: ClientMsgId,
  rating: -1 | 0 | 1,
  note?: string | null,
): Promise<boolean> {
  const r = await tenantQuery(
    orgId,
    `UPDATE ai_chat_messages m
        SET feedback      = NULLIF($5::smallint, 0),
            feedback_note = CASE WHEN $5::smallint = 0 THEN NULL ELSE $6::text END,
            feedback_at   = CASE WHEN $5::smallint = 0 THEN NULL ELSE NOW() END
       FROM ai_chat_sessions s
      WHERE ${OWNED_LIVE_SESSION}
        AND m.organization_id = $1 AND m.session_id = $2
        AND ${MESSAGE_ID_MATCH('$4')}
        AND m.role = 'assistant'
        AND m.superseded_at IS NULL`,
    [orgId, sessionId, staffId, clientId, rating, note?.trim() ? note.trim() : null],
  );
  return (r.rowCount ?? 0) > 0;
}
