/**
 * Inbox read + triage domain helpers.
 *
 * The read path re-applies the per-entity permission gate. That is not
 * belt-and-braces: the fan-out worker's filter is a WRITE-time snapshot, so a
 * permission revoked AFTER delivery would leave the row readable forever. The
 * authoritative gate is here, at render — the same place GitHub filters.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  ENTITY_VIEW_PERMISSION,
  NOTIFIABLE_ENTITY_TYPES,
  eventLabelFor,
  type NotifiableEntityType,
} from './event-vocabulary';
import { notificationHref } from './notification-href';
import type { InboxFeedDto, InboxItemDto, InboxState, InboxTriageAction } from './types';

interface InboxDeps {
  query: <T extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  now: () => Date;
}

const defaultInboxDeps: InboxDeps = {
  query: tenantQuery,
  now: () => new Date(),
};

export type InboxFilter = 'active' | 'unread' | 'done' | 'snoozed';

/**
 * Visible entity types for this staffer. Pushed INTO the SQL as an ANY(...)
 * rather than filtered in JS after the fact, so the page size the operator
 * asked for is the page size they get (post-filtering a LIMIT silently returns
 * short pages), and so a staffer with no visible types costs zero rows.
 */
function visibleEntityTypes(permissions: readonly string[]): NotifiableEntityType[] {
  return NOTIFIABLE_ENTITY_TYPES.filter((t) => permissions.includes(ENTITY_VIEW_PERMISSION[t]));
}

export async function getInboxFeed(
  args: {
    orgId: OrgId;
    staffId: number;
    permissions: readonly string[];
    filter?: InboxFilter;
    limit?: number;
  },
  deps: InboxDeps = defaultInboxDeps,
): Promise<InboxFeedDto> {
  const allowed = visibleEntityTypes(args.permissions);
  if (allowed.length === 0) return { items: [], counts: { unread: 0, snoozed: 0 } };

  const filter: InboxFilter = args.filter ?? 'active';
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const now = deps.now();

  // 'active' = what needs attention now: unread/read, plus snoozes that have
  // come due. Resolving due snoozes in the READ makes a snooze-sweep cron
  // unnecessary — the feed can never be stale by a cron tick, and there is no
  // second writer racing the triage endpoint for the same rows.
  //
  // Both branches live in ONE parameterized statement that references every
  // placeholder. Swapping the fragment instead would leave $4 or $5 unbound —
  // and pg errors on a bind with more parameters than the statement uses.
  const rows = await deps.query<InboxRow>(
    args.orgId,
    `SELECT i.id, i.entity_type, i.entity_id, i.event_key, i.reason, i.state,
            i.collapse_count, i.snoozed_until, i.occurred_at, i.last_event_at,
            i.actor_staff_id, i.subscription_id,
            -- Live follow state for the row's bell. Joined on the ENTITY, not on
            -- subscription_id, so a row whose subscription was deleted still
            -- reports correctly (and a re-follow is picked up).
            sub.state AS subscription_state
       FROM staff_inbox_items i
       LEFT JOIN staff_subscriptions sub
              ON sub.organization_id = i.organization_id
             AND sub.staff_id = i.staff_id
             AND sub.subscription_kind = 'entity'
             AND sub.entity_type = i.entity_type
             AND sub.entity_id = i.entity_id
      WHERE i.organization_id = $1
        AND i.staff_id = $2
        AND i.entity_type = ANY($3::text[])
        AND (
          ($5 = 'active' AND (
             i.state IN ('unread','read')
             OR (i.state = 'snoozed' AND i.snoozed_until <= $4)
           ))
          OR ($5 <> 'active' AND i.state = $5)
        )
      ORDER BY i.last_event_at DESC, i.id DESC
      LIMIT $6`,
    [args.orgId, args.staffId, allowed, now, filter, limit],
  );

  const counts = await deps.query<{ state: string; n: string }>(
    args.orgId,
    `SELECT state, COUNT(*)::text AS n
       FROM staff_inbox_items
      WHERE organization_id = $1
        AND staff_id = $2
        AND entity_type = ANY($3::text[])
        AND state IN ('unread','snoozed')
      GROUP BY state`,
    [args.orgId, args.staffId, allowed],
  );

  const byState = new Map(counts.rows.map((r) => [r.state, Number(r.n)]));

  return {
    items: rows.rows.map(toItemDto),
    counts: {
      unread: byState.get('unread') ?? 0,
      snoozed: byState.get('snoozed') ?? 0,
    },
  };
}

