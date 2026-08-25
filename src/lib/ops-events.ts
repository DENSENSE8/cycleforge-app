import pool from '@/lib/db';
import { isAttributed, type SessionAttribution } from '@/lib/sessions/attribution';

/**
 * The `ops_events.entity_type` vocabulary — code source of truth.
 *
 * This is the deploy-time-fixed "what business object" axis (contrast with the
 * tenant-customizable "where in the flow" axis, `workflow_node_id`). It is the
 * UNION of every entity_type actually written to ops_events today (Phase 0
 * audit, docs/todo/ops-events-station-workflow-unification-plan.md):
 *   • this file's own writer (recordOpsEvent): receiving / receiving_line /
 *     serial_unit / shipment / other;
 *   • recordEntitySignal's direct emission (src/lib/surfaces/record-entity-signal.ts),
 *     which writes SURFACE_ENTITY_TYPES[*].opsEventEntityType: adds order /
 *     fba_shipment / repair / warranty_claim.
 *
 * The migration `2026-07-06_ops_events_entity_type_chk_and_workflow_node.sql`
 * CHECK is pinned byte-for-byte against this array in `ops-events.test.ts`, and
 * that test also asserts every registry opsEventEntityType is covered here — so
 * the DB CHECK and this code list can never drift. Adding a value = extend this
 * array + the CHECK (new migration) in the same PR.
 *
 * ALTITUDE: the array itself now lives in the dependency-free
 * `./ops-event-types` (this module imports the Neon pool, so pure consumers —
 * client bundles, the notification vocabulary, DB-free tests — must not have to
 * pull that graph in to read a list of strings). It is re-exported here so
 * every existing `from '@/lib/ops-events'` import keeps resolving unchanged.
 * → bundle altitude.
 */
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
  /**
   * Optional: WHERE in the tenant's own Studio flow this event happened
   * (workflow_nodes.id — the runtime-created, per-org, zero-deploy id space).
   * Additive per the plan's Phase 2: callers running inside a Studio-composed
   * station thread it through; the (currently many) callers with no node in
   * scope simply omit it. FK-free TEXT on the DB side — see the column comment
   * in the 2026-07-06 migration.
   */
  workflowNodeId?: string | null;
  /**
   * WHICH WORK SESSION THIS HAPPENED INSIDE, and at which bench. Persisted to
   * `ops_events.session_id` / `session_type` (2026-08-23b).
   *
   * ONE OBJECT rather than two sibling fields, because the two facts always
   * travel together and a row with an id but no type (or the reverse) is not a
   * state any writer should be able to express. `sessionType` is denormalized
   * beside the id on purpose: `ON DELETE SET NULL` clears `session_id` when the
   * session row goes, and which BENCH the work happened at has to outlive it.
   *
   * REQUIRED, WITH NO DEFAULT — unlike `workflowNodeId` above, and deliberately
   * so. An optional field compiles at every existing call site and writes NULL
   * at all of them, and the compiler stays silent about precisely the ones that
   * were missed. Required, {@link NO_SESSION} is a visible token in the source:
   * `grep -rn NO_SESSION src/` is the work list for threading sessions through
   * the rest of the app, and it only shrinks.
   *
   * This matches `RecordInventoryEventInput.session` on the other spine. The
   * two event spines have different shapes — this one polymorphic, that one
   * explicit-FK — but attribution means the same thing on both, so it is
   * spelled the same way on both.
   */
  session: SessionAttribution;
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
): Promise<void> {
  const occurredAt = input.occurredAt ?? null;
  const actorStaffId = input.actorStaffId ?? null;
  const clientEventId = input.clientEventId ?? null;
  const workflowNodeId = input.workflowNodeId ?? null;
  const sessionId = isAttributed(input.session) ? input.session.sessionId : null;
  const sessionType = isAttributed(input.session) ? input.session.sessionType : null;
  const payload = input.payload ?? {};

  await deps.query(
    `INSERT INTO ops_events (
       organization_id, occurred_at, event_type,
       entity_type, entity_id,
       actor_staff_id, client_event_id, workflow_node_id, payload,
       session_id, session_type
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
       $9::jsonb,
       $10::bigint,
       $11
     )
     ON CONFLICT (client_event_id) DO NOTHING`,
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
      sessionId,
      sessionType,
    ],
  );
}
