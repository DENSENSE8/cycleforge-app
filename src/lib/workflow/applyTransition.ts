/** applyTransition — the unified mutate-and-tap chokepoint (engine Phase 1.1). */

import { transition } from '@/lib/inventory/state-machine';
import type { SerialState } from '@/lib/inventory/state-machine';
import {
  recordInventoryEvent,
  type InventoryEventStation,
  type InventoryEventType,
  type RecordInventoryEventInput,
} from '@/lib/inventory/events';
import type { OrgId } from '@/lib/tenancy/constants';
import { tapWorkflow, type WorkflowTapArgs, type WorkflowTapEvent } from './tap';

export interface ApplyTransitionArgs {
  /** serial_units.id */
  unitId: number;
  /** Target lifecycle state (guarded against the unit's current state). */
  to: SerialState;
  /** inventory_events classifier for this transition. */
  eventType: InventoryEventType;
  /**
   * Domain event the engine's current node is gated on (drives graph routing).
   * Required to tap; omit it together with skipTap for write-only call sites.
   */
  tapEvent?: WorkflowTapEvent;
  /** Extra payload merged into the tapped node's ctx.input (e.g. { verdict }). */
  tapInput?: Record<string, unknown>;

  actorStaffId?: number | null;
  station?: InventoryEventStation | null;
  /** Pass to make retries idempotent (UNIQUE on inventory_events). */
  clientEventId?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  receivingId?: number | null;
  receivingLineId?: number | null;
  scanToken?: string | null;
  /** Pass null to keep the event's bin_id null (e.g. testing has no placement). */
  binId?: number | null;
  /** SKU for the idempotent re-entry event (the happy path reads it from the row). */
  sku?: string | null;
  /** Reject if the unit drifted from this state (optimistic concurrency). */
  expectedFrom?: SerialState;

  /** Tenant id — REQUIRED. */
  orgId: OrgId;
  /** Who/what triggered this (defaults to 'manual'). */
  source?: WorkflowTapArgs['source'];
  /** Suppress the engine tap (still does the guarded status write + atomic inventory_event + idempotent-identity handling). */
  skipTap?: boolean;
}

export type ApplyTransitionResult =
  | {
      ok: true;
      status: 200;
      from: SerialState;
      to: SerialState;
      eventId: number;
      /** true when the unit was already at `to` (re-entered verdict / retry). */
      idempotent: boolean;
    }
  | { ok: false; status: 404 | 409; from?: SerialState; error: string };

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface ApplyTransitionDeps {
  transition: typeof transition;
  recordEvent: (input: RecordInventoryEventInput, orgId: OrgId) => Promise<{ id: number }>;
  tap: (args: WorkflowTapArgs) => Promise<void>;
}

const defaultDeps: ApplyTransitionDeps = {
  transition,
  recordEvent: (input, orgId) => recordInventoryEvent(input, undefined, orgId),
  tap: tapWorkflow,
};

export async function applyTransition(
  args: ApplyTransitionArgs,
  deps: ApplyTransitionDeps = defaultDeps,
): Promise<ApplyTransitionResult> {
  const orgId = args.orgId;

  // 1. Guarded status write + atomic inventory_event. transition() owns the
  //    FOR UPDATE lock, the guard, and (when orgId is set) its own GUC-wrapped tx.
  const result = await deps.transition(
    {
      unitId: args.unitId,
      to: args.to,
      eventType: args.eventType,
      actorStaffId: args.actorStaffId ?? null,
      station: args.station ?? null,
      clientEventId: args.clientEventId ?? null,
      notes: args.notes ?? null,
      payload: args.payload ?? {},
      receivingId: args.receivingId ?? null,
      receivingLineId: args.receivingLineId ?? null,
      scanToken: args.scanToken ?? null,
      binId: args.binId,
      expectedFrom: args.expectedFrom,
    },
    undefined,
    orgId,
  );

  if (result.ok) {
    await tapAfter(args, deps);
    return { ok: true, status: 200, from: result.from, to: result.to, eventId: result.eventId, idempotent: false };
  }

  // 2. Identity (unit already at `to`) → idempotent re-entry.
  if (args.expectedFrom === undefined && result.status === 409 && result.from === args.to) {
    const event = await deps.recordEvent(
      {
        event_type: args.eventType,
        actor_staff_id: args.actorStaffId ?? null,
        station: args.station ?? null,
        serial_unit_id: args.unitId,
        sku: args.sku ?? null,
        bin_id: args.binId ?? null,
        receiving_id: args.receivingId ?? null,
        receiving_line_id: args.receivingLineId ?? null,
        scan_token: args.scanToken ?? null,
        prev_status: result.from,
        next_status: args.to,
        client_event_id: args.clientEventId ?? null,
        notes: args.notes ?? null,
        payload: args.payload ?? {},
      },
      orgId,
    );
    await tapAfter(args, deps);
    return { ok: true, status: 200, from: result.from, to: args.to, eventId: event.id, idempotent: true };
  }

  // 3. Genuine rejection: illegal transition (409) or unit not found (404). Do
  //    NOT tap — the unit's domain state didn't change.
  return { ok: false, status: result.status, from: result.from, error: result.error };
}

/** Fire-and-forget engine observe (never throws — see tap.ts). No-op when skipTap / no tapEvent. */
async function tapAfter(args: ApplyTransitionArgs, deps: ApplyTransitionDeps): Promise<void> {
  if (args.skipTap || !args.tapEvent) return;
  await deps.tap({
    serialUnitId: args.unitId,
    event: args.tapEvent,
    input: args.tapInput,
    staffId: args.actorStaffId ?? null,
    source: args.source ?? 'manual',
    orgId: args.orgId ?? null,
  });
}
