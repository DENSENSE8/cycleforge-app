/**
 * Save-for-unbox — the real triage-complete transition
 * (docs/receiving-triage-redesign-plan.md §3.5).
 *
 * Today `TriagePanel`'s "Save for unbox" button was a client-only
 * `toast.success(...)` — zero server write, zero column touched. This is the
 * server half: stamp `receiving.triage_complete` (+ _at/_by) so the carton has
 * a real, audited "identified, staged, handed to unbox" state.
 *
 * Does NOT require a PO link (B5) or intake photos (D8). DOES require a shelf
 * (`staging_location_id`) and a lane (`priority_lane`) — A1, now enforceable
 * since Phase 2's Arrival staging dock (`ArrivalStagingDockControl`) gives
 * the operator a way to set both.
 *
 * Does NOT advance `workflow_status` — that remains the unbox street's job via
 * the one guarded `transitionReceivingLine()` chokepoint (never duplicated here).
 *
 * Idempotent via `receiving_triage.triage_client_event_id` (org-led partial
 * UNIQUE, ux_receiving_triage_client_event_id), mirroring the
 * `inventory_events.client_event_id` pattern in .claude/rules/backend-patterns.md
 * — a retried click/network-flake resolves the SAME row instead of erroring or
 * double-writing.
 *
 * Wave-3 writer inversion: reads AND writes go to the receiving_triage street
 * table (readiness gate on rt.staging_location_id / rt.priority_lane, replay on
 * rt.triage_client_event_id, completion stamped via upsertReceivingTriage).
 * The spine triage columns are no longer touched and are dropped in Wave 4.
 */
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { emitEntitySignalSafe } from '@/lib/surfaces/record-entity-signal';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';

export interface CompleteTriageInput {
  receivingId: number;
  staffId: number;
  clientEventId?: string | null;
}

export interface CompleteTriageResult {
  ok: boolean;
  status: number;
  error?: string;
  receivingId: number;
  triageCompletedAt: string | null;
  idempotent: boolean;
}

/** Minimal query surface — lets the unit test pass a fake client (DB-free). */
export interface TxClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export interface CompleteTriageDeps {
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  /** Optional "why" signal emitter (plan §2.3 emitter #2, triage outcome);
   *  fire-and-forget by contract, never throws. */
  emitSignal?: typeof emitEntitySignalSafe;
}

const defaultDeps: CompleteTriageDeps = {
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  emitSignal: emitEntitySignalSafe,
};

export async function completeTriage(
  input: CompleteTriageInput,
  orgId: string,
  deps: CompleteTriageDeps = defaultDeps,
): Promise<CompleteTriageResult> {
  const { receivingId, staffId } = input;
  const clientEventId = input.clientEventId?.trim() || null;

  return deps.runTx(orgId, async (client) => {
    // Idempotency: a retried request with the SAME client_event_id resolves the
    // row it already completed, instead of erroring or re-stamping the actor/time.
    // Replay key lives on the street table (ux_receiving_triage_client_event_id).
    if (clientEventId) {
      const existing = await client.query(
        `SELECT rt.receiving_id AS id, rt.triage_completed_at::text AS triage_completed_at
           FROM receiving_triage rt
          WHERE rt.organization_id = $1 AND rt.triage_client_event_id = $2
          LIMIT 1`,
        [orgId, clientEventId],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        return {
          ok: true,
          status: 200,
          receivingId: Number(row.id),
          triageCompletedAt: (row.triage_completed_at as string) ?? null,
          idempotent: true,
        };
      }
    }

    // Lock the street row and capture the PRIOR triage_complete so the signal
    // below fires only on the first genuine transition (re-stamp semantics of a
    // repeat click are unchanged — only the emit is gated). The readiness gate
    // (shelf + lane, A1) reads the street columns per the Wave-2 probe.
    const rtRes = await client.query(
      `SELECT rt.staging_location_id, rt.priority_lane, rt.triage_complete
         FROM receiving_triage rt
        WHERE rt.receiving_id = $1 AND rt.organization_id = $2
        FOR UPDATE`,
      [receivingId, orgId],
    );
    const rt = rtRes.rows[0];
    const ready = !!rt && rt.staging_location_id != null && rt.priority_lane != null;

    if (!ready) {
      // Distinguish "doesn't exist" from "exists but isn't staged yet" so the
      // UI can show a precise, actionable error rather than a bare 404. Carton
      // identity stays on the spine — only the moved columns left it.
      const exists = await client.query(
        `SELECT 1 FROM receiving_carton r
          WHERE r.id = $1 AND r.organization_id = $2 LIMIT 1`,
        [receivingId, orgId],
      );
      if (exists.rowCount === 0) {
        return {
          ok: false,
          status: 404,
          error: 'carton not found',
          receivingId,
          triageCompletedAt: null,
          idempotent: false,
        };
      }
      return {
        ok: false,
        status: 422,
        error: 'Assign a shelf and a priority lane before saving for unbox.',
        receivingId,
        triageCompletedAt: null,
        idempotent: false,
      };
    }

    // Stamp the completion on the street table. Overwrite semantics mirror the
    // old spine UPDATE: completed_at/by re-stamp on a clientEventId-less
    // re-click; the replay key is only written when the caller sent one
    // (omitted = never clobbered).
    await upsertReceivingTriage(
      client as unknown as Pick<PoolClient, 'query'>,
      orgId,
      receivingId,
      {
        triageComplete: true,
        triageCompletedAt: 'now',
        triageCompletedBy: staffId,
        ...(clientEventId ? { triageClientEventId: clientEventId } : {}),
      },
    );

    // Read the stamped time back off the street row (the FOR UPDATE lock above
    // serializes concurrent completions on this carton).
    const stamped = await client.query(
      `SELECT triage_completed_at::text AS triage_completed_at
         FROM receiving_triage
        WHERE receiving_id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );

    // Triage-outcome signal (plan §2.3 emitter #2). Rides this transaction via
    // `client` under recordEntitySignal's SAVEPOINT guard. Emitted only on the
    // FIRST completion (prior triage_complete false) — clientEventId replays
    // return earlier, and clientEventId-less re-clicks re-stamp but never re-emit.
    const wasComplete = Boolean(rt.triage_complete);
    if (!wasComplete) {
      await (deps.emitSignal ?? emitEntitySignalSafe)({
        organizationId: orgId,
        entityType: 'RECEIVING',
        entityId: receivingId,
        signalKind: 'triage_outcome',
        notes: 'triage complete — staged for unbox',
        actorStaffId: staffId,
        client,
      });
    }

    return {
      ok: true,
      status: 200,
      receivingId,
      triageCompletedAt: (stamped.rows[0]?.triage_completed_at as string) ?? null,
      idempotent: false,
    };
  });
}
