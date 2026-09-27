/** Serial unit state machine — single source of truth for allowed transitions. */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordInventoryEvent, type InventoryEventStation, type InventoryEventType } from './events';

// ─── State vocabulary (mirrors serial_status_enum in schema.ts) ──────────────

export const SERIAL_STATES = [
  'UNKNOWN',
  'RECEIVED',
  'TESTED',
  'STOCKED',
  'PICKED',
  'SHIPPED',
  'RETURNED',
  'RMA',
  'SCRAPPED',
  'TRIAGED',
  'IN_REPAIR',
  'REPAIR_DONE',
  'IN_TEST',
  'GRADED',
  'ALLOCATED',
  'PACKED',
  'LABELED',
  'STAGED',
  'ON_HOLD',
  // Phase A2 (active states) — added by migration 2026-05-20_inventory_v2_active_states.sql.
  'PICKING',
  'PACKING',
  'LOADING',
] as const;

export type SerialState = (typeof SERIAL_STATES)[number];

// ─── Transition allow-list ─────────────────────────────────────────────────── Source of truth for what is reachable from each state.

const TRANSITIONS: Readonly<Record<SerialState, ReadonlySet<SerialState>>> = {
  UNKNOWN:     new Set<SerialState>(['RECEIVED']),
  RECEIVED:    new Set<SerialState>(['TRIAGED', 'TESTED', 'IN_TEST', 'SCRAPPED', 'STOCKED' /* mark-received direct putaway (auto-stock straight from RECEIVED) */, 'GRADED' /* tech grades a received unit without a formal test-start */, 'IN_REPAIR' /* repair opened straight off the dock */]),
  TRIAGED:     new Set<SerialState>(['IN_REPAIR', 'IN_TEST', 'SCRAPPED', 'GRADED' /* graded straight from triage */]),
  IN_REPAIR:   new Set<SerialState>(['REPAIR_DONE', 'SCRAPPED', 'IN_TEST' /* test reset: clear a wrong FAIL verdict */]),
  REPAIR_DONE: new Set<SerialState>(['IN_TEST', 'GRADED', 'IN_REPAIR' /* re-open repair (more work / failed re-test) */, 'TESTED' /* recordTestVerdict PASS straight off a completed repair */]),
  IN_TEST:     new Set<SerialState>(['GRADED', 'IN_REPAIR', 'SCRAPPED', 'RECEIVED' /* test reset: un-start back to received */, 'TESTED' /* recordTestVerdict PASS — the primary testing happy path (TESTED is the pass state; condition GRADED is a separate axis) */]),
  GRADED:      new Set<SerialState>(['STOCKED', 'SCRAPPED', 'IN_TEST' /* test reset: clear a wrong PASS verdict */, 'IN_REPAIR' /* graded unit found defective → repair */, 'ALLOCATED' /* paired straight to an order from graded */, 'TESTED' /* recordTestVerdict PASS on an already-graded unit (TESTED/GRADED are sibling test-result states) */, 'SHIPPED' /* FBA direct-ship: a sellable graded unit staged to an FBA shipment ships straight to Amazon */, 'PICKED' /* force-pick override (picking/units/scan override_mismatch: graded sellable unit picked without an allocation) */]),
  TESTED:      new Set<SerialState>(['STOCKED', 'IN_REPAIR', 'SCRAPPED', 'ALLOCATED' /* paired straight to an order from tested */, 'IN_TEST' /* recordTestVerdict TEST_AGAIN: re-test a passed unit */, 'SHIPPED' /* FBA direct-ship (sellable tested unit) */, 'PICKED' /* force-pick override (picking/units/scan override_mismatch: operator picks a sellable unit with no open allocation) */]),
  STOCKED:     new Set<SerialState>(['ALLOCATED', 'RETURNED', 'SCRAPPED', 'RECEIVED', 'TESTED', 'GRADED' /* un-putaway: back to whichever pre-stock state the unit came from (mark-received stocks straight from RECEIVED; testing via TESTED/GRADED) */, 'IN_REPAIR' /* pull stock back for repair */, 'SHIPPED' /* FBA direct-ship from stock (FBA link-unit normally allocates first, but cover a stock unit that reaches ship directly) */, 'PICKED' /* force-pick override (picking/units/scan override_mismatch: stock unit picked without an allocation) */]),
  ALLOCATED:   new Set<SerialState>(['PICKING', 'PICKED', 'PACKED' /* legacy pack-log completion can arrive without an earlier unit pick event */, 'STOCKED' /* release */, 'SHIPPED' /* Phase-5 collapsed pick/pack/label/ship in one operator action */]),
  PICKING:     new Set<SerialState>(['PICKED', 'PACKED' /* legacy pack-log completion can arrive after the floor scan but before a PICKED event */, 'ALLOCATED' /* abandon */]),
  PICKED:      new Set<SerialState>(['PACKING', 'PACKED', 'ALLOCATED' /* re-pick */, 'SHIPPED' /* Phase-5 collapsed pick/pack/label/ship */, 'STOCKED' /* order-release rewind: cancel before ship returns the unit to stock */]),
  PACKING:     new Set<SerialState>(['PACKED', 'PICKED' /* abandon */]),
  PACKED:      new Set<SerialState>(['LABELED', 'LOADING', 'SHIPPED', 'STOCKED' /* order-release rewind */]),
  LABELED:     new Set<SerialState>(['STAGED', 'LOADING', 'SHIPPED', 'STOCKED' /* order-release rewind */]),
  STAGED:      new Set<SerialState>(['LOADING', 'SHIPPED', 'LABELED' /* re-stage */, 'STOCKED' /* order-release rewind */]),
  LOADING:     new Set<SerialState>(['SHIPPED', 'STAGED' /* unload */]),
  SHIPPED:     new Set<SerialState>(['RETURNED']),
  RETURNED:    new Set<SerialState>(['TRIAGED', 'STOCKED', 'RMA', 'SCRAPPED', 'SHIPPED' /* returns-intake undo (returns/undo): restore the pre-return SHIPPED state when a unit was scanned into returns by mistake */]),
  RMA:         new Set<SerialState>(['SCRAPPED', 'RETURNED']),
  SCRAPPED:    new Set<SerialState>([]), // terminal Release-from-hold restores the pre-hold state.
  ON_HOLD:     new Set<SerialState>(['STOCKED', 'TRIAGED', 'IN_REPAIR', 'REPAIR_DONE', 'IN_TEST', 'GRADED', 'ALLOCATED', 'PICKED', 'PACKED', 'LABELED', 'STAGED']),
};

