/** notification-outbox worker — drains notification_outbox into staff_inbox_items. */

import type { OrgId } from '@/lib/tenancy/constants';
import type { QueryResult, QueryResultRow } from 'pg';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import {
  ENTITY_VIEW_PERMISSION,
  NOTIFIABLE_EVENTS,
  buildCollapseKey,
  buildDedupKey,
  isNotifiableEntityType,
  notifiableEvent,
} from './event-vocabulary';

/** The arrival a pre-arrival tracking watch was written to wait on. */
const ARRIVAL_EVENT_KEY = NOTIFIABLE_EVENTS['receiving.carton.arrived'].key;

/** Events on the same collapse_key inside this window fold into one row. */
const COLLAPSE_WINDOW_MS = 60_000;

export interface FanoutDeps {
  /** Owner-pool query — cross-org claim/mark only. */
  ownerQuery: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  /** Org-scoped query (GUC + explicit org filter) for everything else. */
  orgQuery: <T extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  /** Permissions for a staffer, used as the write-time prefilter. */
  loadPermissions: (orgId: OrgId, staffIds: number[]) => Promise<Map<number, string[]>>;
  /** Live mirror of a durable row onto the recipient's inbox channel. */
  publishInboxItem: (args: {
    orgId: OrgId;
    staffId: number;
    itemId: number;
    entityType: string;
    entityId: number;
    eventKey: string;
    actorStaffId: number | null;
  }) => Promise<void>;
  now: () => Date;
}

/** Real collaborators, resolved by DYNAMIC import. */
const defaultFanoutDeps: FanoutDeps = {
  ownerQuery: async (text, params) => {
    const { default: pool } = await import('@/lib/db');
    return pool.query(text, params as unknown[] | undefined);
  },
  orgQuery: async (orgId, text, params) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    return tenantQuery(orgId, text, params);
  },
  loadPermissions: (orgId, staffIds) => loadStaffPermissions(orgId, staffIds),
  // Dynamic for the same reason as the pool above: `@/lib/realtime/publish`
  // pulls the Ably server SDK and the db-backed org lookup, neither of which
  // may enter the module graph of a node:test process.
  publishInboxItem: async (args) => {
    const { publishInboxItem } = await import('@/lib/realtime/publish');
    await publishInboxItem({
      organizationId: args.orgId,
      recipientId: args.staffId,
      itemId: args.itemId,
      entityType: args.entityType,
      entityId: args.entityId,
      eventKey: args.eventKey,
      actorStaffId: args.actorStaffId,
    });
  },
  now: () => new Date(),
};

export interface FanoutResult {
  claimed: number;
  skippedNotNotifiable: number;
  delivered: number;
  collapsed: number;
  failed: number;
}

export async function drainNotificationOutbox(
  args: { batchSize?: number } = {},
  deps: FanoutDeps = defaultFanoutDeps,
): Promise<FanoutResult> {
  const batchSize = Math.min(Math.max(args.batchSize ?? 50, 1), 200);
  const result: FanoutResult = {
    claimed: 0,
    skippedNotNotifiable: 0,
    delivered: 0,
    collapsed: 0,
    failed: 0,
  };

  // Claim window: SKIP LOCKED means two overlapping cron invocations split the
  // queue instead of double-delivering it.
  const claimed = await deps.ownerQuery<OutboxRow>(
    `UPDATE notification_outbox
        SET claimed_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM notification_outbox
         WHERE processed_at IS NULL
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      RETURNING id, organization_id, ops_event_id, entity_type, entity_id,
                event_key, actor_staff_id, client_event_id, payload, occurred_at`,
    [batchSize],
  );

  result.claimed = claimed.rows.length;

  for (const row of claimed.rows) {
    try {
      const outcome = await processOutboxRow(row, deps);
      result.delivered += outcome.delivered;
      result.collapsed += outcome.collapsed;
      if (outcome.skipped) result.skippedNotNotifiable += 1;
      await deps.ownerQuery(
        `UPDATE notification_outbox SET processed_at = now(), last_error = NULL WHERE id = $1`,
        [row.id],
      );
    } catch (err) {
      result.failed += 1;
      // Leave processed_at NULL so the row retries; attempts records the try.
      await deps.ownerQuery(`UPDATE notification_outbox SET last_error = $2 WHERE id = $1`, [
        row.id,
        err instanceof Error ? err.message : String(err),
      ]);
    }
  }

  return result;
}

interface RowOutcome {
  delivered: number;
  collapsed: number;
  skipped: boolean;
}

