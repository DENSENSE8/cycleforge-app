/**
 * ticket-outbox — a transactional outbox for helpdesk work.
 *
 * WHY THIS EXISTS
 * `submitRepairIntake` wraps its ticket call in a `try/catch` that logs and
 * continues. Not blocking the counter on a helpdesk outage is CORRECT — an
 * operator with a customer in front of them must not be stopped by Zendesk being
 * down. Having no compensating mechanism is not: today that path produces a
 * repair with `ticket_number = NULL`, no retry, and no reconciliation surface.
 * The ticket is simply lost.
 *
 * SHAPE
 * Follows `entity_search_outbox` + `search-outbox-worker.ts` exactly — the house
 * precedent. No message bus, no new queue service:
 *
 *   enqueue (inline, cheap, never throws into the caller's path)
 *     → claim N pending rows (FOR UPDATE SKIP LOCKED, attempts+1)
 *     → do the provider work through the helpdesk CAPABILITY FACADE
 *     → link the ticket to its entity anchor
 *     → mark processed, or mark failed (released for retry until a cap)
 *
 * Cross-org claim/mark run on the owner pool (same posture as other cron
 * drains); every org-scoped read/write goes through the tenant helpers.
 *
 * Idempotent: `ux_ticket_work_outbox_pending` dedupes unclaimed rows, and the
 * provider create carries an idempotency key so a retry after a timeout that
 * actually succeeded does not mint a second ticket.
 *
 * NEVER import Zendesk here. Helpdesk access is `getHelpdeskProvider` only
 * (`.claude/rules/source-of-truth.md` → capability facades).
 */

import pool from '@/lib/db';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TicketLinkEntityType } from '@/lib/support/ticket-refs';

export const TICKET_WORK_TYPES = ['CREATE_TICKET', 'ATTACH_TICKET', 'POST_REPLY'] as const;

/** Mirrors `ticket_work_outbox_work_type_chk`. */
export type TicketWorkType = (typeof TICKET_WORK_TYPES)[number];

export function isTicketWorkType(value: string): value is TicketWorkType {
  return (TICKET_WORK_TYPES as readonly string[]).includes(value);
}

/** The create-ticket field bag / reply body. Variant config only. */
export interface TicketWorkPayload {
  subject?: string;
  body?: string;
  /**
   * `false` = internal note. Defaults to internal: an auto-posted reply that
   * reaches the customer is a decision the operator has to make deliberately,
   * not a default a retry sweep applies on their behalf.
   */
  publicReply?: boolean;
  requesterName?: string | null;
  requesterEmail?: string | null;
  tags?: string[];
  /** Dedupes the provider create across retries. */
  idempotencyKey?: string | null;
}

export interface EnqueueTicketWorkArgs {
  orgId: OrgId;
  workType: TicketWorkType;
  entityType: TicketLinkEntityType;
  entityId: number;
  /** Required for ATTACH / REPLY; must be absent for CREATE. */
  providerTicketId?: number | null;
  counterTransactionId?: number | null;
  payload?: TicketWorkPayload;
}

export interface TicketWorkClaim {
  id: number;
  organizationId: OrgId;
  workType: string;
  entityType: string;
  entityId: number;
  providerTicketId: number | null;
  counterTransactionId: number | null;
  payload: TicketWorkPayload;
}

export interface DrainTicketWorkResult {
  claimed: number;
  created: number;
  attached: number;
  replied: number;
  failed: number;
}

/**
 * After this many attempts a row dead-letters (`processed_at` stamped,
 * `last_error` kept). A poison row must never starve the queue head.
 */
const ATTEMPTS_CAP = 5;

/** A claim older than this is treated as a crashed drain and released. */
const STALE_CLAIM_MINUTES = 15;

// ── Enqueue ─────────────────────────────────────────────────────────────────

export interface EnqueueTicketWorkDeps {
  insert(args: EnqueueTicketWorkArgs): Promise<number | null>;
}

