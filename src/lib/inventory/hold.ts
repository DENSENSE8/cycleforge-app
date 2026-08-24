/**
 * hold.ts
 * ────────────────────────────────────────────────────────────────────
 * Shared hold + release transactions. Used by both the
 * /api/serial-units/[id]/{hold,release} routes and the
 * /admin/inventory/holds admin page so the lifecycle semantics live
 * in exactly one place.
 *
 * Behavior preserved from the original route logic:
 *   - hold: rejects if unit is already ON_HOLD. Stashes prev status in
 *     inventory_events.payload.restore_status so the release helper can
 *     auto-recover.
 *   - release: optional force_status override. If absent, reads the
 *     most recent HELD event's payload.restore_status; falls back to
 *     STOCKED.
 *   - Both: idempotent via clientEventId on inventory_events.
 *
 * Phase 1.3 (unified engine): the serial_units.current_status write + its
 * lifecycle event now go through the guarded transition() chokepoint
 * (src/lib/inventory/state-machine.ts) instead of a hand-rolled UPDATE +
 * INSERT — the source-of-truth rule (.claude/rules/source-of-truth.md). It runs
 * on the helper's own transaction client (executor pattern), so the writes stay
 * atomic within this tx. transition() emits the HELD / RELEASED_HOLD event
 * itself, so there is no separate INSERT. The conversion is unconditional (not
 * flag-gated) because the SoT rule forbids a raw-UPDATE fallback; it is
 * behavior-equivalent for legitimate flows: hold's to=ON_HOLD is universal-entry
 * in the guard, and release's destination is always within RESTORABLE_STATUSES,
 * which are exactly ON_HOLD's modeled outgoing edges — so the guard never rejects.
 * Tenancy: `organizationId` is REQUIRED on both inputs. The whole helper runs
 * inside `withTenantTransaction`, the `serial_units` locks carry an explicit
 * org predicate (a foreign-org unit id reads as 404, not as a successful hold),
 * and the HELD / RELEASED_HOLD events are stamped from it rather than from the
 * `inventory_events` column default — which falls back to the dogfood org.
 *
 * Caller responsibilities: feature-flag check, permission gate,
 * actorStaffId resolution.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import { NO_SESSION } from '@/lib/sessions/attribution';

const RESTORABLE_STATUSES = new Set([
  'STOCKED', 'TRIAGED', 'IN_REPAIR', 'REPAIR_DONE', 'IN_TEST',
  'GRADED', 'ALLOCATED', 'PICKED', 'PACKED', 'LABELED', 'STAGED',
]);

export function isRestorableStatus(status: string): boolean {
  return RESTORABLE_STATUSES.has(status);
}

export interface HoldUnitInput {
  serialUnitId: number;
  reason: string;
  clientEventId?: string | null;
  actorStaffId: number | null;
  /** Tenant scope — REQUIRED. Scopes the unit lock and stamps the HELD event. */
  organizationId: OrgId;
}

export interface HoldUnitSuccess {
  ok: true;
  serialUnitId: number;
  prevStatus: string;
  nextStatus: 'ON_HOLD';
  restoreStatus: string;
  inventoryEventId: number | null;
}

export interface HoldUnitFailure {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
}

export type HoldUnitResult = HoldUnitSuccess | HoldUnitFailure;

