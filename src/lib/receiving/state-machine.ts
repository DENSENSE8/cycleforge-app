/** Receiving-line state machine — the guarded chokepoint for `receiving_line.workflow_status`. */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  recordInventoryEvent,
  type InventoryEventStation,
  type InventoryEventType,
} from '@/lib/inventory/events';
import {
  deriveReceivingLineStatus,
  type ReceivingLineStatus,
} from '@/lib/receiving/workflow-stages';
import type { InboundWorkflowStatus } from '@/lib/drizzle/schema';

// ─── Transition allow-list (inbound_workflow_status_enum) ──────────────────── Forward lifecycle + the rewinds/branches the receiving +…
const INBOUND_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  EXPECTED:      new Set(['ARRIVED', 'MATCHED', 'UNBOXED', 'DONE']),
  ARRIVED:       new Set(['MATCHED', 'UNBOXED', 'DONE', 'EXPECTED']),
  MATCHED:       new Set(['UNBOXED', 'AWAITING_TEST', 'IN_TEST', 'PASSED', 'FAILED', 'RTV', 'SCRAP', 'DONE', 'EXPECTED' /* unmatch rewind */]),
  UNBOXED:       new Set(['AWAITING_TEST', 'IN_TEST', 'PASSED', 'FAILED', 'RTV', 'SCRAP', 'DONE', 'MATCHED' /* re-box rewind */]),
  AWAITING_TEST: new Set(['IN_TEST', 'PASSED', 'FAILED', 'DONE', 'UNBOXED']),
  IN_TEST:       new Set(['PASSED', 'FAILED', 'RTV', 'SCRAP', 'DONE', 'AWAITING_TEST']),
  PASSED:        new Set(['DONE', 'IN_TEST', 'RTV', 'SCRAP']),
  FAILED:        new Set(['RTV', 'SCRAP', 'IN_TEST', 'DONE']),
  RTV:           new Set(['DONE', 'SCRAP']),
  SCRAP:         new Set(['DONE']),
  DONE:          new Set([
    'UNBOXED',
    'AWAITING_TEST' /* reconcile/undo reopen */,
    'IN_TEST' /* re-test of a fully-passed rollup (TEST_AGAIN on a DONE line) */,
    'MATCHED' /* website unreceive — full undo back to scanned */,
  ]),
};

type ReceivingLineGuardResult = { ok: true } | { ok: false; reason: string };

/** Synchronous pre-flight — does NOT touch the DB. Identity is allowed. */
export function guardReceivingLine(from: string, to: string): ReceivingLineGuardResult {
  if (from === to) return { ok: true }; // idempotent no-op
  const allowed = INBOUND_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    return { ok: false, reason: `receiving-line transition ${from} → ${to} not modeled` };
  }
  return { ok: true };
}

interface ReceivingLineTransitionInput {
  receivingLineId: number;
  /** Target fine-grained workflow_status. */
  to: InboundWorkflowStatus | string;
  /** Reject (409) if the line is not in this state (optimistic concurrency). */
  expectedFrom?: InboundWorkflowStatus | string;
  actorStaffId?: number | null;
  station?: InventoryEventStation | null;
  /** UNIQUE on inventory_events — pass to make retries idempotent. */
  clientEventId?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  /** inventory_events classifier; defaults to 'NOTE' (the line-lifecycle convention). */
  eventType?: InventoryEventType;
  /** Stamped when the line reaches the RECEIVED coarse stage (COALESCE-once). */
  receivedBy?: number | null;
  /** Set the per-line exception_code in the same tx (e.g. flag PROBLEM). Undefined = no change. */
  exceptionCode?: string | null;
  /** When true, a disallowed edge returns 409 instead of log-and-proceed. */
  strict?: boolean;
  /** When true, do the guarded workflow_status UPDATE (+ coarse/timestamps) but do NOT emit an inventory_event — the caller owns event… */
  skipEvent?: boolean;
}

type ReceivingLineTransitionResult =
  | {
      ok: true;
      eventId: number;
      from: string;
      to: string;
      /** Whether workflow_status actually changed (false on an identity no-op). */
      changed: boolean;
      coarse: ReceivingLineStatus;
      /** Parent carton id (for realtime/cache invalidation), or null for an unlinked line. */
      receivingId: number | null;
    }
  | { ok: false; status: 404 | 409; error: string; from?: string };

export interface ReceivingLineTransitionDeps {
  recordEvent: typeof recordInventoryEvent;
}

const defaultDeps: ReceivingLineTransitionDeps = { recordEvent: recordInventoryEvent };

