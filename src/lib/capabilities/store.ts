/**
 * Org capabilities — the server side of SIMPLE-FIRST (docs/product/SIMPLE-FIRST.md).
 *
 * `org_capabilities` holds one row per capability the org has touched (no row
 * = locked); `org_capability_events` is the org's build history. Every write
 * goes through {@link transitionCapability} / {@link recordCapabilityEvent}
 * inside the caller's tenant transaction, so the state change and its ledger
 * row land together. Every statement is org-scoped from the caller's context.
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { EBAY_PLATFORM_PREDICATE } from '@/lib/ebay/account-predicates';
import { publishOrgCapabilitiesChanged } from '@/lib/realtime/publish';
import {
  BASE_CAPABILITY_ID,
  UNLOCKABLE_CAPABILITIES,
  getCapability,
  type CapabilityDef,
  type CapabilitySource,
  type CapabilityState,
} from './catalog';

type Queryable = Pick<PoolClient, 'query'>;

export type CapabilityEvent = 'suggested' | 'setup_started' | 'activated' | 'deactivated' | 'backfilled' | 'imported';

export interface OrgCapabilityRow {
  capabilityId: string;
  state: CapabilityState;
  source: CapabilitySource;
  enabledByStaffId: number | null;
  enabledByName: string | null;
  enabledAt: string | null;
  config: Record<string, unknown>;
}

export interface PrerequisiteStatus {
  provider: 'ebay' | 'amazon';
  label: string;
  met: boolean;
}

/** One capability as an org sees it: the catalog entry, its state, what is still missing. */
export interface CapabilityView {
  def: CapabilityDef;
  state: CapabilityState;
  row: OrgCapabilityRow | null;
  prerequisites: PrerequisiteStatus[];
}

const ROWS_SQL = `SELECT oc.capability_id, oc.state, oc.source, oc.enabled_by_staff_id, s.name AS enabled_by_name,
       oc.enabled_at, oc.config
  FROM org_capabilities oc
  LEFT JOIN staff s ON s.id = oc.enabled_by_staff_id AND s.organization_id = oc.organization_id
 WHERE oc.organization_id = $1
 ORDER BY oc.capability_id`;

function toRow(r: Record<string, unknown>): OrgCapabilityRow {
  return {
    capabilityId: String(r.capability_id),
    state: r.state as CapabilityState,
    source: r.source as CapabilitySource,
    enabledByStaffId: r.enabled_by_staff_id == null ? null : Number(r.enabled_by_staff_id),
    enabledByName: r.enabled_by_name == null ? null : String(r.enabled_by_name),
    enabledAt: r.enabled_at == null ? null : new Date(String(r.enabled_at)).toISOString(),
    config: (r.config as Record<string, unknown>) ?? {},
  };
}

export async function loadOrgCapabilities(orgId: OrgId): Promise<OrgCapabilityRow[]> {
  const { rows } = await tenantQuery(orgId, ROWS_SQL, [orgId]);
  return rows.map(toRow);
}

/**
 * Which connections exist — one query for every provider a prerequisite names.
 * Pass `client` to read inside the caller's tenant transaction.
 */
export async function loadConnectionFacts(
  orgId: OrgId,
  client?: Queryable,
): Promise<Record<'ebay' | 'amazon', boolean>> {
  const sql = `SELECT
       EXISTS (SELECT 1 FROM ebay_accounts
                WHERE organization_id = $1 AND is_active = TRUE AND ${EBAY_PLATFORM_PREDICATE}
                  AND COALESCE(account_role, 'seller') = 'seller') AS ebay,
       EXISTS (SELECT 1 FROM amazon_accounts WHERE organization_id = $1 AND is_active = TRUE) AS amazon`;
  const { rows } = client
    ? await client.query<{ ebay: boolean; amazon: boolean }>(sql, [orgId])
    : await tenantQuery<{ ebay: boolean; amazon: boolean }>(orgId, sql, [orgId]);
  return { ebay: Boolean(rows[0]?.ebay), amazon: Boolean(rows[0]?.amazon) };
}