export async function holdUnit(input: HoldUnitInput): Promise<HoldUnitResult> {
  if (!input.reason || !input.reason.trim()) {
    return { ok: false, status: 400, error: 'reason is required' };
  }
  return withTenantTransaction<HoldUnitResult>(input.organizationId, async (client) => {
    const unitQ = await client.query<{ id: number; sku: string | null; current_status: string }>(
      `SELECT id, sku, current_status::text AS current_status
         FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
      [input.serialUnitId, input.organizationId],
    );
    const unit = unitQ.rows[0];
    if (!unit) return { ok: false, status: 404, error: 'serial_units row not found' };
    if (unit.current_status === 'ON_HOLD') {
      return { ok: false, status: 409, error: 'unit is already ON_HOLD' };
    }

    // Guarded status write + HELD event (executor pattern on this tx's client).
    // to=ON_HOLD is universal-entry and we pre-checked not-already-ON_HOLD, so
    // the guard never rejects here. restore_status is load-bearing for release().
    const result = await transition(
      {
        session: NO_SESSION,
        unitId: unit.id,
        to: 'ON_HOLD',
        eventType: 'HELD',
        actorStaffId: input.actorStaffId,
        station: 'SYSTEM',
        clientEventId: input.clientEventId ?? null,
        notes: input.reason.trim(),
        binId: null, // hold moves no bin (matches the legacy HELD event)
        payload: { source: 'serial-units.hold', restore_status: unit.current_status },
      },
      client,
      input.organizationId,
    );
    if (!result.ok) {
      return { ok: false, status: result.status, error: result.error };
    }

    return {
      ok: true,
      serialUnitId: unit.id,
      prevStatus: unit.current_status,
      nextStatus: 'ON_HOLD',
      restoreStatus: unit.current_status,
      inventoryEventId: result.eventId,
    };
  });
}

export interface ReleaseUnitInput {
  serialUnitId: number;
  reason?: string | null;
  forceStatus?: string | null;
  clientEventId?: string | null;
  actorStaffId: number | null;
  /** Tenant scope — REQUIRED. Scopes the unit lock and stamps the event. */
  organizationId: OrgId;
}

export interface ReleaseUnitSuccess {
  ok: true;
  serialUnitId: number;
  prevStatus: 'ON_HOLD';
  nextStatus: string;
  forced: boolean;
  inventoryEventId: number | null;
}

export interface ReleaseUnitFailure {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
  currentStatus?: string;
}

export type ReleaseUnitResult = ReleaseUnitSuccess | ReleaseUnitFailure;

export async function releaseUnit(input: ReleaseUnitInput): Promise<ReleaseUnitResult> {
  const forceStatus = input.forceStatus ? input.forceStatus.trim().toUpperCase() : null;
  if (forceStatus && !isRestorableStatus(forceStatus)) {
    return { ok: false, status: 400, error: `force_status invalid: ${forceStatus}` };
  }
  return withTenantTransaction<ReleaseUnitResult>(input.organizationId, async (client) => {
    const unitQ = await client.query<{ id: number; sku: string | null; current_status: string }>(
      `SELECT id, sku, current_status::text AS current_status
         FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
      [input.serialUnitId, input.organizationId],
    );
    const unit = unitQ.rows[0];
    if (!unit) return { ok: false, status: 404, error: 'serial_units row not found' };
    if (unit.current_status !== 'ON_HOLD') {
      return {
        ok: false,
        status: 409,
        error: 'unit is not ON_HOLD',
        currentStatus: unit.current_status,
      };
    }

    // Recover the pre-hold status from the most recent HELD event.
    let restoreStatus = forceStatus ?? 'STOCKED';
    if (!forceStatus) {
      const heldQ = await client.query<{ restore_status: string | null }>(
        `SELECT payload->>'restore_status' AS restore_status
           FROM inventory_events
          WHERE serial_unit_id = $1 AND event_type = 'HELD'
            AND organization_id = $2
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        [unit.id, input.organizationId],
      );
      const candidate = heldQ.rows[0]?.restore_status?.toUpperCase() ?? null;
      if (candidate && isRestorableStatus(candidate)) {
        restoreStatus = candidate;
      } else if (candidate && !isRestorableStatus(candidate)) {
        // The unit was held from a state we can't auto-restore (e.g. RECEIVED,
        // TESTED). Silently defaulting to STOCKED would push an untested unit
        // into sellable stock, bypassing triage/test/grade. Refuse and make the
        // caller choose an explicit force_status instead of losing the state.
        return {
          ok: false,
          status: 409,
          error: `cannot auto-restore from ${candidate}; specify force_status`,
          currentStatus: unit.current_status,
        };
      }
      // candidate == null → no recorded prior status; the STOCKED fallback is safe.
    }

    // Guarded status write + RELEASED_HOLD event. restoreStatus is always a
    // RESTORABLE_STATUSES member, which are exactly ON_HOLD's modeled outgoing
    // edges (state-machine.ts), so the guard never rejects.
    const result = await transition(
      {
        session: NO_SESSION,
        unitId: unit.id,
        to: restoreStatus as SerialState,
        eventType: 'RELEASED_HOLD',
        actorStaffId: input.actorStaffId,
        station: 'SYSTEM',
        clientEventId: input.clientEventId ?? null,
        notes: input.reason?.trim() || null,
        binId: null,
        payload: { source: 'serial-units.release', forced: !!forceStatus },
      },
      client,
      input.organizationId,
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.error,
        currentStatus: unit.current_status,
      };
    }

    return {
      ok: true,
      serialUnitId: unit.id,
      prevStatus: 'ON_HOLD',
      nextStatus: restoreStatus,
      forced: !!forceStatus,
      inventoryEventId: result.eventId,
    };
  });
}