/** Any state can transition to ON_HOLD via the hold flow (see hold.ts). */
const HOLD_STATE: SerialState = 'ON_HOLD';

// ─── Public API ──────────────────────────────────────────────────────────────

type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Synchronous pre-flight check — does NOT touch the database. Use from UI
 * code to grey out disallowed actions before submitting.
 */
export function guard(from: SerialState, to: SerialState): GuardResult {
  if (from === to) return { ok: false, reason: 'identity transition' };
  if (to === HOLD_STATE) return { ok: true }; // hold is universal-entry
  const allowed = TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    return { ok: false, reason: `transition ${from} → ${to} not allowed` };
  }
  return { ok: true };
}

/** All states reachable from `from` (excluding ON_HOLD which is always reachable). */
export function allowedFrom(from: SerialState): readonly SerialState[] {
  const direct = Array.from(TRANSITIONS[from] ?? []);
  return [...direct, HOLD_STATE];
}

export interface TransitionInput {
  unitId: number;
  to: SerialState;
  /** Inventory event classifier (e.g., 'PICKED', 'PACKED'). */
  eventType: InventoryEventType;
  actorStaffId?: number | null;
  station?: InventoryEventStation | null;
  /** Pass to make mobile retries idempotent. */
  clientEventId?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  /**
   * Optional caller-supplied expected `from` state. When provided, the
   * transition is rejected if the unit's actual state has drifted (concurrent
   * mutation). Use this for optimistic UI flows.
   */
  expectedFrom?: SerialState;

  // ── Event passthrough fields ────────────────────────────────────────────── recordInventoryEvent already persists these columns; surface…
  /** Override the event's bin_id. When omitted, defaults to the unit's current_location coerced to an integer id. Pass an explicit value (incl. null) to override. */
  binId?: number | null;
  receivingId?: number | null;
  receivingLineId?: number | null;
  stockLedgerId?: number | null;
  scanToken?: string | null;
  prevBinId?: number | null;
}