const defaultEnqueueDeps: EnqueueTicketWorkDeps = {
  async insert(args) {
    const res = await tenantQuery<{ id: string }>(
      args.orgId,
      `INSERT INTO ticket_work_outbox
         (organization_id, work_type, entity_type, entity_id,
          counter_transaction_id, provider_ticket_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (organization_id, work_type, entity_type, entity_id,
                    COALESCE(provider_ticket_id, -1))
         WHERE processed_at IS NULL AND claimed_at IS NULL
       DO NOTHING
       RETURNING id`,
      [
        args.orgId,
        args.workType,
        args.entityType,
        args.entityId,
        args.counterTransactionId ?? null,
        args.providerTicketId ?? null,
        JSON.stringify(args.payload ?? {}),
      ],
    );
    const id = res.rows[0]?.id;
    return id == null ? null : Number(id);
  },
};

/**
 * Queue helpdesk work for an entity.
 *
 * Returns the new row id, or null when an identical unclaimed row already
 * existed (a duplicate submit) — both are success from the caller's view.
 *
 * **Never throws.** This is called from the counter write path, where a queueing
 * failure must not fail a transaction the customer already paid for. A throw
 * here would defeat the entire purpose of the outbox.
 */
export async function enqueueTicketWork(
  args: EnqueueTicketWorkArgs,
  deps: EnqueueTicketWorkDeps = defaultEnqueueDeps,
): Promise<{ outboxId: number | null; queued: boolean }> {
  // Mirror the DB CHECK in code so a bad call is a clear log line rather than a
  // 23514 from inside a transaction the caller cannot interpret.
  if (args.workType === 'CREATE_TICKET' && args.providerTicketId != null) {
    console.warn('[ticket-outbox] CREATE_TICKET must not carry a provider ticket id — dropping');
    return { outboxId: null, queued: false };
  }
  if (args.workType !== 'CREATE_TICKET' && args.providerTicketId == null) {
    console.warn(`[ticket-outbox] ${args.workType} requires a provider ticket id — dropping`);
    return { outboxId: null, queued: false };
  }

  try {
    const outboxId = await deps.insert(args);
    return { outboxId, queued: true };
  } catch (err) {
    console.error('[ticket-outbox] enqueue failed (work is LOST, not retried)', err);
    return { outboxId: null, queued: false };
  }
}

// ── Drain ───────────────────────────────────────────────────────────────────

export interface TicketOutboxDeps {
  claimPending(limit: number): Promise<TicketWorkClaim[]>;
  /** Null when the org has no helpdesk connected — rows stay pending, not failed. */
  createTicket(
    orgId: OrgId,
    input: { subject: string; body: string; publicReply: boolean; requesterName: string | null; requesterEmail: string | null; tags: string[] },
    opts: { idempotencyKey?: string },
  ): Promise<{ providerTicketId: number } | null>;
  postReply(
    orgId: OrgId,
    providerTicketId: number,
    comment: { body: string; publicReply: boolean },
  ): Promise<boolean>;
  /** Link the provider ticket to its internal entity anchor. */
  linkAnchor(args: {
    orgId: OrgId;
    providerTicketId: number;
    entityType: string;
    entityId: number;
  }): Promise<void>;
  /** Stamp the resolved ticket number back onto the entity (best-effort). */
  stampEntityTicketNumber(args: {
    orgId: OrgId;
    entityType: string;
    entityId: number;
    providerTicketId: number;
  }): Promise<void>;
  markProcessed(ids: number[]): Promise<void>;
  markFailed(ids: number[], error: string): Promise<void>;
  /** Release a claim WITHOUT counting it as a failure (no provider configured). */
  releaseClaim(ids: number[]): Promise<void>;
}