export function viewCapability(
  def: CapabilityDef,
  row: OrgCapabilityRow | null,
  connections: Record<'ebay' | 'amazon', boolean>,
): CapabilityView {
  const state: CapabilityState = def.id === BASE_CAPABILITY_ID ? 'active' : (row?.state ?? 'locked');
  return {
    def,
    state,
    row,
    prerequisites: def.prerequisites.map((p) => ({ provider: p.provider, label: p.label, met: connections[p.provider] })),
  };
}

/** Every unlockable capability with this org's state, in catalog order. */
export async function loadCapabilityViews(orgId: OrgId): Promise<CapabilityView[]> {
  const [rows, connections] = await Promise.all([loadOrgCapabilities(orgId), loadConnectionFacts(orgId)]);
  const byId = new Map(rows.map((r) => [r.capabilityId, r]));
  return UNLOCKABLE_CAPABILITIES.map((def) => viewCapability(def, byId.get(def.id) ?? null, connections));
}

/** A capability goes active only when every prerequisite is met; otherwise it waits in setup. */
export function enabledStateFor(view: Pick<CapabilityView, 'prerequisites'>): CapabilityState {
  return view.prerequisites.every((p) => p.met) ? 'active' : 'setting_up';
}

const EVENT_FOR_STATE: Record<CapabilityState, CapabilityEvent> = {
  locked: 'deactivated',
  suggested: 'suggested',
  setting_up: 'setup_started',
  active: 'activated',
};

export interface TransitionInput {
  orgId: OrgId;
  capabilityId: string;
  toState: CapabilityState;
  staffId: number | null;
  source: CapabilitySource;
  agentMutationId?: number | null;
  detail?: Record<string, unknown>;
  /** Merged into the row's config. */
  config?: Record<string, unknown>;
}

export interface TransitionResult {
  fromState: CapabilityState;
  toState: CapabilityState;
  changed: boolean;
}

/**
 * Move one capability to `toState` and append its ledger row, in the caller's
 * tenant transaction. A no-op move (already there) writes nothing. The row is
 * locked first, so two concurrent enables cannot both log an activation.
 */
export async function transitionCapability(client: Queryable, input: TransitionInput): Promise<TransitionResult> {
  if (!getCapability(input.capabilityId) || input.capabilityId === BASE_CAPABILITY_ID) {
    throw new Error(`unknown capability "${input.capabilityId}"`);
  }
  const current = await client.query<{ state: CapabilityState }>(
    `SELECT state FROM org_capabilities WHERE organization_id = $1 AND capability_id = $2 FOR UPDATE`,
    [input.orgId, input.capabilityId],
  );
  const fromState: CapabilityState = current.rows[0]?.state ?? 'locked';
  if (fromState === input.toState) return { fromState, toState: input.toState, changed: false };

  const enabling = input.toState === 'active' || input.toState === 'setting_up';
  await client.query(
    `INSERT INTO org_capabilities
       (organization_id, capability_id, state, enabled_by_staff_id, enabled_at, source, config)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END, $6, COALESCE($7::jsonb, '{}'::jsonb))
     ON CONFLICT (organization_id, capability_id) DO UPDATE SET
       state = EXCLUDED.state,
       enabled_by_staff_id = CASE WHEN $5 THEN EXCLUDED.enabled_by_staff_id ELSE org_capabilities.enabled_by_staff_id END,
       enabled_at = CASE WHEN $5 THEN COALESCE(org_capabilities.enabled_at, now()) ELSE org_capabilities.enabled_at END,
       source = EXCLUDED.source,
       config = org_capabilities.config || COALESCE($7::jsonb, '{}'::jsonb),
       updated_at = now()`,
    [
      input.orgId,
      input.capabilityId,
      input.toState,
      input.staffId,
      enabling,
      input.source,
      input.config ? JSON.stringify(input.config) : null,
    ],
  );
  await recordCapabilityEvent(client, {
    orgId: input.orgId,
    capabilityId: input.capabilityId,
    event: EVENT_FOR_STATE[input.toState],
    fromState,
    toState: input.toState,
    staffId: input.staffId,
    source: input.source,
    agentMutationId: input.agentMutationId ?? null,
    detail: input.detail ?? {},
  });
  return { fromState, toState: input.toState, changed: true };
}

