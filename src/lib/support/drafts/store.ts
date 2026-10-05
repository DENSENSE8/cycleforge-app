/**
 * `support_drafts` — the stored AI drafts of a Support item. Pending rows are
 * claimed by the worker (`process.ts`) with FOR UPDATE SKIP LOCKED under an
 * attempts cap and a lease; a draft becomes `ready` only while its source
 * boundary is still the newest inbound message, else `stale`. Never sent.
 *
 * Writers take the caller's PoolClient (already inside withTenantTransaction)
 * and keep explicit `organization_id` filters.
 */
import type { PoolClient } from 'pg';
import type {
  SupportDraftCitation,
  SupportDraftConfidence,
  SupportDraftKind,
  SupportDraftStatus,
  SupportDraftView,
  SupportPurpose,
} from '@/lib/support/conversation/model';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** A claimed draft is retried at most this many times before it is failed. */
export const SUPPORT_DRAFT_MAX_ATTEMPTS = 3;
/** A claim older than this is presumed dead (crashed worker) and may be re-claimed. */
const SUPPORT_DRAFT_LEASE_SECONDS = 300;

const VIEW_COLUMNS = `id, kind, status, body, confidence, citations, warnings, missing_facts, model,
       source_message_id, stale_reason, error, created_at, completed_at`;

