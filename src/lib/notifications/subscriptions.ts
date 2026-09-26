/** Subscription domain helpers. */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  ENTITY_VIEW_PERMISSION,
  isNotifiableEntityType,
  type NotifiableEntityType,
} from './event-vocabulary';
import type { SubscriptionDto, SubscriptionReason, SubscriptionState } from './types';

interface SubscriptionDeps {
  query: <T extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  transaction: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
}

const defaultSubscriptionDeps: SubscriptionDeps = {
  query: tenantQuery,
  transaction: withTenantTransaction,
};

type ToggleOutcome = 'subscribed' | 'muted' | 'forbidden' | 'invalid_entity';

interface ToggleResult {
  outcome: ToggleOutcome;
  subscription: SubscriptionDto | null;
}

/** Explicit subscribe / mute for one entity. */
export async function toggleEntitySubscription(
  args: {
    orgId: OrgId;
    staffId: number;
    entityType: string;
    entityId: number;
    /** Explicit target; omit to flip whatever the current state is. */
    desired?: 'subscribed' | 'muted';
    permissions: readonly string[];
    clientEventId?: string | null;
  },
  deps: SubscriptionDeps = defaultSubscriptionDeps,
): Promise<ToggleResult> {
  if (!isNotifiableEntityType(args.entityType)) {
    return { outcome: 'invalid_entity', subscription: null };
  }
  if (!canViewEntityType(args.entityType, args.permissions)) {
    // Write-time gate: you cannot subscribe to what you cannot open.
    return { outcome: 'forbidden', subscription: null };
  }

  return deps.transaction(args.orgId, async (client) => {
    const existing = await client.query<SubscriptionRow>(
      `SELECT id, subscription_kind, state, reason, entity_type, entity_id,
              match_event_keys, match_sku
         FROM staff_subscriptions
        WHERE organization_id = $1
          AND staff_id = $2
          AND subscription_kind = 'entity'
          AND entity_type = $3
          AND entity_id = $4
        LIMIT 1`,
      [args.orgId, args.staffId, args.entityType, args.entityId],
    );

    const current = existing.rows[0] ?? null;
    const nextState: SubscriptionState =
      args.desired ?? (current && current.state !== 'muted' ? 'muted' : 'subscribed');

    // Re-entering the same state is a no-op (idempotency), not a flip.
    if (current && current.state === nextState) {
      return {
        outcome: nextState === 'muted' ? ('muted' as const) : ('subscribed' as const),
        subscription: toDto(current),
      };
    }

    const upserted = await client.query<SubscriptionRow>(
      `INSERT INTO staff_subscriptions
         (organization_id, staff_id, subscription_kind, state, reason, entity_type, entity_id)
       VALUES ($1, $2, 'entity', $3, 'manual', $4, $5)
       ON CONFLICT (organization_id, staff_id, entity_type, entity_id)
         WHERE subscription_kind = 'entity'
       DO UPDATE SET state = EXCLUDED.state,
                     reason = 'manual',
                     updated_at = now()
       RETURNING id, subscription_kind, state, reason, entity_type, entity_id,
                 match_event_keys, match_sku`,
      [args.orgId, args.staffId, nextState, args.entityType, args.entityId],
    );

    const row = upserted.rows[0];
    return {
      outcome: nextState === 'muted' ? ('muted' as const) : ('subscribed' as const),
      subscription: row ? toDto(row) : null,
    };
  });
}

/** The bell's state for one entity: is THIS staffer following it right now. */
export async function getEntitySubscription(
  args: { orgId: OrgId; staffId: number; entityType: string; entityId: number },
  deps: SubscriptionDeps = defaultSubscriptionDeps,
): Promise<SubscriptionDto | null> {
  if (!isNotifiableEntityType(args.entityType)) return null;
  const res = await deps.query<SubscriptionRow>(
    args.orgId,
    `SELECT id, subscription_kind, state, reason, entity_type, entity_id,
            match_event_keys, match_sku
       FROM staff_subscriptions
      WHERE organization_id = $1 AND staff_id = $2
        AND subscription_kind = 'entity'
        AND entity_type = $3 AND entity_id = $4
      LIMIT 1`,
    [args.orgId, args.staffId, args.entityType, args.entityId],
  );
  const row = res.rows[0];
  return row ? toDto(row) : null;
}

/** One inbound watch for Today Watch → Tracking display. */
type ReceivingWatchRow = {
  /** Null while the watch is still pre-arrival. */
  receivingId: number | null;
  /** Carrier tracking when the carton has an STN; null if unlinkable. */
  tracking: string | null;
  /** True = waiting for the number to land; false = following a real carton. */
  preArrival: boolean;
  updatedAtMs: number;
};

