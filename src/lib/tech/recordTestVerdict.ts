/** recordTestVerdict — the per-unit testing verdict, extracted from POST /api/serial-units/[id]/test so it has a reusable lib entry point… */

import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { appendInventoryEvent } from '@/lib/repositories/inventory/inventoryEvents';
import { attachTechSerial } from '@/lib/inventory/tech-serial';
import { tapWorkflow } from '@/lib/workflow/tap';
import { applyTransition } from '@/lib/workflow/applyTransition';
import { emitEntitySignalSafe } from '@/lib/surfaces/record-entity-signal';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { getPrimarySupportTicketForReceiving } from '@/lib/support/tickets';
import { isUnifiedEngineApplyTransition, isUnifiedEngineVerdictConfig, isTestingAutoLinkTicket } from '@/lib/feature-flags';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import type { SerialState } from '@/lib/inventory/state-machine';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { refreshReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';

/** Thrown when the unified-engine chokepoint refuses a verdict's status transition (the guarded allow-list rejected it — e.g. */
export class GuardRejectedError extends Error {
  readonly from: string;
  constructor(message: string, from: string) {
    super(message);
    this.name = 'GuardRejectedError';
    this.from = from;
  }
}

export const TEST_VERDICTS = ['PASS', 'TEST_AGAIN', 'TESTING_FAILED'] as const;
export type TestVerdict = (typeof TEST_VERDICTS)[number];

interface VerdictMapping {
  nextStatus: 'TESTED' | 'IN_TEST' | 'ON_HOLD';
  eventType: 'TEST_PASS' | 'TEST_FAIL' | 'TEST_START';
}

export const VERDICT_TO_STATUS: Record<TestVerdict, VerdictMapping> = {
  PASS: { nextStatus: 'TESTED', eventType: 'TEST_PASS' },
  TEST_AGAIN: { nextStatus: 'IN_TEST', eventType: 'TEST_START' },
  TESTING_FAILED: { nextStatus: 'ON_HOLD', eventType: 'TEST_FAIL' },
};

/**
 * Pure verdict→status resolution: a per-org override (when present) else the
 * hardcoded default. Testable without a DB. The override is already validated to
 * the allowed status/event literals by OrgSettingsSchema (workflow.verdictStatus).
 */
export function pickVerdictMapping(
  verdict: TestVerdict,
  override?: Partial<Record<TestVerdict, VerdictMapping>> | null,
): VerdictMapping {
  return override?.[verdict] ?? VERDICT_TO_STATUS[verdict];
}

/** Per-org verdict→status mapping (Wave 2 / Class A). */
async function resolveVerdictMapping(verdict: TestVerdict, orgId: string | null): Promise<VerdictMapping> {
  if (!orgId || !isUnifiedEngineVerdictConfig()) return VERDICT_TO_STATUS[verdict];
  try {
    const r = await pool.query<{ settings: unknown }>(
      `SELECT settings FROM organizations WHERE id = $1`,
      [orgId],
    );
    const override = r.rows.length ? parseOrgSettings(r.rows[0].settings).workflow?.verdictStatus : null;
    return pickVerdictMapping(verdict, override ?? null);
  } catch {
    return VERDICT_TO_STATUS[verdict];
  }
}

export interface TestedUnit {
  id: number;
  serial_number: string;
  current_status: string;
  sku: string | null;
  origin_receiving_line_id: number | null;
  /** Owning tenant — fetched up front so downstream writes stamp it directly. */
  organization_id: string;
}

interface TestLineRollup {
  id: number;
  workflow_status: string | null;
  qa_status: string;
  disposition_code: string;
}

interface RecordTestVerdictArgs {
  serialUnitId: number;
  verdict: TestVerdict;
  /** Already trimmed/capped by the caller. */
  notes?: string | null;
  clientEventId?: string | null;
  actorStaffId?: number | null;
  /** Tenant id (ctx.organizationId) — REQUIRED, un-defaulted. */
  organizationId: OrgId;
}

interface RecordTestVerdictResult {
  unit: TestedUnit;
  prevStatus: string;
  /** The unit's status after the verdict — the mapped status, or unchanged for a unit on an order. */
  nextStatus: string;
  line: TestLineRollup | null;
  eventId: number;
  /** Present when PASS triggered listing→pending allocate (best-effort). */
  passAllocate?: {
    matched: boolean;
    orderId: number | null;
    allocationId: number | null;
    packAssigned: boolean;
    reason?: string;
  } | null;
}

/**
 * Unit statuses that mean "on an order": the allocation (and any pick) stands.
 * A verdict here is a QC fact on the order (ordered → picked → QC'd → packed),
 * not a unit move — the transition allow-list has no ALLOCATED/PICKING/PICKED →
 * TESTED/ON_HOLD/IN_TEST edge, and taking one would strand the allocation row.
 */
const ON_ORDER_STATUSES: Record<string, true> = { ALLOCATED: true, PICKING: true, PICKED: true };

/**
 * Returns null when the serial unit doesn't exist.
 *
 * A unit on an order (ALLOCATED / PICKING / PICKED) records the verdict — the
 * testing_results row and the TEST_PASS / TEST_FAIL / TEST_START inventory
 * event — without a status transition, so its allocation and pick stand. The
 * receiving-line rollup (it tallies TESTED / ON_HOLD / IN_TEST units, so it
 * would miscount a unit that is still ALLOCATED), the workflow tap and the
 * pass→pending-order allocate are skipped; order_stage_facts is refreshed, so the
 * order reads the new verdict (qc_inherited false). A TESTING_FAILED leaves the
 * allocation in place and the order shows qc_verdict = TESTING_FAILED: whether a
 * fail releases the unit or holds the order is the owner's open question 5 —
 * nothing auto-releases here.
 */
export async function recordTestVerdict(
  args: RecordTestVerdictArgs,
): Promise<RecordTestVerdictResult | null> {
  const { serialUnitId, verdict } = args;
  const notes = args.notes ?? null;
  const actorStaffId = args.actorStaffId ?? null;
  // Tenant scope.
  const orgId = args.organizationId;
  // Verdict→status mapping — hardcoded by default; per-org override behind
  // UNIFIED_ENGINE_VERDICT_CONFIG (flag off ⇒ no settings read, identical behavior).
  const mapping = await resolveVerdictMapping(verdict, orgId);

  // 1. Fetch existing unit + its parent receiving_line (org-scoped).
  // Phase 3: origin line (the frozen birth line) via the reconstruction view.
  const existing = await pool.query<TestedUnit>(
    orgId
      ? `SELECT su.id, su.serial_number, su.current_status::text AS current_status, su.sku,
                vo.origin_receiving_line_id, su.organization_id
           FROM serial_units su JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id
          WHERE su.id = $1 AND su.organization_id = $2`
      : `SELECT su.id, su.serial_number, su.current_status::text AS current_status, su.sku,
                vo.origin_receiving_line_id, su.organization_id
           FROM serial_units su JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id
          WHERE su.id = $1`,
    orgId ? [serialUnitId, orgId] : [serialUnitId],
  );
  if (existing.rows.length === 0) return null;
  const prev = existing.rows[0];
  const lineId = prev.origin_receiving_line_id;
  const onOrder = ON_ORDER_STATUSES[prev.current_status] === true;
  const statusAfter: string = onOrder ? prev.current_status : mapping.nextStatus;

  // 2. Apply the unit's new status (none for a unit on an order — see the doc comment).
  const useChokepoint = isUnifiedEngineApplyTransition();
  let unit = prev;
  let eventId!: number;
  // True when THIS call produced a brand-new inventory_event; false when the event already existed (a retry with the same clientEventId —…
  let eventCreated = true;

  if (onOrder) {
    // No transition; the event is written at step 4.
  } else if (useChokepoint) {
    const applied = await applyTransition({
      unitId: serialUnitId,
      to: mapping.nextStatus as SerialState,
      eventType: mapping.eventType,
      tapEvent: 'test_verdict',
      tapInput: { verdict },
      actorStaffId,
      station: 'TECH',
      clientEventId: args.clientEventId ?? null,
      notes,
      payload: { verdict },
      receivingLineId: lineId,
      binId: null, // testing changes no placement — keep the event's bin_id null
      sku: prev.sku,
      orgId: args.organizationId,
      source: 'manual',
    });
    if (!applied.ok) {
      // Unit vanished between the read and the write → not-found (route 404).
      if (applied.status === 404) return null;
      // The guard refused the transition (held/shipped/illegal source state).
      // The legacy path force-wrote; the chokepoint enforces the allow-list, so
      // surface it for the route to map to 409 instead of silently forcing.
      throw new GuardRejectedError(applied.error, applied.from ?? prev.current_status);
    }
    // current_status is the only field that changed; everything else mirrors prev.
    unit = { ...prev, current_status: mapping.nextStatus };
    eventId = applied.eventId;
    eventCreated = !applied.idempotent;
  } else if (prev.current_status !== mapping.nextStatus) {
    // Phase 3: origin_receiving_line_id dropped from RETURNING (immutable here,
    // never read off `unit` downstream) and carried over from prev below.
    const updated = await pool.query<Omit<TestedUnit, 'origin_receiving_line_id'>>(
      orgId
        ? `UPDATE serial_units
              SET current_status = $2::serial_status_enum, updated_at = NOW()
            WHERE id = $1 AND organization_id = $3
            RETURNING id, serial_number, current_status::text AS current_status,
                      sku, organization_id`
        : `UPDATE serial_units
              SET current_status = $2::serial_status_enum, updated_at = NOW()
            WHERE id = $1
            RETURNING id, serial_number, current_status::text AS current_status,
                      sku, organization_id`,
      orgId ? [serialUnitId, mapping.nextStatus, orgId] : [serialUnitId, mapping.nextStatus],
    );
    unit = { ...updated.rows[0], origin_receiving_line_id: prev.origin_receiving_line_id };
  }

  // 3. Audit row in tech_serial_numbers.
  if (lineId != null) {
    try {
      await attachTechSerial({
        serialNumber: unit.serial_number || '',
        serialUnitId: unit.id,
        stationSource: 'TECH',
        testedBy: actorStaffId,
        receivingLineId: lineId,
        scanRef: verdict,
        notes,
        // `orgId` is in scope from the top of this function and MUST be bound.
        organizationId: orgId,
      });
    } catch (err) {
      console.warn('[recordTestVerdict] tsn audit insert failed (non-fatal):', err);
    }
  }

  // 4. inventory_events row for the unit timeline (LEGACY path and units on an order — the chokepoint already wrote the event inside applyTransition at step 2).
  if (!useChokepoint || onOrder) {
    const { event, created } = await appendInventoryEvent({
      eventType: mapping.eventType,
      organizationId: args.organizationId,
      clientEventId: args.clientEventId ?? null,
      actorStaffId,
      station: 'TECH',
      serialUnitId: unit.id,
      receivingLineId: lineId,
      sku: unit.sku,
      prevStatus: prev.current_status,
      nextStatus: statusAfter,
      notes,
      payload: { verdict },
    });
    eventId = event.id;
    eventCreated = created;
  }

  // 4b. Recently-Tested feed row.
  if (eventCreated) {
    try {
      await pool.query(
        `INSERT INTO testing_results
           (serial_unit_id, receiving_line_id, verdict, unit_status,
            tested_by, notes, inventory_event_id, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // org from the unit we already fetched — not a re-SELECT subquery (which
        // would race a concurrent delete to NULL → wrong fallback org).
        [unit.id, lineId, verdict, statusAfter, actorStaffId, notes, eventId, unit.organization_id],
      );
    } catch (err) {
      console.warn('[recordTestVerdict] testing_results insert failed (non-fatal):', err);
    }

    // "Why" signal (plan §2.3 emitter #3 — tech test-fail reasons).
    if (verdict !== 'PASS') {
      await emitEntitySignalSafe({
        organizationId: unit.organization_id,
        entityType: 'SERIAL_UNIT',
        entityId: unit.id,
        signalKind: 'test_fail_reason',
        notes: notes ?? null,
        severity: verdict === 'TESTING_FAILED' ? 2 : 1,
        actorStaffId,
        meta: {
          verdict,
          nextStatus: statusAfter,
          eventType: mapping.eventType,
          receivingLineId: lineId,
          inventoryEventId: eventId,
        },
      });
    }

    // Auto-link a failed unit's serial to the carton's primary support ticket.
    if (verdict === 'TESTING_FAILED' && lineId != null && orgId && isTestingAutoLinkTicket()) {
      try {
        const primaryTicket = await getPrimarySupportTicketForReceiving({ orgId, lineId });
        if (primaryTicket && primaryTicket.provider === 'zendesk' && primaryTicket.externalTicketId) {
          // Explicitly insert into ticket_links for the SERIAL_UNIT to link this specific unit.
          await pool.query(
            `INSERT INTO ticket_links
               (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id, created_by)
             VALUES ($1, $2, $3, 'SERIAL_UNIT', $4, $5)
             ON CONFLICT DO NOTHING`,
            [orgId, primaryTicket.id, primaryTicket.externalTicketId, unit.id, actorStaffId],
          );
        }
      } catch (err) {
        console.warn('[recordTestVerdict] auto-link ticket failed (non-fatal):', err);
      }
    }
  }

  // 5. Line rollup. Only runs when the unit has a parent line and is not on an
  //    order (the tally counts TESTED / ON_HOLD / IN_TEST units only).
  let lineRollup: TestLineRollup | null = null;

  if (lineId != null && !onOrder) {
    // Run the count-then-write rollup inside ONE transaction that locks the receiving_line FOR UPDATE *before* counting.
    const rollupOrg = unit.organization_id;
    lineRollup = await withTenantTransaction(rollupOrg, async (client) => {
      // Serialize concurrent rollups on this line.
      const lockedLine = await client.query<{ workflow_status: string | null }>(
        `SELECT workflow_status::text AS workflow_status
           FROM receiving_line
          WHERE id = $1 AND organization_id = $2
          FOR UPDATE`,
        [lineId, rollupOrg],
      );
      const currentWorkflow = lockedLine.rows[0]?.workflow_status ?? null;

      const tally = await client.query<{
        quantity_expected: number | null;
        total_units: string;
        tested_units: string;
        failed_units: string;
        in_test_units: string;
      }>(
        `SELECT rl.quantity_expected,
                COUNT(su.id) FILTER (WHERE su.id IS NOT NULL)            AS total_units,
                COUNT(su.id) FILTER (WHERE su.current_status = 'TESTED')  AS tested_units,
                COUNT(su.id) FILTER (WHERE su.current_status = 'ON_HOLD') AS failed_units,
                COUNT(su.id) FILTER (WHERE su.current_status = 'IN_TEST') AS in_test_units
           FROM receiving_line rl
      LEFT JOIN serial_unit_provenance p ON p.origin_type = 'RECEIVING_LINE'
             AND p.origin_id = rl.id AND p.organization_id = rl.organization_id
      LEFT JOIN serial_units su ON su.id = p.serial_unit_id
          WHERE rl.id = $1 AND rl.organization_id = $2
          GROUP BY rl.id, rl.quantity_expected`,
        [lineId, rollupOrg],
      );

      const t = tally.rows[0];
      if (!t) return null;

      const expected = Number(t.quantity_expected || 0);
      const tested = Number(t.tested_units || 0);
      const failed = Number(t.failed_units || 0);
      const inTest = Number(t.in_test_units || 0);

      // Rollup rules:
      let nextWorkflow: string;
      let nextQa: string;
      let nextDisposition: string | null = null;
      if (failed > 0) {
        nextWorkflow = 'FAILED';
        nextQa = 'FAILED_FUNCTIONAL';
      } else if (expected > 0 && tested >= expected) {
        nextWorkflow = 'DONE';
        nextQa = 'PASSED';
        nextDisposition = 'ACCEPT';
      } else if (tested + inTest > 0) {
        nextWorkflow = 'IN_TEST';
        nextQa = 'PENDING';
      } else {
        // No verdict landed yet (rare — should at least be the unit we
        // just touched, but defensive).
        nextWorkflow = 'IN_TEST';
        nextQa = 'PENDING';
      }

      // Facts half (Wave-3 writer inversion):
      const rolled = nextDisposition
        ? await client.query<Omit<TestLineRollup, 'workflow_status'>>(
            `INSERT INTO receiving_line_testing (
                receiving_line_id, organization_id, qa_status, disposition_code)
             VALUES ($1, $3, $2::qa_status_enum, $4::disposition_enum)
             ON CONFLICT (receiving_line_id) DO UPDATE SET
               qa_status        = EXCLUDED.qa_status,
               disposition_code = EXCLUDED.disposition_code,
               updated_at       = now()
             RETURNING receiving_line_id AS id, qa_status::text AS qa_status,
                       disposition_code::text AS disposition_code`,
            [lineId, nextQa, rollupOrg, nextDisposition],
          )
        : await client.query<Omit<TestLineRollup, 'workflow_status'>>(
            `INSERT INTO receiving_line_testing (
                receiving_line_id, organization_id, qa_status)
             VALUES ($1, $3, $2::qa_status_enum)
             ON CONFLICT (receiving_line_id) DO UPDATE SET
               qa_status  = EXCLUDED.qa_status,
               updated_at = now()
             RETURNING receiving_line_id AS id, qa_status::text AS qa_status,
                       disposition_code::text AS disposition_code`,
            [lineId, nextQa, rollupOrg],
          );
      const rolledRow = rolled.rows[0];
      if (!rolledRow) return null;

      // Status half: only rows whose workflow_status actually changes route through the guarded chokepoint, inside THIS tx (executor mode — the…
      let finalWorkflow = currentWorkflow;
      if (currentWorkflow !== nextWorkflow) {
        const transitioned = await transitionReceivingLine(
          {
            receivingLineId: lineId,
            to: nextWorkflow,
            actorStaffId,
            station: 'TECH',
            skipEvent: true,
          },
          client,
          rollupOrg,
        );
        if (transitioned.ok) {
          finalWorkflow = transitioned.to;
        } else {
          // Unreachable in practice (no expectedFrom, non-strict, row locked by
          // this tx so it can't vanish) — keep the pre-rollup status visible.
          console.warn(
            `[recordTestVerdict] line ${lineId} rollup transition → ${nextWorkflow} refused (${transitioned.status}): ${transitioned.error}`,
          );
        }
      }
      return { ...rolledRow, workflow_status: finalWorkflow };
    });
  }

  // 6. Workflow-engine tap (LEGACY path only — fire-and-forget, never throws).
  //    The chokepoint path already tapped inside applyTransition at step 2. The
  //    inspection node maps PASS → pass, TESTING_FAILED → fail; TEST_AGAIN re-parks.
  //    A unit on an order is past inspection: no tap.
  if (!useChokepoint && !onOrder) {
    await tapWorkflow({
      serialUnitId: unit.id,
      event: 'test_verdict',
      input: { verdict },
      staffId: actorStaffId,
      source: 'manual',
      orgId: args.organizationId,
    });
  }

  // 7. Listing automation: PASS + pending to-ship order with matching item
  //    number → allocate this unit and apply PACK assign. Best-effort — never
  //    fails the verdict. Skips idempotent replays (eventCreated=false).
  let passAllocate: RecordTestVerdictResult['passAllocate'] = null;
  if (
    verdict === 'PASS' &&
    eventCreated &&
    orgId &&
    !onOrder &&
    mapping.nextStatus === 'TESTED'
  ) {
    try {
      const { passAllocateUnitToPendingOrder } = await import(
        '@/lib/automations/pass-allocate-to-pending'
      );
      passAllocate = await passAllocateUnitToPendingOrder({
        organizationId: orgId,
        serialUnitId: unit.id,
        actorStaffId,
        clientEventId: args.clientEventId ?? null,
      });
    } catch (err) {
      console.warn('[recordTestVerdict] pass-allocate skipped (non-fatal):', err);
    }
  }
  // 8. Order QC reads this verdict off order_stage_facts: refresh every order
  //    the unit is allocated to (including one pass-allocate just chose).
  //    After commit, like the steps above — a failure leaves the cron sweep to fix it.
  try {
    await refreshOrderStageFacts(unit.organization_id as OrgId, { serialUnitIds: [unit.id] });
  } catch (err) {
    console.warn('[recordTestVerdict] order stage facts refresh failed (non-fatal):', err);
  }
  try {
    await refreshReceivingUnitStageFacts(unit.organization_id as OrgId, {
      serialUnitIds: [unit.id],
    });
  } catch (err) {
    console.warn('[recordTestVerdict] receiving unit stage facts refresh failed (non-fatal):', err);
  }

  return {
    unit,
    prevStatus: prev.current_status,
    nextStatus: statusAfter,
    line: lineRollup,
    eventId,
    passAllocate,
  };
}