type TriageOutcome = 'ok' | 'not_found' | 'forbidden';

/**
 * Apply a triage verb to one row. Scoped to `staffId` in the WHERE clause, so
 * a staffer can never triage someone else's inbox row even with a guessed id —
 * the 404 is indistinguishable from "not yours", which is the intent.
 */
export async function triageInboxItem(
  args: {
    orgId: OrgId;
    staffId: number;
    itemId: number;
    action: InboxTriageAction;
    /** Snooze duration; defaults to 24h — the Linear/GitHub convention. */
    snoozeHours?: number;
    permissions: readonly string[];
  },
  deps: InboxDeps = defaultInboxDeps,
): Promise<TriageOutcome> {
  const allowed = visibleEntityTypes(args.permissions);
  if (allowed.length === 0) return 'forbidden';

  const nextState: InboxState =
    args.action === 'done'
      ? 'done'
      : args.action === 'snooze'
        ? 'snoozed'
        : args.action === 'unread'
          ? 'unread'
          : 'read';

  const snoozedUntil =
    nextState === 'snoozed'
      ? new Date(deps.now().getTime() + (args.snoozeHours ?? 24) * 3_600_000)
      : null;

  const res = await deps.query(
    args.orgId,
    `UPDATE staff_inbox_items
        SET state = $4,
            snoozed_until = $5,
            updated_at = now()
      WHERE organization_id = $1
        AND staff_id = $2
        AND id = $3
        AND entity_type = ANY($6::text[])`,
    [args.orgId, args.staffId, args.itemId, nextState, snoozedUntil, allowed],
  );

  return (res.rowCount ?? 0) > 0 ? 'ok' : 'not_found';
}

interface InboxRow {
  id: number | string;
  entity_type: string;
  entity_id: number | string;
  event_key: string;
  reason: string;
  state: string;
  collapse_count: number;
  snoozed_until: Date | string | null;
  occurred_at: Date | string;
  last_event_at: Date | string;
  actor_staff_id: number | null;
  subscription_id: number | string | null;
  subscription_state: string | null;
}

function toItemDto(row: InboxRow): InboxItemDto {
  const entityId = Number(row.entity_id);
  return {
    id: Number(row.id),
    entityType: row.entity_type,
    entityId,
    eventKey: row.event_key,
    // Resolved at READ time from the vocabulary — never a stored, stale string.
    // `eventLabelFor` covers both registries (subscription-fanned domain events
    // and directly-addressed acts like a thrown task), so the read path never
    // has to know which one owns the key.
    eventLabel: eventLabelFor(row.event_key),
    reason: row.reason as InboxItemDto['reason'],
    state: row.state as InboxState,
    collapseCount: row.collapse_count,
    snoozedUntil: toIso(row.snoozed_until),
    occurredAt: toIso(row.occurred_at) ?? new Date(0).toISOString(),
    lastEventAt: toIso(row.last_event_at) ?? new Date(0).toISOString(),
    actorStaffId: row.actor_staff_id,
    href: notificationHref(row.entity_type, entityId),
    subscriptionId: row.subscription_id == null ? null : Number(row.subscription_id),
    subscriptionState: (row.subscription_state as InboxItemDto['subscriptionState']) ?? null,
  };
}

function toIso(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