async function processOutboxRow(row: OutboxRow, deps: FanoutDeps): Promise<RowOutcome> {
  const def = notifiableEvent(row.event_key);
  // Not notifiable → mark processed and move on. This is the ONE place the
  // vocabulary is applied, which is why the DB trigger needs no flag column.
  if (!def || !isNotifiableEntityType(row.entity_type)) {
    return { delivered: 0, collapsed: 0, skipped: true };
  }

  const orgId = row.organization_id as OrgId;
  const entityId = Number(row.entity_id);
  const facts = readMatchFacts(row.payload);
  const recipients = await resolveRecipients(
    {
      orgId,
      entityType: row.entity_type,
      entityId,
      eventKey: row.event_key,
      ...facts,
    },
    deps,
  );

  // You are not notified about your own action.
  const targets = recipients.filter((r) => r.staffId !== row.actor_staff_id);
  if (targets.length === 0) {
    // Nothing to deliver, but the watch is still FULFILLED — the commonest
    // case is the watcher scanning their own package at the door.
    await retireFulfilledTrackingWatches(orgId, row.event_key, facts, deps);
    return { delivered: 0, collapsed: 0, skipped: false };
  }

  const permsByStaff = await deps.loadPermissions(
    orgId,
    targets.map((t) => t.staffId),
  );
  const needed = ENTITY_VIEW_PERMISSION[row.entity_type];

  const dedupKey = buildDedupKey({
    clientEventId: row.client_event_id,
    opsEventId: Number(row.ops_event_id),
  });
  const collapseKey = buildCollapseKey({
    eventKey: row.event_key,
    entityType: row.entity_type,
    entityId,
    payload: row.payload,
  });
  const occurredAt = row.occurred_at;
  const collapseFloor = new Date(new Date(occurredAt).getTime() - COLLAPSE_WINDOW_MS);

  let delivered = 0;
  let collapsed = 0;

  for (const target of targets) {
    // Write-time permission prefilter. NOT the authoritative gate — see
    // inbox.ts, which re-filters at read time so a later revoke also applies.
    const perms = permsByStaff.get(target.staffId) ?? [];
    if (!perms.includes(needed)) continue;

    // Collapse first: fold into an OPEN row on the same key inside the window
    // (12× unbox scans on carton 4412 = one row, not twelve). Keyed on the
    // carton for line events, so a 200-line PO receive stays one row.
    const folded = await deps.orgQuery(
      orgId,
      `UPDATE staff_inbox_items
          SET collapse_count = collapse_count + 1,
              last_event_at = GREATEST(last_event_at, $4::timestamptz),
              state = CASE WHEN state = 'read' THEN 'unread' ELSE state END,
              updated_at = now()
        WHERE id = (
          SELECT id FROM staff_inbox_items
           WHERE organization_id = $1
             AND staff_id = $2
             AND collapse_key = $3
             AND state IN ('unread','read')
             AND last_event_at >= $5::timestamptz
           ORDER BY last_event_at DESC
           LIMIT 1
        )`,
      [orgId, target.staffId, collapseKey, occurredAt, collapseFloor],
    );

    if ((folded.rowCount ?? 0) > 0) {
      collapsed += 1;
      continue;
    }

    const inserted = await deps.orgQuery<{ id: string | number }>(
      orgId,
      `INSERT INTO staff_inbox_items
         (organization_id, staff_id, subscription_id, entity_type, entity_id,
          event_key, actor_staff_id, reason, payload, dedup_key, collapse_key,
          state, occurred_at, last_event_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unread', $12, $12)
       ON CONFLICT (organization_id, staff_id, dedup_key) DO NOTHING
       RETURNING id`,
      [
        orgId,
        target.staffId,
        target.subscriptionId,
        row.entity_type,
        entityId,
        row.event_key,
        row.actor_staff_id,
        target.reason,
        row.payload ?? null,
        dedupKey,
        collapseKey,
        occurredAt,
      ],
    );
    delivered += inserted.rowCount ?? 0;

    // Only a genuinely NEW row is announced:
    const itemId = Number(inserted.rows[0]?.id);
    if (Number.isFinite(itemId) && itemId > 0) {
      try {
        await deps.publishInboxItem({
          orgId,
          staffId: target.staffId,
          itemId,
          entityType: row.entity_type,
          entityId,
          eventKey: row.event_key,
          actorStaffId: row.actor_staff_id,
        });
      } catch (err) {
        console.warn('[fanout] inbox push skipped:', err);
      }
    }
  }

  // Retired only after every insert has landed. Retiring earlier would mean a
  // row that throws mid-loop comes back on retry to an empty recipient set —
  // the watcher would lose the notification the retry existed to deliver.
  await retireFulfilledTrackingWatches(orgId, row.event_key, facts, deps);

  return { delivered, collapsed, skipped: false };
}