export type TransitionResult =
  | { ok: true; eventId: number; from: SerialState; to: SerialState }
  | { ok: false; status: 404 | 409; error: string; from?: SerialState };

/** Atomically transition a unit's state and emit an inventory_event. */
export async function transition(
  input: TransitionInput,
  // Only `.query` is used when a caller passes its own client (the executor path), so accept the narrow shape — lets callers thread a…
  db: Pick<PoolClient, 'query'> | undefined,
  /** Tenant scope — REQUIRED, and deliberately un-defaulted. */
  orgId: OrgId,
): Promise<TransitionResult> {
  // ── No caller transaction:
  if (!db) {
    return withTenantTransaction<TransitionResult>(orgId, (client) =>
      runTransition(input, client, /* useOwnTx */ false, orgId),
    );
  }

  // ── Caller-owned transaction (executor pattern).
  await db.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
  return runTransition(input, db, /* useOwnTx */ false, orgId);
}

/** Core transition logic over a single client. */
async function runTransition(
  input: TransitionInput,
  client: Pick<PoolClient, 'query'>,
  useOwnTx: boolean,
  orgId: OrgId,
): Promise<TransitionResult> {
  try {
    if (useOwnTx) await client.query('BEGIN');

    // serial_units is tenant-owned. The lock is scoped to the tenant, so a
    // cross-tenant unit id reads as not-found (404) rather than transitioning.
    const lockedQ = await client.query<{ current_status: SerialState; sku: string | null; current_location: string | null }>(
      `SELECT current_status::text AS current_status,
              sku,
              current_location
         FROM serial_units
        WHERE id = $1
          AND organization_id = $2
        FOR UPDATE`,
      [input.unitId, orgId],
    );
    const row = lockedQ.rows[0];
    if (!row) {
      if (useOwnTx) await client.query('ROLLBACK');
      return { ok: false, status: 404, error: `serial_unit ${input.unitId} not found` };
    }

    const from = row.current_status;
    if (input.expectedFrom && input.expectedFrom !== from) {
      if (useOwnTx) await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: `expected from=${input.expectedFrom} but unit is in ${from}`,
        from,
      };
    }

    const guarded = guard(from, input.to);
    if (!guarded.ok) {
      if (useOwnTx) await client.query('ROLLBACK');
      return { ok: false, status: 409, error: guarded.reason, from };
    }

    await client.query(
      `UPDATE serial_units
          SET current_status = $2::serial_status_enum,
              updated_at = NOW()
        WHERE id = $1
          AND organization_id = $3`,
      [input.unitId, input.to, orgId],
    );

    // serial_units.current_location is TEXT and, by convention, can hold either a bin id as a string ("42") or — in some paths — a free-text…
    const binId = row.current_location != null && /^\d+$/.test(row.current_location.trim())
      ? Number(row.current_location.trim())
      : null;

    // The event is stamped from `orgId` explicitly AND written on the GUC-scoped `client`, so it never depends on the…
    const event = await recordInventoryEvent(
      {
        event_type: input.eventType,
        actor_staff_id: input.actorStaffId ?? null,
        station: input.station ?? null,
        serial_unit_id: input.unitId,
        sku: row.sku,
        // Caller override wins (including an explicit null); else fall back to the
        // unit's current_location coerced to an integer bin id.
        bin_id: input.binId !== undefined ? input.binId : binId,
        prev_bin_id: input.prevBinId ?? null,
        receiving_id: input.receivingId ?? null,
        receiving_line_id: input.receivingLineId ?? null,
        stock_ledger_id: input.stockLedgerId ?? null,
        scan_token: input.scanToken ?? null,
        prev_status: from,
        next_status: input.to,
        client_event_id: input.clientEventId ?? null,
        notes: input.notes ?? null,
        payload: input.payload ?? {},
      },
      client,
      orgId,
    );

    if (useOwnTx) await client.query('COMMIT');
    return { ok: true, eventId: event.id, from, to: input.to };
  } catch (err) {
    if (useOwnTx) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
    }
    throw err;
  }
}
