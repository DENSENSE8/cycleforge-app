/**
 * Entity threads domain layer — ticket-optional conversations anchored to a
 * canonical entity (docs/todo/entity-threads-conversation-plan.md).
 *
 * The single writer for entity_threads / thread_messages (migration
 * 2026-07-14_entity_threads.sql). Mirrors recordEntitySignal
 * (src/lib/surfaces/record-entity-signal.ts):
 *   • anchor vocabulary + parent-table names come from SURFACE_ENTITY_TYPES
 *     (src/lib/surfaces/registry.ts) — never inlined;
 *   • parent existence is validated app-side (polymorphic contract point 6),
 *     in getOrCreateThread, not a DB trigger;
 *   • every message INSERT also emits an ops_events row
 *     (event_type='THREAD_MESSAGE', entity mapped to the spine's lowercase
 *     vocab via the registry) in the SAME tenant transaction;
 *   • idempotent on (organization_id, client_event_id) — a client retry
 *     returns { idempotent: true } instead of a duplicate message.
 *
 * Deps-injected (default real impls) so unit tests run DB-free
 * (.claude/rules/backend-patterns.md).
 */

import { withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  SURFACE_ENTITY_TYPES,
  isSurfaceEntityType,
  type SurfaceEntityType,
} from '@/lib/surfaces/registry';

interface QueryResultLike {
  rows: Array<Record<string, unknown>>;
}

export interface ThreadQueryExecutor {
  query(text: string, params?: ReadonlyArray<unknown>): Promise<QueryResultLike>;
}

export interface ThreadsDeps {
  /** Tenant-scoped read (GUC set). */
  runQuery: <T>(orgId: OrgId, fn: (client: ThreadQueryExecutor) => Promise<T>) => Promise<T>;
  /** Tenant-scoped transaction (GUC set) — write paths. */
  runTransaction: <T>(orgId: OrgId, fn: (client: ThreadQueryExecutor) => Promise<T>) => Promise<T>;
}

const defaultDeps: ThreadsDeps = {
  runQuery: (orgId, fn) => withTenantConnection(orgId, (client) => fn(client)),
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client)),
};

// ─── Row shapes (client-safe wire types live in ./types) ────────────────────

import {
  THREAD_MESSAGE_PROVIDERS,
  THREAD_MESSAGE_VISIBILITIES,
  THREAD_STATUSES,
  type EntityThread,
  type ThreadMessage,
  type ThreadMessageProvider,
  type ThreadMessageVisibility,
  type ThreadStatus,
} from './types';

export * from './types';

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapThread(row: Record<string, unknown>): EntityThread {
  return {
    id: Number(row.id),
    entityType: String(row.entity_type),
    entityId: Number(row.entity_id),
    status: row.status as ThreadStatus,
    supportTicketId: row.support_ticket_id == null ? null : Number(row.support_ticket_id),
    lastMessageAt: row.last_message_at == null ? null : toIso(row.last_message_at),
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    authorStaffId: row.author_staff_id == null ? null : Number(row.author_staff_id),
    authorName: row.author_name == null ? null : String(row.author_name),
    provider: row.provider as ThreadMessageProvider,
    visibility: row.visibility as ThreadMessageVisibility,
    body: String(row.body),
    clientEventId: row.client_event_id == null ? null : String(row.client_event_id),
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    createdAt: toIso(row.created_at),
  };
}

const THREAD_COLS =
  'id, entity_type, entity_id, status, support_ticket_id, last_message_at, created_by, created_at, updated_at';
const MESSAGE_COLS =
  'id, thread_id, author_staff_id, provider, visibility, body, client_event_id, meta, created_at';

// ─── resolveThreadForEntity ──────────────────────────────────────────────────

export interface ResolveThreadInput {
  orgId: OrgId;
  entityType: SurfaceEntityType | (string & {});
  entityId: number;
}