interface Recipient {
  staffId: number;
  subscriptionId: number;
  reason: string;
}

/** Entity subscribers ∪ rule matches for one event. */
interface MatchFacts {
  sku: string | null;
  trackingNormalized: string | null;
}

/** The narrowing facts an event carries, read from its outbox payload. */
function readMatchFacts(payload: unknown): MatchFacts {
  const p = (payload ?? {}) as Record<string, unknown>;
  const sku = typeof p.sku === 'string' && p.sku.trim() ? p.sku.trim() : null;
  const rawTracking =
    typeof p.trackingNumber === 'string' && p.trackingNumber.trim()
      ? p.trackingNumber.trim()
      : null;
  return {
    sku,
    trackingNormalized: rawTracking
      ? extractCanonicalTracking(rawTracking) || rawTracking
      : null,
  };
}

/** A fulfilled pre-arrival tracking watch retires itself. */
async function retireFulfilledTrackingWatches(
  orgId: OrgId,
  eventKey: string,
  facts: MatchFacts,
  deps: FanoutDeps,
): Promise<void> {
  if (eventKey !== ARRIVAL_EVENT_KEY || !facts.trackingNormalized) return;
  await deps.orgQuery(
    orgId,
    `UPDATE staff_subscriptions
        SET state = 'muted', updated_at = now()
      WHERE organization_id = $1
        AND subscription_kind = 'rule'
        AND match_tracking_normalized = $2
        AND state <> 'muted'`,
    [orgId, facts.trackingNormalized],
  );
}

async function resolveRecipients(
  args: {
    orgId: OrgId;
    entityType: string;
    entityId: number;
    eventKey: string;
    sku?: string | null;
    trackingNormalized?: string | null;
  },
  deps: FanoutDeps = defaultFanoutDeps,
): Promise<Recipient[]> {
  const res = await deps.orgQuery<RecipientRow>(
    args.orgId,
    `SELECT DISTINCT ON (staff_id) staff_id, id AS subscription_id, reason
       FROM (
         SELECT staff_id, id, reason, 0 AS arm
           FROM staff_subscriptions
          WHERE organization_id = $1
            AND subscription_kind = 'entity'
            AND state <> 'muted'
            AND entity_type = $2
            AND entity_id = $3
         UNION ALL
         SELECT staff_id, id, reason, 1 AS arm
           FROM staff_subscriptions
          WHERE organization_id = $1
            AND subscription_kind = 'rule'
            AND state <> 'muted'
            AND $4 = ANY(match_event_keys)
            AND (match_sku IS NULL OR match_sku = $5)
            AND (match_tracking_normalized IS NULL
                 OR match_tracking_normalized = $6)
       ) matches
      ORDER BY staff_id, arm`,
    [
      args.orgId,
      args.entityType,
      args.entityId,
      args.eventKey,
      args.sku ?? null,
      args.trackingNormalized ?? null,
    ],
  );

  return res.rows.map((r) => ({
    staffId: Number(r.staff_id),
    subscriptionId: Number(r.subscription_id),
    reason: r.reason,
  }));
}

/** Effective permissions per recipient. */
async function loadStaffPermissions(
  orgId: OrgId,
  staffIds: number[],
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (staffIds.length === 0) return out;

  // Dynamic for the same reason as defaultFanoutDeps — these pull the pool.
  const [{ tenantQuery }, { loadRolesForStaff }, { computeEffectivePermissions }] =
    await Promise.all([
      import('@/lib/tenancy/db'),
      import('@/lib/auth/role-store'),
      import('@/lib/auth/permissions-shared'),
    ]);

  const overrides = await tenantQuery<{
    id: number | string;
    permissions_added: string[] | null;
    permissions_removed: string[] | null;
  }>(
    orgId,
    `SELECT id, permissions_added, permissions_removed
       FROM staff
      WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [orgId, staffIds],
  );

  const overrideById = new Map(overrides.rows.map((r) => [Number(r.id), r]));

  await Promise.all(
    staffIds.map(async (staffId) => {
      const roles = await loadRolesForStaff(staffId, orgId);
      const ov = overrideById.get(staffId);
      const effective = computeEffectivePermissions(
        roles,
        ov?.permissions_added ?? [],
        ov?.permissions_removed ?? [],
      );
      out.set(staffId, [...effective]);
    }),
  );

  return out;
}

interface OutboxRow {
  id: number | string;
  organization_id: string;
  ops_event_id: number | string;
  entity_type: string;
  entity_id: number | string;
  event_key: string;
  actor_staff_id: number | null;
  client_event_id: string | null;
  occurred_at: string;
  payload?: unknown;
}

interface RecipientRow {
  staff_id: number | string;
  subscription_id: number | string;
  reason: string;
}
