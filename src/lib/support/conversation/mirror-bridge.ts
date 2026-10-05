/**
 * Zendesk mirror → local Support thread. Reads the LOCAL mirror
 * (support_tickets + support_ticket_comments + zendesk_users, via
 * readTicketMirror) and hands every comment, oldest first, to the one writer
 * waist `ingestSupportMessage`:
 *
 *   customer public comment  → inbound
 *   agent / staff public     → outbound, delivery 'sent' (answers the
 *                              pending inbound before it)
 *   private note             → internal
 *
 * Idempotent by external_message_id `zendesk:comment:<id>` — already-stored
 * comments are skipped before ingest, and ingest itself dedupes a race.
 * Zero provider calls. The provider's ticket status ("solved") is mirror
 * metadata only: nothing here moves the local lifecycle.
 *
 * Mode: `backfill` imports history without alerts, drafts, task creation or
 * reopen; `live` runs the full loop. Omitted → backfill while the item has no
 * thread messages yet (first import of an old ticket); afterwards only
 * comments newer than the newest stored message are live (a new customer
 * comment reopens and alerts; older history never re-alerts).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readTicketMirror, type TicketMirror } from '@/lib/support/ticket-mirror';
import { planMirrorIngest, zendeskCommentMessageId } from '@/lib/support/adapters/zendesk-comments';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ingestSupportMessage } from './ingest';
import type {
  IngestSupportMessageResult,
  SupportIngestMode,
  SupportMessageDraft,
} from './ingest-types';

export interface MirrorBridgeDeps {
  readItem(orgId: OrgId, supportTicketId: number): Promise<{ provider: string; externalTicketId: string | null } | null>;
  readMirror(orgId: OrgId, zendeskTicketId: number): Promise<TicketMirror | null>;
  /**
   * The item's live thread: message count, newest message instant, and the
   * stored Zendesk external ids among the candidates.
   */
  readThreadState(
    orgId: OrgId,
    supportTicketId: number,
    candidateIds: string[],
  ): Promise<{ messageCount: number; newestMessageAt: string | null; existingMessageIds: Set<string> }>;
  ingest(draft: SupportMessageDraft): Promise<IngestSupportMessageResult>;
}

const realDeps: MirrorBridgeDeps = {
  async readItem(orgId, supportTicketId) {
    const r = await tenantQuery<{ provider: string; external_ticket_id: string | null }>(
      orgId,
      `SELECT provider, external_ticket_id
         FROM support_tickets
        WHERE organization_id = $1 AND id = $2`,
      [orgId, supportTicketId],
    );
    const row = r.rows[0];
    return row ? { provider: row.provider, externalTicketId: row.external_ticket_id } : null;
  },
  readMirror: (orgId, zendeskTicketId) => readTicketMirror(orgId, zendeskTicketId),
  async readThreadState(orgId, supportTicketId, candidateIds) {
    const r = await tenantQuery<{ message_count: number; newest_at: Date | string | null; existing: string[] | null }>(
      orgId,
      `SELECT
         (SELECT count(*)::int
            FROM thread_messages tm
            JOIN entity_threads et
              ON et.id = tm.thread_id AND et.organization_id = tm.organization_id
           WHERE et.organization_id = $1
             AND et.entity_type = 'SUPPORT_TICKET'
             AND et.entity_id = $2
             AND tm.deleted_at IS NULL) AS message_count,
         (SELECT max(COALESCE(tm.occurred_at, tm.created_at))
            FROM thread_messages tm
            JOIN entity_threads et
              ON et.id = tm.thread_id AND et.organization_id = tm.organization_id
           WHERE et.organization_id = $1
             AND et.entity_type = 'SUPPORT_TICKET'
             AND et.entity_id = $2
             AND tm.deleted_at IS NULL) AS newest_at,
         (SELECT array_agg(tm.external_message_id)
            FROM thread_messages tm
           WHERE tm.organization_id = $1
             AND tm.provider = 'zendesk'
             AND tm.external_message_id = ANY($3::text[])) AS existing`,
      [orgId, supportTicketId, candidateIds],
    );
    const row = r.rows[0];
    return {
      messageCount: Number(row?.message_count ?? 0),
      newestMessageAt: row?.newest_at != null ? new Date(row.newest_at).toISOString() : null,
      existingMessageIds: new Set(row?.existing ?? []),
    };
  },
  ingest: (draft) => ingestSupportMessage(draft),
};

export async function syncSupportThreadFromMirror(
  orgId: OrgId,
  supportTicketId: number,
  opts: { mode?: SupportIngestMode } = {},
  deps: MirrorBridgeDeps = realDeps,
): Promise<{ ingested: number; skipped: number }> {
  const item = await deps.readItem(orgId, supportTicketId);
  const zendeskTicketId = Number(item?.externalTicketId);
  if (!item || item.provider !== 'zendesk' || !Number.isSafeInteger(zendeskTicketId) || zendeskTicketId <= 0) {
    return { ingested: 0, skipped: 0 };
  }
  const mirror = await deps.readMirror(orgId, zendeskTicketId);
  if (!mirror || mirror.supportTicketId !== supportTicketId) return { ingested: 0, skipped: 0 };

  const state = await deps.readThreadState(
    orgId,
    supportTicketId,
    mirror.comments.map((c) => zendeskCommentMessageId(c.id)),
  );
  const mode = opts.mode ?? (state.messageCount > 0 ? 'live' : 'backfill');
  const plan = planMirrorIngest({
    orgId,
    supportItemId: supportTicketId,
    mirror,
    mode,
    // Auto mode only: history at or before the newest stored message is never live.
    liveAfter: opts.mode == null ? state.newestMessageAt : null,
    existingMessageIds: state.existingMessageIds,
  });

  let ingested = 0;
  let skipped = plan.skipped;
  // Sequential: an outbound comment answers only the inbound stored before it.
  for (const draft of plan.drafts) {
    const res = await deps.ingest(draft);
    if (!res.ok) {
      throw new Error(
        `Support mirror bridge: ${draft.externalMessageId} on item ${supportTicketId} refused (${res.status}): ${res.error}`,
      );
    }
    if (res.idempotent) skipped += 1;
    else ingested += 1;
  }
  return { ingested, skipped };
}

/** Set while a CycleForge send's write-through re-mirror runs (see withMirrorBridgeSuppressed). */
const bridgeSuppressed = new AsyncLocalStorage<true>();

/**
 * Run `fn` with the post-mirror bridge hook switched off for every mirror
 * write it causes. The Support reply path stores its own outbound row with
 * the posted comment's external id, so the write-through re-mirror of that
 * send must not ingest the same comment first.
 */
export function withMirrorBridgeSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  return bridgeSuppressed.run(true, fn);
}

/** True inside {@link withMirrorBridgeSuppressed} — the hook's guard, and the send path's test probe. */
export function mirrorBridgeSuppressed(): boolean {
  return bridgeSuppressed.getStore() === true;
}

/**
 * The writeTicketMirror hook. Never throws: the mirror write already
 * succeeded, and a bridge failure (e.g. the item's thread refused a message)
 * is logged and retried by the next mirror write.
 */
export async function syncSupportThreadAfterMirrorWrite(orgId: OrgId, supportTicketId: number): Promise<void> {
  if (mirrorBridgeSuppressed()) return;
  try {
    await syncSupportThreadFromMirror(orgId, supportTicketId);
  } catch (err) {
    console.warn(
      '[support.mirror-bridge] sync failed',
      supportTicketId,
      err instanceof Error ? err.message : err,
    );
  }
}