export async function resolveThreadForEntity(
  input: ResolveThreadInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<EntityThread | null> {
  if (!isSurfaceEntityType(input.entityType)) return null;
  if (!Number.isSafeInteger(input.entityId) || input.entityId <= 0) return null;
  return deps.runQuery(input.orgId, async (client) => {
    const res = await client.query(
      `SELECT ${THREAD_COLS} FROM entity_threads
        WHERE organization_id = $1::uuid AND entity_type = $2 AND entity_id = $3::bigint
          AND deleted_at IS NULL`,
      [input.orgId, input.entityType, input.entityId],
    );
    return res.rows.length ? mapThread(res.rows[0]) : null;
  });
}

// ─── getThread (by id) ───────────────────────────────────────────────────────

export async function getThread(
  orgId: OrgId,
  threadId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<EntityThread | null> {
  if (!Number.isSafeInteger(threadId) || threadId <= 0) return null;
  return deps.runQuery(orgId, async (client) => {
    const res = await client.query(
      `SELECT ${THREAD_COLS} FROM entity_threads
        WHERE id = $1::bigint AND organization_id = $2::uuid AND deleted_at IS NULL`,
      [threadId, orgId],
    );
    return res.rows.length ? mapThread(res.rows[0]) : null;
  });
}

// ─── getOrCreateThread ───────────────────────────────────────────────────────

export interface GetOrCreateThreadInput {
  orgId: OrgId;
  entityType: SurfaceEntityType | (string & {});
  entityId: number;
  createdBy?: number | null;
}

export type GetOrCreateThreadResult =
  | { ok: true; thread: EntityThread; created: boolean }
  | { ok: false; status: 400 | 404; error: string };

export async function getOrCreateThread(
  input: GetOrCreateThreadInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<GetOrCreateThreadResult> {
  if (!isSurfaceEntityType(input.entityType)) {
    return { ok: false, status: 400, error: `unknown entity_type "${input.entityType}"` };
  }
  if (!Number.isSafeInteger(input.entityId) || input.entityId <= 0) {
    return { ok: false, status: 400, error: `invalid entityId ${input.entityId}` };
  }
  const entityType = input.entityType;
  const parentTable = SURFACE_ENTITY_TYPES[entityType].parentTable;

  return deps.runTransaction(input.orgId, async (client) => {
    // App-side parent-existence validation (polymorphic contract point 6).
    // parentTable comes from the registry, never from user input. All 7
    // canonical parents carry organization_id.
    const parent = await client.query(
      `SELECT 1 FROM ${parentTable} WHERE id = $1 AND organization_id = $2::uuid`,
      [input.entityId, input.orgId],
    );
    if (parent.rows.length === 0) {
      return {
        ok: false as const,
        status: 404 as const,
        error: `${entityType} ${input.entityId} not found`,
      };
    }

    // Upsert on the natural key; the no-op DO UPDATE makes RETURNING yield the
    // existing row on conflict. xmax = 0 discriminates fresh inserts.
    // On conflict the thread already exists; revive it if it was soft-deleted
    // (re-opening an entity's conversation un-tombstones it) and return the row.
    const res = await client.query(
      `INSERT INTO entity_threads (organization_id, entity_type, entity_id, created_by)
       VALUES ($1::uuid, $2, $3::bigint, $4::int)
       ON CONFLICT (organization_id, entity_type, entity_id)
         DO UPDATE SET deleted_at = NULL,
                       updated_at = CASE WHEN entity_threads.deleted_at IS NOT NULL
                                         THEN now() ELSE entity_threads.updated_at END
       RETURNING ${THREAD_COLS}, (xmax = 0) AS inserted`,
      [input.orgId, entityType, input.entityId, input.createdBy ?? null],
    );
    const row = res.rows[0];
    return { ok: true as const, thread: mapThread(row), created: row.inserted === true };
  });
}

// ─── postThreadMessage ───────────────────────────────────────────────────────

export interface PostThreadMessageInput {
  orgId: OrgId;
  threadId: number;
  authorStaffId?: number | null;
  provider?: ThreadMessageProvider;
  visibility?: ThreadMessageVisibility;
  body: string;
  clientEventId?: string | null;
  meta?: Record<string, unknown> | null;
}

export type PostThreadMessageResult =
  | { ok: true; message: ThreadMessage; idempotent: boolean }
  | { ok: false; status: 400 | 404; error: string };

export async function postThreadMessage(
  input: PostThreadMessageInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<PostThreadMessageResult> {
  const provider = input.provider ?? 'internal';
  const visibility = input.visibility ?? 'internal';
  if (!THREAD_MESSAGE_PROVIDERS.includes(provider)) {
    return { ok: false, status: 400, error: `unknown provider "${provider}"` };
  }
  if (!THREAD_MESSAGE_VISIBILITIES.includes(visibility)) {
    return { ok: false, status: 400, error: `unknown visibility "${visibility}"` };
  }
  const body = input.body ?? '';
  if (body.trim().length === 0) {
    return { ok: false, status: 400, error: 'body must not be empty' };
  }
  if (!Number.isSafeInteger(input.threadId) || input.threadId <= 0) {
    return { ok: false, status: 400, error: `invalid threadId ${input.threadId}` };
  }

  return deps.runTransaction(input.orgId, async (client) => {
    const threadRes = await client.query(
      `SELECT id, entity_type, entity_id FROM entity_threads
        WHERE id = $1::bigint AND organization_id = $2::uuid`,
      [input.threadId, input.orgId],
    );
    if (threadRes.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    const thread = threadRes.rows[0] as { entity_type: SurfaceEntityType; entity_id: number };

    const clientEventId = input.clientEventId ?? null;
    const inserted = await client.query(
      `INSERT INTO thread_messages (
         organization_id, thread_id, author_staff_id, provider, visibility, body, client_event_id, meta
       ) VALUES ($1::uuid, $2::bigint, $3::int, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (organization_id, client_event_id)
         WHERE client_event_id IS NOT NULL
         DO NOTHING
       RETURNING ${MESSAGE_COLS}`,
      [
        input.orgId,
        input.threadId,
        input.authorStaffId ?? null,
        provider,
        visibility,
        body,
        clientEventId,
        input.meta == null ? null : JSON.stringify(input.meta),
      ],
    );

    if (inserted.rows.length === 0) {
      // Client retry — return the previously inserted message, no side-effects.
      const existing = await client.query(
        `SELECT ${MESSAGE_COLS} FROM thread_messages
          WHERE organization_id = $1::uuid AND client_event_id = $2`,
        [input.orgId, clientEventId],
      );
      return { ok: true as const, message: mapMessage(existing.rows[0]), idempotent: true };
    }
    const message = mapMessage(inserted.rows[0]);

    await client.query(
      `UPDATE entity_threads
          SET last_message_at = GREATEST(COALESCE(last_message_at, $2::timestamptz), $2::timestamptz),
              updated_at = now()
        WHERE id = $1::bigint AND organization_id = $3::uuid`,
      [input.threadId, message.createdAt, input.orgId],
    );

    // Same-transaction ops_events emission (D3) — the spine stays the SoT
    // timeline; rolls back with the message if the transaction aborts.
    // UPPERCASE anchor vocab → the spine's lowercase vocab via the registry.
    const opsEntityType = SURFACE_ENTITY_TYPES[thread.entity_type].opsEventEntityType;
    await client.query(
      `INSERT INTO ops_events (
         organization_id, occurred_at, event_type, entity_type, entity_id,
         actor_staff_id, client_event_id, payload
       ) VALUES ($1::uuid, $2::timestamptz, 'THREAD_MESSAGE', $3, $4::bigint, $5::int, $6, $7::jsonb)
       ON CONFLICT (client_event_id) DO NOTHING`,
      [
        input.orgId,
        message.createdAt,
        opsEntityType,
        thread.entity_id,
        input.authorStaffId ?? null,
        `thread-message:${message.id}`,
        JSON.stringify({
          threadId: input.threadId,
          messageId: message.id,
          provider,
          visibility,
          preview: body.trim().slice(0, 140),
        }),
      ],
    );

    return { ok: true as const, message, idempotent: false };
  });
}

// ─── postEntityMessage ───────────────────────────────────────────────────────

export interface PostEntityMessageInput {
  orgId: OrgId;
  entityType: SurfaceEntityType | (string & {});
  entityId: number;
  authorStaffId?: number | null;
  provider?: ThreadMessageProvider;
  visibility?: ThreadMessageVisibility;
  body: string;
  clientEventId?: string | null;
  meta?: Record<string, unknown> | null;
}

export type PostEntityMessageResult =
  | { ok: true; thread: EntityThread; message: ThreadMessage; idempotent: boolean }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Post a message to an entity's thread, creating the thread if it does not
 * exist yet. **The single server-side waist for "write this operator's words
 * onto that record."**
 *
 * ## Why this exists now
 *
 * Phase 7 collapses the app's composers onto one component whose `target` names
 * a destination. The destination that matters — `thread_message` — needed a
 * caller-facing entry point shaped like the target itself
 * (`{ entityType, entityId, body }`), because the two-step
 * get-or-create-then-post dance is exactly the kind of sequencing that a route
 * gets subtly wrong once per route. It also gives a repointed writer (the order
 * record's `createOrderNote`, the receiving-line note routes) a one-line
 * migration instead of a rewrite.
 *
 * ## Two transactions, on purpose
 *
 * `getOrCreateThread` and `postThreadMessage` each open their own tenant
 * transaction, and this composes them rather than inlining a merged one.
 *
 * The failure mode of two transactions here is a thread row with no messages —
 * which is a legal, already-reachable state (a `ThreadPanel` mounted on an
 * entity creates one before anyone types), costs one narrow row, and is
 * self-healing: the next attempt finds it by the natural key and posts into it.
 * The failure mode of a merged transaction is a THIRD copy of the anchor
 * validation, the upsert and the `ops_events` emission living in a function
 * that has to be kept byte-identical to the two it duplicates. The one-row
 * orphan is the cheaper bug.
 *
 * Idempotency is unchanged and still exact: `client_event_id` collapses a
 * retried post whether or not the thread step ran twice.
 */
export async function postEntityMessage(
  input: PostEntityMessageInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<PostEntityMessageResult> {
  const body = input.body ?? '';
  if (body.trim().length === 0) {
    return { ok: false, status: 400, error: 'body must not be empty' };
  }

  const ensured = await getOrCreateThread(
    {
      orgId: input.orgId,
      entityType: input.entityType,
      entityId: input.entityId,
      createdBy: input.authorStaffId ?? null,
    },
    deps,
  );
  if (!ensured.ok) return ensured;

  const posted = await postThreadMessage(
    {
      orgId: input.orgId,
      threadId: ensured.thread.id,
      authorStaffId: input.authorStaffId ?? null,
      provider: input.provider,
      visibility: input.visibility,
      body,
      clientEventId: input.clientEventId ?? null,
      meta: input.meta ?? null,
    },
    deps,
  );
  if (!posted.ok) return posted;

  return {
    ok: true,
    thread: ensured.thread,
    message: posted.message,
    idempotent: posted.idempotent,
  };
}

// ─── listThreadMessages ──────────────────────────────────────────────────────

export interface ListThreadMessagesInput {
  orgId: OrgId;
  threadId: number;
  /** Max rows (default 50, capped 200). */
  limit?: number;
  /** Keyset cursor: return messages strictly older than this message id. */
  beforeId?: number | null;
}

export type ListThreadMessagesResult =
  | { ok: true; messages: ThreadMessage[] }
  | { ok: false; status: 404; error: string };

export async function listThreadMessages(
  input: ListThreadMessagesInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<ListThreadMessagesResult> {
  const limit = Math.min(Math.max(1, input.limit ?? 50), 200);
  return deps.runQuery(input.orgId, async (client) => {
    const threadRes = await client.query(
      `SELECT id FROM entity_threads WHERE id = $1::bigint AND organization_id = $2::uuid`,
      [input.threadId, input.orgId],
    );
    if (threadRes.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    const beforeId = input.beforeId ?? null;
    const msgCols = MESSAGE_COLS.split(', ')
      .map((c) => `tm.${c}`)
      .join(', ');
    const res = await client.query(
      `SELECT ${msgCols}, s.name AS author_name
         FROM thread_messages tm
         LEFT JOIN staff s ON s.id = tm.author_staff_id AND s.organization_id = tm.organization_id
        WHERE tm.thread_id = $1::bigint AND tm.organization_id = $2::uuid
          AND tm.deleted_at IS NULL
          AND ($3::bigint IS NULL OR (tm.created_at, tm.id) < (
            SELECT created_at, id FROM thread_messages
             WHERE id = $3::bigint AND organization_id = $2::uuid))
        ORDER BY tm.created_at DESC, tm.id DESC
        LIMIT $4`,
      [input.threadId, input.orgId, beforeId, limit],
    );
    // Newest page fetched DESC for keyset; hand back ascending for chat display.
    return { ok: true as const, messages: res.rows.map(mapMessage).reverse() };
  });
}

// ─── attachSupportTicket ─────────────────────────────────────────────────────

export interface AttachSupportTicketInput {
  orgId: OrgId;
  threadId: number;
  supportTicketId: number;
}

export type AttachSupportTicketResult =
  | { ok: true; thread: EntityThread; idempotent: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function attachSupportTicket(
  input: AttachSupportTicketInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<AttachSupportTicketResult> {
  if (!Number.isSafeInteger(input.supportTicketId) || input.supportTicketId <= 0) {
    return { ok: false, status: 400, error: `invalid supportTicketId ${input.supportTicketId}` };
  }
  return deps.runTransaction(input.orgId, async (client) => {
    const threadRes = await client.query(
      `SELECT ${THREAD_COLS} FROM entity_threads
        WHERE id = $1::bigint AND organization_id = $2::uuid`,
      [input.threadId, input.orgId],
    );
    if (threadRes.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    const current = mapThread(threadRes.rows[0]);
    if (current.supportTicketId != null) {
      if (current.supportTicketId === input.supportTicketId) {
        return { ok: true as const, thread: current, idempotent: true };
      }
      return {
        ok: false as const,
        status: 409 as const,
        error: `thread ${input.threadId} is already attached to ticket ${current.supportTicketId}`,
      };
    }

    const ticket = await client.query(
      `SELECT 1 FROM support_tickets WHERE id = $1::bigint AND organization_id = $2::uuid`,
      [input.supportTicketId, input.orgId],
    );
    if (ticket.rows.length === 0) {
      return {
        ok: false as const,
        status: 404 as const,
        error: `support ticket ${input.supportTicketId} not found`,
      };
    }

    const updated = await client.query(
      `UPDATE entity_threads
          SET support_ticket_id = $3::bigint, updated_at = now()
        WHERE id = $1::bigint AND organization_id = $2::uuid
        RETURNING ${THREAD_COLS}`,
      [input.threadId, input.orgId, input.supportTicketId],
    );
    return { ok: true as const, thread: mapThread(updated.rows[0]), idempotent: false };
  });
}

// ─── updateThreadStatus ──────────────────────────────────────────────────────

export interface UpdateThreadStatusInput {
  orgId: OrgId;
  threadId: number;
  status: ThreadStatus;
}

export type UpdateThreadStatusResult =
  | { ok: true; thread: EntityThread }
  | { ok: false; status: 400 | 404; error: string };

export async function updateThreadStatus(
  input: UpdateThreadStatusInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<UpdateThreadStatusResult> {
  if (!THREAD_STATUSES.includes(input.status)) {
    return { ok: false, status: 400, error: `unknown status "${input.status}"` };
  }
  return deps.runTransaction(input.orgId, async (client) => {
    const res = await client.query(
      `UPDATE entity_threads
          SET status = $3, updated_at = now()
        WHERE id = $1::bigint AND organization_id = $2::uuid AND deleted_at IS NULL
        RETURNING ${THREAD_COLS}`,
      [input.threadId, input.orgId, input.status],
    );
    if (res.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `thread ${input.threadId} not found` };
    }
    return { ok: true as const, thread: mapThread(res.rows[0]) };
  });
}

// ─── softDeleteThread ────────────────────────────────────────────────────────

export type SoftDeleteThreadResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; status: 404; error: string };

export async function softDeleteThread(
  orgId: OrgId,
  threadId: number,
  deps: ThreadsDeps = defaultDeps,
): Promise<SoftDeleteThreadResult> {
  return deps.runTransaction(orgId, async (client) => {
    const res = await client.query(
      `UPDATE entity_threads
          SET deleted_at = now(), updated_at = now()
        WHERE id = $1::bigint AND organization_id = $2::uuid AND deleted_at IS NULL
        RETURNING id`,
      [threadId, orgId],
    );
    if (res.rows.length === 0) {
      // Either absent or already soft-deleted — distinguish for a clean 404.
      const exists = await client.query(
        `SELECT 1 FROM entity_threads WHERE id = $1::bigint AND organization_id = $2::uuid`,
        [threadId, orgId],
      );
      if (exists.rows.length === 0) {
        return { ok: false as const, status: 404 as const, error: `thread ${threadId} not found` };
      }
      return { ok: true as const, idempotent: true };
    }
    return { ok: true as const, idempotent: false };
  });
}

// ─── editThreadMessage / deleteThreadMessage ─────────────────────────────────

export interface EditThreadMessageInput {
  orgId: OrgId;
  threadId: number;
  messageId: number;
  body: string;
  /** Acting staff; a non-manager may edit only their own message. */
  actorStaffId?: number | null;
  /** True when the caller holds a manage-all grant (bypasses author check). */
  canManageAll?: boolean;
}

export type EditThreadMessageResult =
  | { ok: true; message: ThreadMessage }
  | { ok: false; status: 400 | 403 | 404; error: string };

export async function editThreadMessage(
  input: EditThreadMessageInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<EditThreadMessageResult> {
  const body = input.body ?? '';
  if (body.trim().length === 0) {
    return { ok: false, status: 400, error: 'body must not be empty' };
  }
  return deps.runTransaction(input.orgId, async (client) => {
    const row = await client.query(
      `SELECT author_staff_id, provider FROM thread_messages
        WHERE id = $1::bigint AND thread_id = $2::bigint AND organization_id = $3::uuid
          AND deleted_at IS NULL`,
      [input.messageId, input.threadId, input.orgId],
    );
    if (row.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `message ${input.messageId} not found` };
    }
    const authorStaffId = row.rows[0].author_staff_id == null ? null : Number(row.rows[0].author_staff_id);
    if (!input.canManageAll && authorStaffId !== (input.actorStaffId ?? null)) {
      return { ok: false as const, status: 403 as const, error: 'not the message author' };
    }
    const updated = await client.query(
      `UPDATE thread_messages
          SET body = $4, meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('editedAt', now())
        WHERE id = $1::bigint AND thread_id = $2::bigint AND organization_id = $3::uuid
        RETURNING ${MESSAGE_COLS}`,
      [input.messageId, input.threadId, input.orgId, body],
    );
    return { ok: true as const, message: mapMessage(updated.rows[0]) };
  });
}

export interface DeleteThreadMessageInput {
  orgId: OrgId;
  threadId: number;
  messageId: number;
  actorStaffId?: number | null;
  canManageAll?: boolean;
}

export type DeleteThreadMessageResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; status: 403 | 404; error: string };

export async function deleteThreadMessage(
  input: DeleteThreadMessageInput,
  deps: ThreadsDeps = defaultDeps,
): Promise<DeleteThreadMessageResult> {
  return deps.runTransaction(input.orgId, async (client) => {
    const row = await client.query(
      `SELECT author_staff_id, deleted_at FROM thread_messages
        WHERE id = $1::bigint AND thread_id = $2::bigint AND organization_id = $3::uuid`,
      [input.messageId, input.threadId, input.orgId],
    );
    if (row.rows.length === 0) {
      return { ok: false as const, status: 404 as const, error: `message ${input.messageId} not found` };
    }
    if (row.rows[0].deleted_at != null) {
      return { ok: true as const, idempotent: true };
    }
    const authorStaffId = row.rows[0].author_staff_id == null ? null : Number(row.rows[0].author_staff_id);
    if (!input.canManageAll && authorStaffId !== (input.actorStaffId ?? null)) {
      return { ok: false as const, status: 403 as const, error: 'not the message author' };
    }
    await client.query(
      `UPDATE thread_messages SET deleted_at = now()
        WHERE id = $1::bigint AND thread_id = $2::bigint AND organization_id = $3::uuid`,
      [input.messageId, input.threadId, input.orgId],
    );
    return { ok: true as const, idempotent: false };
  });
}