const defaultDeps: TicketOutboxDeps = {
  async claimPending(limit) {
    // Crash recovery: a drain that died between claim and mark left claimed_at
    // set with processed_at NULL. Release those so the rows are claimable again
    // (attempts already counted the try).
    await pool.query(
      `UPDATE ticket_work_outbox
          SET claimed_at = NULL
        WHERE processed_at IS NULL
          AND claimed_at < now() - ($1::int * INTERVAL '1 minute')`,
      [STALE_CLAIM_MINUTES],
    );
    const res = await pool.query(
      `UPDATE ticket_work_outbox
          SET attempts = attempts + 1, claimed_at = now()
        WHERE id IN (
          SELECT id FROM ticket_work_outbox
           WHERE processed_at IS NULL AND claimed_at IS NULL AND attempts < $2
           ORDER BY id
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, organization_id, work_type, entity_type, entity_id,
                  provider_ticket_id, counter_transaction_id, payload`,
      [limit, ATTEMPTS_CAP],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      organizationId: String(r.organization_id) as OrgId,
      workType: String(r.work_type),
      entityType: String(r.entity_type),
      entityId: Number(r.entity_id),
      providerTicketId: r.provider_ticket_id == null ? null : Number(r.provider_ticket_id),
      counterTransactionId:
        r.counter_transaction_id == null ? null : Number(r.counter_transaction_id),
      payload: (r.payload ?? {}) as TicketWorkPayload,
    }));
  },

  async createTicket(orgId, input, opts) {
    const helpdesk = await getHelpdeskProvider(orgId);
    if (!helpdesk) return null;
    const ticket = await helpdesk.createTicket(
      {
        subject: input.subject,
        comment: { body: input.body, public: input.publicReply },
        tags: input.tags,
        ...(input.requesterName || input.requesterEmail
          ? {
              requester: {
                ...(input.requesterName ? { name: input.requesterName } : {}),
                ...(input.requesterEmail ? { email: input.requesterEmail } : {}),
              },
            }
          : {}),
      },
      opts,
    );
    return { providerTicketId: ticket.id };
  },

  async postReply(orgId, providerTicketId, comment) {
    const helpdesk = await getHelpdeskProvider(orgId);
    // false here means "nothing to retry yet" — the caller releases the claim
    // without burning an attempt.
    if (!helpdesk) return false;
    await helpdesk.addComment(providerTicketId, {
      body: comment.body,
      public: comment.publicReply,
    });
    // A null return is the provider's 404: the ticket no longer exists, so
    // retrying cannot fix it. Report done and let the row settle rather than
    // looping it to the attempts cap. A genuine transport failure throws, and
    // the drain's catch marks it failed for retry.
    return true;
  },

  async linkAnchor({ orgId, providerTicketId, entityType, entityId }) {
    // Imported lazily: ticket-link.ts pulls in the shipment/photo/zendesk graph,
    // and the drain only needs it when a row actually links.
    const { linkTicketToAnchor } = await import('@/lib/support/ticket-link');
    if (entityType !== 'REPAIR') {
      // Only REPAIR anchors are minted by this outbox today. Other entity types
      // are representable in the CHECK for future writers; refuse rather than
      // guess at an anchor shape.
      throw new Error(`ticket-outbox cannot link entity_type ${entityType} yet`);
    }
    await linkTicketToAnchor({
      orgId,
      ticketId: providerTicketId,
      anchor: { type: 'repair', repairId: entityId },
    });
  },

  async stampEntityTicketNumber({ orgId, entityType, entityId, providerTicketId }) {
    if (entityType !== 'REPAIR') return;
    // Only fill a NULL — never overwrite a number an operator or an earlier
    // successful call already put there.
    await tenantQuery(
      orgId,
      `UPDATE repair_service
          SET ticket_number = $1
        WHERE id = $2 AND organization_id = $3 AND ticket_number IS NULL`,
      [String(providerTicketId), entityId, orgId],
    );
  },

  async markProcessed(ids) {
    if (ids.length === 0) return;
    await pool.query(
      `UPDATE ticket_work_outbox
          SET processed_at = now(), last_error = NULL
        WHERE id = ANY($1::bigint[])`,
      [ids],
    );
  },

  async markFailed(ids, error) {
    if (ids.length === 0) return;
    // Release the claim so the row retries; once attempts hits the cap it
    // dead-letters instead of starving the queue head forever.
    await pool.query(
      `UPDATE ticket_work_outbox
          SET last_error = $2,
              claimed_at = NULL,
              processed_at = CASE WHEN attempts >= $3 THEN now() ELSE processed_at END
        WHERE id = ANY($1::bigint[])`,
      [ids, error.slice(0, 500), ATTEMPTS_CAP],
    );
  },

  async releaseClaim(ids) {
    if (ids.length === 0) return;
    // No provider configured is not a failure of THIS row — undo the attempt so
    // an unconnected tenant's queue doesn't dead-letter itself while it waits.
    await pool.query(
      `UPDATE ticket_work_outbox
          SET claimed_at = NULL,
              attempts = GREATEST(attempts - 1, 0)
        WHERE id = ANY($1::bigint[])`,
      [ids],
    );
  },
};