/** Active inbound watches for one staffer — Today Watch list. */
export async function listReceivingWatchesForStaff(
  args: { orgId: OrgId; staffId: number; limit?: number },
  deps: SubscriptionDeps = defaultSubscriptionDeps,
): Promise<ReceivingWatchRow[]> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
  const res = await deps.query<{
    receiving_id: string | number | null;
    tracking: string | null;
    pre_arrival: boolean;
    updated_at_ms: string | number;
  }>(
    args.orgId,
    `SELECT receiving_id,
            tracking,
            pre_arrival,
            (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
       FROM (
         SELECT ss.entity_id::bigint AS receiving_id,
                COALESCE(stn.tracking_number_raw, stn.tracking_number_normalized) AS tracking,
                FALSE AS pre_arrival,
                ss.updated_at
           FROM staff_subscriptions ss
           JOIN receiving_carton r
             ON r.id = ss.entity_id
            AND r.organization_id = ss.organization_id
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
          WHERE ss.organization_id = $1
            AND ss.staff_id = $2
            AND ss.subscription_kind = 'entity'
            AND ss.entity_type = 'receiving'
            AND ss.state = 'subscribed'
         UNION ALL
         SELECT NULL::bigint AS receiving_id,
                ss.match_tracking_normalized AS tracking,
                TRUE AS pre_arrival,
                ss.updated_at
           FROM staff_subscriptions ss
          WHERE ss.organization_id = $1
            AND ss.staff_id = $2
            AND ss.subscription_kind = 'rule'
            AND ss.state = 'subscribed'
            AND ss.match_tracking_normalized IS NOT NULL
       ) watches
      ORDER BY updated_at DESC
      LIMIT ${limit}`,
    [args.orgId, args.staffId],
  );
  return res.rows.map((row) => ({
    receivingId: row.receiving_id != null ? Number(row.receiving_id) : null,
    tracking: row.tracking != null ? String(row.tracking) : null,
    preArrival: Boolean(row.pre_arrival),
    updatedAtMs: Number(row.updated_at_ms) || 0,
  }));
}

/** A PRE-ARRIVAL tracking watch — "tell me when this number lands", written before any carton exists. */
export async function watchTrackingPreArrival(
  args: {
    orgId: OrgId;
    staffId: number;
    /** Canonical form — normalise BEFORE calling (extractCanonicalTracking). */
    trackingNormalized: string;
    /** The arrival event this watch waits on. */
    eventKey: string;
  },
  deps: SubscriptionDeps = defaultSubscriptionDeps,
): Promise<{ created: boolean }> {
  const res = await deps.query(
    args.orgId,
    `INSERT INTO staff_subscriptions
       (organization_id, staff_id, subscription_kind, state, reason,
        match_event_keys, match_tracking_normalized)
     VALUES ($1, $2, 'rule', 'subscribed', 'manual', ARRAY[$4]::text[], $3)
     ON CONFLICT (organization_id, staff_id, match_tracking_normalized)
       WHERE subscription_kind = 'rule' AND match_tracking_normalized IS NOT NULL
       DO UPDATE SET state = 'subscribed', updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [args.orgId, args.staffId, args.trackingNormalized, args.eventKey],
  );
  return { created: Boolean((res.rows[0] as { inserted?: boolean } | undefined)?.inserted) };
}

/** Stop a PRE-ARRIVAL watch — the operator's "Stop" on a number that has not landed yet. */
export async function stopTrackingPreArrivalWatch(
  args: { orgId: OrgId; staffId: number; trackingNormalized: string },
  deps: SubscriptionDeps = defaultSubscriptionDeps,
): Promise<{ stopped: number }> {
  const res = await deps.query(
    args.orgId,
    `UPDATE staff_subscriptions
        SET state = 'muted', updated_at = now()
      WHERE organization_id = $1
        AND staff_id = $2
        AND subscription_kind = 'rule'
        AND match_tracking_normalized = $3
        AND state <> 'muted'`,
    [args.orgId, args.staffId, args.trackingNormalized],
  );
  return { stopped: res.rowCount ?? 0 };
}

function canViewEntityType(
  entityType: NotifiableEntityType,
  permissions: readonly string[],
): boolean {
  return permissions.includes(ENTITY_VIEW_PERMISSION[entityType]);
}

interface SubscriptionRow {
  id: number | string;
  subscription_kind: string;
  state: string;
  reason: string;
  entity_type: string | null;
  entity_id: number | string | null;
  match_event_keys: string[] | null;
  match_sku: string | null;
}

function toDto(row: SubscriptionRow): SubscriptionDto {
  return {
    id: Number(row.id),
    subscriptionKind: row.subscription_kind as SubscriptionDto['subscriptionKind'],
    state: row.state as SubscriptionState,
    reason: row.reason as SubscriptionReason,
    entityType: row.entity_type,
    entityId: row.entity_id == null ? null : Number(row.entity_id),
    matchEventKeys: row.match_event_keys,
    matchSku: row.match_sku,
  };
}