function isoOf(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function jsonArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** One `support_drafts` row → the wire shape. */
function toSupportDraftView(row: Record<string, unknown>): SupportDraftView {
  return {
    id: Number(row.id),
    kind: row.kind as SupportDraftKind,
    status: row.status as SupportDraftStatus,
    body: (row.body as string | null) ?? null,
    confidence: (row.confidence as SupportDraftConfidence | null) ?? null,
    citations: jsonArray<SupportDraftCitation>(row.citations),
    warnings: jsonArray<string>(row.warnings),
    missingFacts: jsonArray<string>(row.missing_facts),
    model: (row.model as string | null) ?? null,
    sourceMessageId: row.source_message_id == null ? null : Number(row.source_message_id),
    staleReason: (row.stale_reason as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: isoOf(row.created_at) ?? new Date(0).toISOString(),
    completedAt: isoOf(row.completed_at),
  };
}

// ── Contract exports (CORE) ────────────────────────────────────────────────

/**
 * Queue a draft for this item + kind + boundary. Idempotent: an identical live
 * (pending | ready) draft wins and this returns null. Live drafts of the same
 * kind on an OLDER boundary go stale — they answer a message that is no longer
 * the newest.
 */
export async function enqueueSupportDraft(
  client: PoolClient,
  args: {
    orgId: OrgId;
    supportItemId: number;
    kind: SupportDraftKind;
    sourceMessageId: number | null;
    requestedByStaffId: number | null;
  },
): Promise<number | null> {
  await client.query(
    `UPDATE support_drafts
        SET status = 'stale', stale_reason = 'A newer customer message arrived.', stale_at = now(), updated_at = now()
      WHERE organization_id = $1 AND support_ticket_id = $2 AND kind = $3
        AND status IN ('pending','ready')
        AND COALESCE(source_message_id, 0) < COALESCE($4::bigint, 0)`,
    [args.orgId, args.supportItemId, args.kind, args.sourceMessageId],
  );
  const { rows } = await client.query<{ id: string | number }>(
    `INSERT INTO support_drafts (organization_id, support_ticket_id, kind, status, source_message_id, requested_by_staff_id)
     VALUES ($1, $2, $3, 'pending', $4, $5)
     ON CONFLICT (organization_id, support_ticket_id, kind, (COALESCE(source_message_id, 0)))
       WHERE status IN ('pending','ready')
       DO NOTHING
     RETURNING id`,
    [args.orgId, args.supportItemId, args.kind, args.sourceMessageId, args.requestedByStaffId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Every live (pending | ready) draft of the item — or of one kind — goes stale. Returns how many. */
export async function staleSupportDrafts(
  client: PoolClient,
  args: { orgId: OrgId; supportItemId: number; reason: string; kind?: SupportDraftKind },
): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE support_drafts
        SET status = 'stale', stale_reason = $3, stale_at = now(), updated_at = now()
      WHERE organization_id = $1 AND support_ticket_id = $2
        AND status IN ('pending','ready')
        AND ($4::text IS NULL OR kind = $4::text)`,
    [args.orgId, args.supportItemId, args.reason, args.kind ?? null],
  );
  return rowCount ?? 0;
}

/** The staffer sent / logged a reply from this draft. A draft with no body (pending, failed) cannot be used. */
export async function markSupportDraftUsed(
  client: PoolClient,
  args: { orgId: OrgId; draftId: number; messageId: number },
): Promise<void> {
  await client.query(
    `UPDATE support_drafts
        SET status = 'used', used_message_id = $3, updated_at = now()
      WHERE organization_id = $1 AND id = $2
        AND status IN ('ready','stale')
        AND length(btrim(coalesce(body, ''))) > 0`,
    [args.orgId, args.draftId, args.messageId],
  );
}

/** How many non-live drafts the record shows after the live ones. */
const RECENT_NON_LIVE = 5;

/** The newest live draft per kind, then the recent stale / failed ones. */
export function pickSupportDraftViews(views: readonly SupportDraftView[]): SupportDraftView[] {
  const live: SupportDraftView[] = [];
  const seenKinds = new Set<SupportDraftKind>();
  for (const v of views) {
    if ((v.status === 'pending' || v.status === 'ready') && !seenKinds.has(v.kind)) {
      seenKinds.add(v.kind);
      live.push(v);
    }
  }
  const recent = views.filter((v) => v.status === 'stale' || v.status === 'failed').slice(0, RECENT_NON_LIVE);
  return [...live, ...recent];
}

export async function listSupportDraftViews(orgId: OrgId, supportItemId: number): Promise<SupportDraftView[]> {
  const { rows } = await tenantQuery(
    orgId,
    `SELECT ${VIEW_COLUMNS}
       FROM support_drafts
      WHERE organization_id = $1 AND support_ticket_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 30`,
    [orgId, supportItemId],
  );
  return pickSupportDraftViews(rows.map(toSupportDraftView));
}

// ── Worker side (process.ts) ───────────────────────────────────────────────

export interface ClaimedSupportDraft {
  id: number;
  supportItemId: number;
  kind: SupportDraftKind;
  sourceMessageId: number | null;
  requestedByStaffId: number | null;
  attempts: number;
}

/**
 * Claim up to `limit` pending drafts: unclaimed ones, or ones whose lease ran
 * out under the attempts cap. Concurrent workers skip each other's rows (SKIP
 * LOCKED) and a claimed row is invisible to them until its lease expires.
 * Rows that exhausted their attempts and whose lease ran out are failed.
 */
export async function claimPendingSupportDrafts(
  client: PoolClient,
  args: { orgId: OrgId; supportItemId?: number; limit: number },
): Promise<ClaimedSupportDraft[]> {
  const item = args.supportItemId ?? null;
  await client.query(
    `UPDATE support_drafts
        SET status = 'failed', error = COALESCE(error, 'Drafting did not finish after ' || attempts || ' attempts.'),
            completed_at = now(), updated_at = now()
      WHERE organization_id = $1 AND status = 'pending'
        AND attempts >= $2 AND updated_at < now() - make_interval(secs => $3)
        AND ($4::bigint IS NULL OR support_ticket_id = $4::bigint)`,
    [args.orgId, SUPPORT_DRAFT_MAX_ATTEMPTS, SUPPORT_DRAFT_LEASE_SECONDS, item],
  );
  const { rows } = await client.query(
    `WITH pick AS (
       SELECT id FROM support_drafts
        WHERE organization_id = $1 AND status = 'pending' AND attempts < $2
          AND (attempts = 0 OR updated_at < now() - make_interval(secs => $3))
          AND ($4::bigint IS NULL OR support_ticket_id = $4::bigint)
        ORDER BY created_at, id
        LIMIT $5
        FOR UPDATE SKIP LOCKED
     )
     UPDATE support_drafts d
        SET attempts = d.attempts + 1, updated_at = now()
       FROM pick
      WHERE d.id = pick.id AND d.organization_id = $1
     RETURNING d.id, d.support_ticket_id, d.kind, d.source_message_id, d.requested_by_staff_id, d.attempts`,
    [args.orgId, SUPPORT_DRAFT_MAX_ATTEMPTS, SUPPORT_DRAFT_LEASE_SECONDS, item, args.limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    supportItemId: Number(r.support_ticket_id),
    kind: r.kind as SupportDraftKind,
    sourceMessageId: r.source_message_id == null ? null : Number(r.source_message_id),
    requestedByStaffId: r.requested_by_staff_id == null ? null : Number(r.requested_by_staff_id),
    attempts: Number(r.attempts),
  }));
}

export type OpenSupportDraftResult = { ok: true; draftId: number } | { ok: false; reason: 'draft_in_progress' };

/**
 * "Draft with AI" now: take over the live draft for this boundary, or start a
 * fresh one. An unclaimed pending row is claimed; a ready one is discarded and
 * replaced (the staffer asked for a new draft); a row another worker holds
 * under a live lease is left alone (409).
 */
export async function openSupportDraftNow(
  client: PoolClient,
  args: { orgId: OrgId; supportItemId: number; kind: SupportDraftKind; sourceMessageId: number | null; staffId: number | null },
): Promise<OpenSupportDraftResult> {
  const { rows } = await client.query(
    `SELECT id, status, attempts, (updated_at >= now() - make_interval(secs => $5)) AS leased
       FROM support_drafts
      WHERE organization_id = $1 AND support_ticket_id = $2 AND kind = $3
        AND COALESCE(source_message_id, 0) = COALESCE($4::bigint, 0)
        AND status IN ('pending','ready')
      FOR UPDATE`,
    [args.orgId, args.supportItemId, args.kind, args.sourceMessageId, SUPPORT_DRAFT_LEASE_SECONDS],
  );
  const live = rows[0];
  if (live?.status === 'pending' && Number(live.attempts) > 0 && live.leased) {
    return { ok: false, reason: 'draft_in_progress' };
  }
  if (live?.status === 'pending') {
    await client.query(
      `UPDATE support_drafts SET attempts = attempts + 1, requested_by_staff_id = COALESCE($3, requested_by_staff_id), updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [args.orgId, live.id, args.staffId],
    );
    return { ok: true, draftId: Number(live.id) };
  }
  if (live?.status === 'ready') {
    await client.query(
      `UPDATE support_drafts SET status = 'discarded', stale_reason = 'Replaced by a new draft.', updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [args.orgId, live.id],
    );
  }
  const id = await enqueueSupportDraft(client, {
    orgId: args.orgId,
    supportItemId: args.supportItemId,
    kind: args.kind,
    sourceMessageId: args.sourceMessageId,
    requestedByStaffId: args.staffId,
  });
  if (id == null) return { ok: false, reason: 'draft_in_progress' };
  await client.query(`UPDATE support_drafts SET attempts = 1 WHERE organization_id = $1 AND id = $2`, [args.orgId, id]);
  return { ok: true, draftId: id };
}

/** What generation produced for a claimed draft. */
export type SupportDraftOutcome =
  | {
      ok: true;
      body: string;
      confidence: SupportDraftConfidence;
      citations: SupportDraftCitation[];
      warnings: string[];
      missingFacts: string[];
      model: string;
      sourceMessageCount: number;
    }
  | { ok: false; error: string; retryable: boolean };

export type SupportDraftCompletion =
  | { status: 'ready' }
  | { status: 'stale'; reason: string }
  | { status: 'failed'; error: string }
  /** Left pending for the next sweep (retryable failure under the cap). */
  | { status: 'pending' }
  /** The row changed under us (staled, discarded) — leave it. */
  | { status: 'skip' };

/**
 * Pure: what a claimed draft becomes. The boundary rule is the load-bearing
 * one — a draft written for message N is never `ready` once a newer inbound
 * message exists (or, for a check-in, once the customer has written at all).
 */
export function decideDraftCompletion(input: {
  current: { status: SupportDraftStatus; sourceMessageId: number | null; attempts: number };
  purpose: SupportPurpose;
  newestInboundId: number | null;
  outcome: { ok: true } | { ok: false; error: string; retryable: boolean };
  retryOnFailure: boolean;
}): SupportDraftCompletion {
  const { current, outcome } = input;
  if (current.status !== 'pending') return { status: 'skip' };
  if (input.purpose !== 'customer_conversation') {
    return { status: 'stale', reason: 'The conversation is no longer marked as a customer conversation.' };
  }
  if ((input.newestInboundId ?? null) !== (current.sourceMessageId ?? null)) {
    return {
      status: 'stale',
      reason: current.sourceMessageId == null ? 'The customer has written since — a reply draft replaces the check-in.' : 'A newer customer message arrived.',
    };
  }
  if (outcome.ok) return { status: 'ready' };
  if (input.retryOnFailure && outcome.retryable && current.attempts < SUPPORT_DRAFT_MAX_ATTEMPTS) return { status: 'pending' };
  return { status: 'failed', error: outcome.error };
}

/**
 * Lock the draft, re-read its item's purpose and newest inbound message, decide,
 * and write. Returns the decision and the stored view.
 */
export async function completeSupportDraft(
  client: PoolClient,
  args: { orgId: OrgId; draftId: number; outcome: SupportDraftOutcome; retryOnFailure: boolean },
): Promise<{ completion: SupportDraftCompletion; view: SupportDraftView | null }> {
  const { rows } = await client.query(
    `SELECT d.status, d.source_message_id, d.attempts, st.purpose,
            (SELECT tm.id
               FROM entity_threads et
               JOIN thread_messages tm ON tm.organization_id = et.organization_id AND tm.thread_id = et.id
              WHERE et.organization_id = d.organization_id AND et.entity_type = 'SUPPORT_TICKET'
                AND et.entity_id = d.support_ticket_id
                AND tm.direction = 'inbound' AND tm.deleted_at IS NULL
              ORDER BY COALESCE(tm.occurred_at, tm.created_at) DESC, tm.id DESC
              LIMIT 1) AS newest_inbound_id
       FROM support_drafts d
       JOIN support_tickets st ON st.organization_id = d.organization_id AND st.id = d.support_ticket_id
      WHERE d.organization_id = $1 AND d.id = $2
      FOR UPDATE OF d`,
    [args.orgId, args.draftId],
  );
  const row = rows[0];
  if (!row) return { completion: { status: 'skip' }, view: null };

  const outcome = args.outcome;
  const completion = decideDraftCompletion({
    current: {
      status: row.status as SupportDraftStatus,
      sourceMessageId: row.source_message_id == null ? null : Number(row.source_message_id),
      attempts: Number(row.attempts),
    },
    purpose: row.purpose as SupportPurpose,
    newestInboundId: row.newest_inbound_id == null ? null : Number(row.newest_inbound_id),
    outcome: outcome.ok ? { ok: true } : outcome,
    retryOnFailure: args.retryOnFailure,
  });

  let written: Record<string, unknown> | undefined;
  if (completion.status === 'ready' && outcome.ok) {
    ({ rows: [written] } = await client.query(
      `UPDATE support_drafts
          SET status = 'ready', body = $3, confidence = $4, citations = $5::jsonb, warnings = $6::jsonb,
              missing_facts = $7::jsonb, model = $8, source_message_count = $9, error = NULL,
              completed_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${VIEW_COLUMNS}`,
      [
        args.orgId,
        args.draftId,
        outcome.body,
        outcome.confidence,
        JSON.stringify(outcome.citations),
        JSON.stringify(outcome.warnings),
        JSON.stringify(outcome.missingFacts),
        outcome.model,
        outcome.sourceMessageCount,
      ],
    ));
  } else if (completion.status === 'stale') {
    ({ rows: [written] } = await client.query(
      `UPDATE support_drafts SET status = 'stale', stale_reason = $3, stale_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${VIEW_COLUMNS}`,
      [args.orgId, args.draftId, completion.reason],
    ));
  } else if (completion.status === 'failed') {
    ({ rows: [written] } = await client.query(
      `UPDATE support_drafts SET status = 'failed', error = $3, completed_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${VIEW_COLUMNS}`,
      [args.orgId, args.draftId, completion.error.slice(0, 1000)],
    ));
  } else if (completion.status === 'pending' && !outcome.ok) {
    ({ rows: [written] } = await client.query(
      `UPDATE support_drafts SET error = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2
        RETURNING ${VIEW_COLUMNS}`,
      [args.orgId, args.draftId, outcome.error.slice(0, 1000)],
    ));
  }
  return { completion, view: written ? toSupportDraftView(written) : null };
}