/**
 * Drain queued helpdesk work.
 *
 * One row = one unit of provider work. A row that fails is released for retry
 * (up to {@link ATTEMPTS_CAP}); a row whose org has no helpdesk connected is
 * released WITHOUT burning an attempt, because there is nothing to retry yet.
 */
export async function drainTicketWorkOutbox(
  opts: { batchSize?: number } = {},
  deps: TicketOutboxDeps = defaultDeps,
): Promise<DrainTicketWorkResult> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 25, 1), 200);
  const result: DrainTicketWorkResult = {
    claimed: 0,
    created: 0,
    attached: 0,
    replied: 0,
    failed: 0,
  };

  const claims = await deps.claimPending(batchSize);
  result.claimed = claims.length;
  if (claims.length === 0) return result;

  // An unknown work_type (a migration that landed ahead of the code deploy)
  // dead-letters rather than being re-claimed forever.
  const unknown = claims.filter((c) => !isTicketWorkType(c.workType));
  if (unknown.length > 0) {
    await deps.markFailed(
      unknown.map((c) => c.id),
      `unsupported work_type (worker predates it): ${[...new Set(unknown.map((c) => c.workType))].join(', ')}`,
    );
    result.failed += unknown.length;
  }

  for (const claim of claims.filter((c) => isTicketWorkType(c.workType))) {
    try {
      if (claim.workType === 'CREATE_TICKET') {
        const created = await deps.createTicket(
          claim.organizationId,
          {
            subject: claim.payload.subject?.trim() || `Counter service — ${claim.entityType} #${claim.entityId}`,
            body: claim.payload.body?.trim() || 'Created from a counter transaction.',
            // Internal by default — see TicketWorkPayload.publicReply.
            publicReply: claim.payload.publicReply === true,
            requesterName: claim.payload.requesterName ?? null,
            requesterEmail: claim.payload.requesterEmail ?? null,
            tags: claim.payload.tags ?? [],
          },
          claim.payload.idempotencyKey
            ? { idempotencyKey: claim.payload.idempotencyKey }
            : {},
        );
        if (!created) {
          await deps.releaseClaim([claim.id]);
          continue;
        }
        await deps.linkAnchor({
          orgId: claim.organizationId,
          providerTicketId: created.providerTicketId,
          entityType: claim.entityType,
          entityId: claim.entityId,
        });
        await deps.stampEntityTicketNumber({
          orgId: claim.organizationId,
          entityType: claim.entityType,
          entityId: claim.entityId,
          providerTicketId: created.providerTicketId,
        });
        await deps.markProcessed([claim.id]);
        result.created += 1;
        continue;
      }

      // ATTACH / REPLY both require a provider ticket. The DB CHECK guarantees
      // it, but a row written before that constraint existed would be null here.
      if (claim.providerTicketId == null) {
        await deps.markFailed([claim.id], `${claim.workType} row has no provider_ticket_id`);
        result.failed += 1;
        continue;
      }

      if (claim.workType === 'ATTACH_TICKET') {
        await deps.linkAnchor({
          orgId: claim.organizationId,
          providerTicketId: claim.providerTicketId,
          entityType: claim.entityType,
          entityId: claim.entityId,
        });
        await deps.stampEntityTicketNumber({
          orgId: claim.organizationId,
          entityType: claim.entityType,
          entityId: claim.entityId,
          providerTicketId: claim.providerTicketId,
        });
        await deps.markProcessed([claim.id]);
        result.attached += 1;
        continue;
      }

      // POST_REPLY
      const body = claim.payload.body?.trim();
      if (!body) {
        await deps.markFailed([claim.id], 'POST_REPLY row has an empty body');
        result.failed += 1;
        continue;
      }
      const posted = await deps.postReply(claim.organizationId, claim.providerTicketId, {
        body,
        publicReply: claim.payload.publicReply === true,
      });
      if (!posted) {
        await deps.releaseClaim([claim.id]);
        continue;
      }
      await deps.markProcessed([claim.id]);
      result.replied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await deps.markFailed([claim.id], message);
      result.failed += 1;
    }
  }

  return result;
}