export async function recordCapabilityEvent(
  client: Queryable,
  e: {
    orgId: OrgId;
    capabilityId: string;
    event: CapabilityEvent;
    fromState: CapabilityState | null;
    toState: CapabilityState | null;
    staffId: number | null;
    source: CapabilitySource;
    agentMutationId?: number | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO org_capability_events
       (organization_id, capability_id, event, from_state, to_state, staff_id, source, agent_mutation_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      e.orgId,
      e.capabilityId,
      e.event,
      e.fromState,
      e.toState,
      e.staffId,
      e.source,
      e.agentMutationId ?? null,
      JSON.stringify(e.detail ?? {}),
    ],
  );
}

/** After the transaction commits: every open sidebar in the org refetches its nav. Never throws. */
export async function announceCapabilityChange(orgId: OrgId, capabilityId: string, state: CapabilityState): Promise<void> {
  try {
    await publishOrgCapabilitiesChanged({ organizationId: orgId, capabilityId, state });
  } catch (err) {
    console.warn('[capabilities] realtime publish failed (non-fatal):', err);
  }
}

/**
 * Settings → Capabilities: turn one on (active, or setting_up while a
 * connection is missing) or off (locked), in one tenant transaction, then
 * repaint every open sidebar. Unknown ids and the base capability throw.
 */
export async function switchCapabilityFromSettings(
  orgId: OrgId,
  capabilityId: string,
  enable: boolean,
  staffId: number | null,
): Promise<TransitionResult> {
  const def = getCapability(capabilityId);
  if (!def || def.id === BASE_CAPABILITY_ID) throw new Error(`unknown capability "${capabilityId}"`);
  const moved = await withTenantTransaction(orgId, async (client) => {
    const toState: CapabilityState = enable
      ? enabledStateFor(viewCapability(def, null, await loadConnectionFacts(orgId, client)))
      : 'locked';
    return transitionCapability(client, { orgId, capabilityId, toState, staffId, source: 'settings' });
  });
  if (moved.changed) await announceCapabilityChange(orgId, capabilityId, moved.toState);
  return moved;
}

export interface CapabilityEventRow {
  id: number;
  capabilityId: string;
  capabilityLabel: string;
  event: CapabilityEvent;
  fromState: CapabilityState | null;
  toState: CapabilityState | null;
  staffName: string | null;
  source: CapabilitySource;
  agentMutationId: number | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** The org's build history, newest first. `before` pages by event id. */
export async function listCapabilityEvents(
  orgId: OrgId,
  opts: { limit?: number; before?: number | null } = {},
): Promise<CapabilityEventRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const { rows } = await tenantQuery(
    orgId,
    `SELECT e.id, e.capability_id, e.event, e.from_state, e.to_state, s.name AS staff_name, e.source,
            e.agent_mutation_id, e.detail, e.created_at
       FROM org_capability_events e
       LEFT JOIN staff s ON s.id = e.staff_id AND s.organization_id = e.organization_id
      WHERE e.organization_id = $1 AND ($2::bigint IS NULL OR e.id < $2)
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $3`,
    [orgId, opts.before ?? null, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    capabilityId: String(r.capability_id),
    capabilityLabel: getCapability(String(r.capability_id))?.label ?? String(r.capability_id),
    event: r.event as CapabilityEvent,
    fromState: (r.from_state as CapabilityState | null) ?? null,
    toState: (r.to_state as CapabilityState | null) ?? null,
    staffName: r.staff_name == null ? null : String(r.staff_name),
    source: r.source as CapabilitySource,
    agentMutationId: r.agent_mutation_id == null ? null : Number(r.agent_mutation_id),
    detail: (r.detail as Record<string, unknown>) ?? {},
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}
