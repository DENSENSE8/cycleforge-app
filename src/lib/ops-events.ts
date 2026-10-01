import pool from '@/lib/db';

/** The `ops_events.entity_type` vocabulary — code source of truth. */
export { OPS_EVENT_ENTITY_TYPES, type OpsEntityType } from './ops-event-types';
import type { OpsEntityType } from './ops-event-types';

export interface RecordOpsEventInput {
  organizationId: string;
  entityType: OpsEntityType;
  entityId: number;
  eventType: string;
  occurredAt?: string | null;
  actorStaffId?: number | null;
  clientEventId?: string | null;
  /** Optional: WHERE in the tenant's own Studio flow this event happened (workflow_nodes.id — the runtime-created, per-org, zero-deploy id… */
  workflowNodeId?: string | null;
  payload?: unknown;
}

/**
 * Injectable collaborators (house `Deps` pattern, backend-patterns.md) so the
 * workflowNodeId threading is unit-testable with zero DB — see ops-events.test.ts.
 * Production callers never pass this; the default is the real pool.
 */
export interface OpsEventWriterDeps {
  query: (text: string, params: unknown[]) => Promise<unknown>;
}

const defaultDeps: OpsEventWriterDeps = {
  query: (text, params) => pool.query(text, params),
};

/**
 * Append-only polymorphic ops event log write. Idempotent on client_event_id.
 * This is the "SAL-style" event spine for stable ordering (first scan, unboxed, etc.).
 */
export async function recordOpsEvent(
  input: RecordOpsEventInput,
  deps: OpsEventWriterDeps = defaultDeps,
): Promise<number | null> {
  const occurredAt = input.occurredAt ?? null;
  const actorStaffId = input.actorStaffId ?? null;
  const clientEventId = input.clientEventId ?? null;
  const workflowNodeId = input.workflowNodeId ?? null;
  const payload = input.payload ?? {};

  const result = await deps.query(
    `INSERT INTO ops_events (
       organization_id, occurred_at, event_type,
       entity_type, entity_id,
       actor_staff_id, client_event_id, workflow_node_id, payload
     )
     VALUES (
       $1::uuid,
       COALESCE($2::timestamptz, NOW()),
       $3,
       $4,
       $5::bigint,
       $6::int,
       $7,
       $8,
       $9::jsonb
     )
     ON CONFLICT (client_event_id) DO NOTHING
     RETURNING id`,
    [
      input.organizationId,
      occurredAt,
      input.eventType,
      input.entityType,
      input.entityId,
      actorStaffId,
      clientEventId,
      workflowNodeId,
      JSON.stringify(payload),
    ],
  );

  const rows = (result as { rows?: Array<{ id?: unknown }> } | null)?.rows ?? [];
  const id = Number(rows[0]?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
