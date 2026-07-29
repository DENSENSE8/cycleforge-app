/**
 * Subscription domain helpers.
 *
 * House shape (backend-patterns.md): pure-ish functions over an injectable
 * `Deps` so unit tests run DB-free; routes stay thin (validate → call → map).
 * Every query is org-scoped through `withTenantTransaction` / `tenantQuery`,
 * never a bare pool query with a WHERE clause.
 */

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

/**
 * Explicit subscribe / mute for one entity.
 *
 * Three states, not a boolean, and the reason is structural: once Phase 2 adds
 * the implicit watch ("you acted on it, so you follow it"), a boolean would let
 * that auto-subscriber re-add a staffer the instant they touch an entity they
 * just muted. A 'muted' row is RETAINED precisely so it can suppress the
 * auto-add; `state = 'auto'` is reserved in the CHECK for that writer.
 *
 * Idempotent: `clientEventId` is threaded so a retried POST re-enters the same
 * state and returns the same outcome rather than flip-flopping subscribe↔mute.
 */
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