/** Atomically transition a receiving line and emit one inventory_event. */
export async function transitionReceivingLine(
  input: ReceivingLineTransitionInput,
  /** Pass `undefined` to let this function own the transaction. */
  db: Pick<PoolClient, 'query'> | undefined,
  /** Tenant scope — REQUIRED, and deliberately un-defaulted, for the same reason as serial `transition()`. */
  orgId: OrgId,
  deps: ReceivingLineTransitionDeps = defaultDeps,
): Promise<ReceivingLineTransitionResult> {
  if (!db) {
    return withTenantTransaction<ReceivingLineTransitionResult>(orgId, (client) =>
      runReceivingLineTransition(input, client, /* useOwnTx */ false, orgId, deps),
    );
  }
  await db.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
  return runReceivingLineTransition(input, db, /* useOwnTx */ false, orgId, deps);
}

async function runReceivingLineTransition(
  input: ReceivingLineTransitionInput,
  client: Pick<PoolClient, 'query'>,
  useOwnTx: boolean,
  orgId: OrgId,
  deps: ReceivingLineTransitionDeps,
): Promise<ReceivingLineTransitionResult> {
  const to = String(input.to).trim().toUpperCase();
  const coarse = deriveReceivingLineStatus(to);
  try {
    if (useOwnTx) await client.query('BEGIN');

    const lockedQ = await client.query<{
      workflow_status: string;
      receiving_id: number | null;
      sku: string | null;
    }>(
      `SELECT workflow_status::text AS workflow_status, receiving_id, sku
         FROM receiving_line WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.receivingLineId, orgId],
    );
    const row = lockedQ.rows[0];
    if (!row) {
      if (useOwnTx) await client.query('ROLLBACK');
      return { ok: false, status: 404, error: `receiving_line ${input.receivingLineId} not found` };
    }

    const from = row.workflow_status;
    if (input.expectedFrom && String(input.expectedFrom).toUpperCase() !== from) {
      if (useOwnTx) await client.query('ROLLBACK');
      return { ok: false, status: 409, error: `expected from=${input.expectedFrom} but line is in ${from}`, from };
    }

    const guarded = guardReceivingLine(from, to);
    if (!guarded.ok) {
      if (input.strict) {
        if (useOwnTx) await client.query('ROLLBACK');
        return { ok: false, status: 409, error: guarded.reason, from };
      }
      // Permissive default: proceed but surface the unmodeled edge for tightening.
      console.warn(`[transitionReceivingLine] ${guarded.reason} (line ${input.receivingLineId}) — proceeding (non-strict)`);
    }

    const changed = from !== to;

    // One UPDATE: status + coarse status + the coarse-stage timestamp (COALESCE so
    // it records the FIRST time the line reached that stage) + received_by + an
    // optional exception_code set.
    await client.query(
      `UPDATE receiving_line SET
         workflow_status       = $2::inbound_workflow_status_enum,
         receiving_line_status = $3,
         scanned_at  = CASE WHEN $3 = 'SCANNED'  THEN COALESCE(scanned_at,  NOW()) ELSE scanned_at  END,
         unboxed_at  = CASE WHEN $3 = 'UNBOXED'  THEN COALESCE(unboxed_at,  NOW()) ELSE unboxed_at  END,
         received_at = CASE WHEN $3 = 'RECEIVED' THEN COALESCE(received_at, NOW()) ELSE received_at END,
         received_by = CASE WHEN $3 = 'RECEIVED' AND $4::int IS NOT NULL THEN COALESCE(received_by, $4::int) ELSE received_by END,
         exception_code = COALESCE($5, exception_code),
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $6`,
      [input.receivingLineId, to, coarse, input.receivedBy ?? null, input.exceptionCode ?? null, orgId],
    );

    // skipEvent: the caller emits its own (single, combined) inventory_event —
    // don't double-write the line-lifecycle event here.
    const event = input.skipEvent
      ? { id: -1 }
      : await deps.recordEvent(
          {
            event_type: input.eventType ?? 'NOTE',
            actor_staff_id: input.actorStaffId ?? null,
            station: input.station ?? 'RECEIVING',
            receiving_id: row.receiving_id,
            receiving_line_id: input.receivingLineId,
            serial_unit_id: null, // line lifecycle is pre-serialization
            sku: row.sku,
            prev_status: from,
            next_status: to,
            client_event_id: input.clientEventId ?? null,
            notes: input.notes ?? null,
            payload: {
              action: 'receiving_line_transition',
              coarse,
              ...(input.exceptionCode ? { exception_code: input.exceptionCode } : {}),
              ...(input.payload ?? {}),
            },
          },
          client,
          orgId,
        );

    if (useOwnTx) await client.query('COMMIT');
    return { ok: true, eventId: event.id, from, to, changed, coarse, receivingId: row.receiving_id };
  } catch (err) {
    if (useOwnTx) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
    }
    throw err;
  }
}
