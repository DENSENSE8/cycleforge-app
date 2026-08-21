/**
 * recordTestVerdict — the per-unit testing verdict, extracted from
 * POST /api/serial-units/[id]/test so it has a reusable lib entry point
 * (the route keeps HTTP validation, the verdict-gated permission split and
 * the formal audit_logs row; everything domain-side lives here).
 *
 * Transitions a single `serial_units` row through the existing
 * `serial_status_enum` (no new column required):
 *
 *   PASS         → current_status = 'TESTED'   + inventory_event TEST_PASS
 *   TEST_AGAIN   → current_status = 'IN_TEST'  + inventory_event TEST_START
 *   TESTING_FAIL → current_status = 'ON_HOLD'  + inventory_event TEST_FAIL
 *
 * It also writes a `tech_serial_numbers` audit row (station_source='TECH',
 * tester_id, receiving_line_id, serial_unit_id), a `testing_results` feed
 * row, and rolls the parent line's `workflow_status` + `qa_status` up across
 * all serial_units linked to the same receiving_line:
 *
 *   - all units TESTED (count ≥ quantity_expected) → line DONE / PASSED / ACCEPT
 *   - any unit ON_HOLD                            → line FAILED / FAILED_FUNCTIONAL
 *   - otherwise (still-testing)                   → line IN_TEST / PENDING
 *
 * The rollup's qa_status/disposition write is an upsert into the
 * receiving_line_testing facts table (Wave-3 writer inversion); its
 * workflow_status change routes through transitionReceivingLine (skipEvent —
 * the per-unit verdict events already cover the timeline) and is skipped
 * entirely when the status is unchanged, so the coarse-status trigger never
 * re-stamps lifecycle timestamps on a non-transitioning line.
 *
 * Finally it taps the workflow engine (`test_verdict`) so the unit's run
 * advances pass/fail — fire-and-forget, an engine error never fails the
 * verdict (see src/lib/workflow/tap.ts).
 */

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

/**
 * Thrown when the unified-engine chokepoint refuses a verdict's status
 * transition (the guarded allow-list rejected it — e.g. a held or shipped
 * unit). Only reachable on the UNIFIED_ENGINE_APPLY_TRANSITION path; the legacy
 * raw path force-writes and never throws this. The route maps it to a 409.
 */
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

/**
 * Per-org verdict→status mapping (Wave 2 / Class A). Flag OFF (default) returns
 * the hardcoded map with NO settings read — byte-identical to before. Flag ON
 * reads the org's workflow.verdictStatus override and falls back per-verdict; any
 * failure fail-safes to the hardcoded map (a verdict must never fail to resolve).
 */
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

export interface TestLineRollup {
  id: number;
  workflow_status: string | null;
  qa_status: string;
  disposition_code: string;
}

export interface RecordTestVerdictArgs {
  serialUnitId: number;
  verdict: TestVerdict;
  /** Already trimmed/capped by the caller. */
  notes?: string | null;
  clientEventId?: string | null;
  actorStaffId?: number | null;
  /**
   * Tenant id (ctx.organizationId) — REQUIRED, un-defaulted. Scopes every
   * read/write below, stamps the tech_serial_numbers row, and is what
   * applyTransition / transition need to attribute the status change and its
   * inventory_events row to the right tenant instead of the dogfood default.
   */
  organizationId: OrgId;
}

export interface RecordTestVerdictResult {
  unit: TestedUnit;
  prevStatus: string;
  nextStatus: VerdictMapping['nextStatus'];
  line: TestLineRollup | null;
  eventId: number;
}

/** Returns null when the serial unit doesn't exist. */
export async function recordTestVerdict(
  args: RecordTestVerdictArgs,
): Promise<RecordTestVerdictResult | null> {
  const { serialUnitId, verdict } = args;
  const notes = args.notes ?? null;
  const actorStaffId = args.actorStaffId ?? null;
  // Tenant scope. When present (every authenticated route call), every read/write
  // below is org-scoped so a cross-tenant serial_unit id reads as not-found (404)
  // — `pool` is the BYPASSRLS owner connection, so this explicit predicate, not
  // RLS, is what isolates tenants here. Mirrors transition()'s `orgId ? …` shape;
  // omitting org keeps the legacy unscoped SQL for any caller that lacks one.
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

  // 2. Apply the unit's new status. Two paths behind UNIFIED_ENGINE_APPLY_TRANSITION:
  //      ON  → applyTransition(): the single guarded chokepoint does the status
  //            write + atomic inventory_event + engine tap together (the engine
  //            reference impl — see UNIFIED-ENGINE-MASTER-PLAN §1.1).
  //      OFF → the legacy raw UPDATE here + appendInventoryEvent (step 4) +
  //            end-of-fn tap (step 6), byte-identical to before.
  //    Either way: skip the actual status change when it's already there
  //    (idempotent retry) but still leave the audit + tsn + event trail below.
  const useChokepoint = isUnifiedEngineApplyTransition();
  let unit = prev;
  let eventId!: number;
  // True when THIS call produced a brand-new inventory_event; false when the
  // event already existed (a retry with the same clientEventId — inventory_events
  // is UNIQUE on client_event_id, so the helper returns the existing row). Used
  // to skip the testing_results feed insert on a replay so retries don't stack
  // duplicate feed rows (the event itself is already deduped).
  let eventCreated = true;

  if (useChokepoint) {
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

  // 3. Audit row in tech_serial_numbers. Mirrors receive-line.ts' pattern
  //    (station_source defaults to TECH for testing). Only written when
  //    the unit has a parent receiving_line — the table's idempotency
  //    unique index `ux_tsn_receiving_line_serial` is partial
  //    `WHERE receiving_line_id IS NOT NULL`, so a line-less insert would
  //    sidestep the conflict guard and create a duplicate on retry.
  //    Line-less testing is rare (orphan serials); the inventory_events
  //    timeline still captures the verdict for those cases.
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
        // tech_serial_numbers.organization_id is NOT NULL with a
        // `COALESCE(current_setting('app.current_org'), <dogfood uuid>)` default,
        // so an unbound insert on the raw pool does not fail — it silently
        // stamps every non-dogfood tenant's test-verdict row as the dogfood org,
        // which is what left tsn_links tenant-incomplete. `?? undefined` (never
        // `null`) because attachTechSerial binds the column only when the value
        // is not undefined, and NULL would violate the constraint.
        organizationId: orgId,
      });
    } catch (err) {
      console.warn('[recordTestVerdict] tsn audit insert failed (non-fatal):', err);
    }
  }

  // 4. inventory_events row for the unit timeline (LEGACY path only — the
  //    chokepoint already wrote the event inside applyTransition at step 2). The
  //    event id is surfaced in the result so callers can cross-reference the
  //    verdict transition back to the timeline entry (mirrors /grade).
  if (!useChokepoint) {
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
      nextStatus: mapping.nextStatus,
      notes,
      payload: { verdict },
    });
    eventId = event.id;
    eventCreated = created;
  }

  // 4b. Recently-Tested feed row. References the unit by id only — serial
  //     number / SKU / condition are JOINed from serial_units at read time
  //     (single source of truth), never copied here. Authoritative state
  //     stays on serial_units, so a write failure here is logged, not fatal.
  //     Skipped on a replay (eventCreated === false): the first call already
  //     wrote this feed row, so re-inserting would stack a duplicate. The
  //     event is deduped by client_event_id, but testing_results has no such
  //     unique key, so the guard lives here. (Favors no-duplicates over the
  //     rare partial-crash-then-retry case; the feed is non-authoritative.)
  if (eventCreated) {
    try {
      await pool.query(
        `INSERT INTO testing_results
           (serial_unit_id, receiving_line_id, verdict, unit_status,
            tested_by, notes, inventory_event_id, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // org from the unit we already fetched — not a re-SELECT subquery (which
        // would race a concurrent delete to NULL → wrong fallback org).
        [unit.id, lineId, verdict, mapping.nextStatus, actorStaffId, notes, eventId, unit.organization_id],
      );
    } catch (err) {
      console.warn('[recordTestVerdict] testing_results insert failed (non-fatal):', err);
    }

    // "Why" signal (plan §2.3 emitter #3 — tech test-fail reasons). Only
    // non-PASS verdicts carry a "why"; TESTING_FAILED weighs 2, TEST_AGAIN 1.
    // Guarded by eventCreated like its neighbors so a clientEventId replay
    // never double-emits. Free-text tech notes ride `notes`.
    //
    // The GOVERNED "why" is a `failure_modes` row tagged on the unit
    // (`unit_failure_tags`) — written either by the bench's fail gate
    // (`TestingFailReasonSheet` → POST /api/serial-units/[id]/failure-tags) or
    // server-side by a failed QC step that names a mode
    // (`/api/serial-units/[id]/checklist` auto-tag-on-fail). It is deliberately
    // NOT written here: this function records the verdict, and the fault is a
    // separate reversible fact with its own lifecycle (a later PASS resolves
    // it) that must survive a re-test the verdict itself overwrites.
    //
    // This comment used to claim the fault was captured "at the route layer
    // (flow_context=verdict_detail)". It never was: no route read a reason, no
    // `verdict_detail` reason_codes row was ever seeded, and a bench fail
    // recorded nothing but prose — which is why the columns built to tell a
    // dead unit from a scratched one stayed empty. Fire-and-forget; never
    // fails the verdict.
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
          nextStatus: mapping.nextStatus,
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

  // 5. Line rollup. Only runs when the unit has a parent line.
  let lineRollup: TestLineRollup | null = null;

  if (lineId != null) {
    // Run the count-then-write rollup inside ONE transaction that locks the
    // receiving_line FOR UPDATE *before* counting. Without the lock, two
    // concurrent verdicts on the same line each read a stale tally and the
    // last writer clobbers the other — leaving e.g. a fully-passed line stuck
    // IN_TEST (never advances to the claim flow). Steps 1–4 already committed
    // the unit status atomically, so once the lock is held the sibling units'
    // committed statuses are visible to the re-read. Scoped by the unit's own
    // org (always present; the line shares it).
    const rollupOrg = unit.organization_id;
    lineRollup = await withTenantTransaction(rollupOrg, async (client) => {
      // Serialize concurrent rollups on this line. A non-existent / wrong-org
      // line locks nothing and the tally below returns no row → no rollup.
      // Also read the current workflow_status so the status half below can
      // CHECK-AND-SKIP: only rows that actually change status go through the
      // chokepoint (an identity transition would still list workflow_status in
      // a SET and re-fire the coarse trigger's COALESCE timestamp stamps).
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
      //   - All expected units have been TESTED and no failures
      //     → DONE / PASSED / ACCEPT (line falls off the testing queue).
      //   - Any unit ON_HOLD → FAILED / FAILED_FUNCTIONAL (claim flow).
      //   - Otherwise → IN_TEST / PENDING.
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

      // Facts half (Wave-3 writer inversion): qa_status (+ optional disposition)
      // live on receiving_line_testing now — the spine columns are dying, so the
      // rollup upserts the facts row directly (same tx client as the FOR UPDATE
      // lock above). Inline UPSERT rather than narrow.ts because the result must
      // RETURN the post-write qa/disposition pair — including an untouched
      // disposition_code when this rollup doesn't set one — exactly like the old
      // spine UPDATE's RETURNING did. Overwrite semantics, as before. The former
      // "workflow_status never in the SET" trigger concern no longer applies:
      // this write doesn't touch the spine at all.
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

      // Status half: only rows whose workflow_status actually changes route
      // through the guarded chokepoint, inside THIS tx (executor mode — the
      // FOR UPDATE re-lock on the row we already hold is a no-op). skipEvent:
      // the per-unit verdict events are already written (step 2/4) and the
      // calling route audits — the rollup must not double-write the timeline.
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
  if (!useChokepoint) {
    await tapWorkflow({
      serialUnitId: unit.id,
      event: 'test_verdict',
      input: { verdict },
      staffId: actorStaffId,
      source: 'manual',
      orgId: args.organizationId,
    });
  }

  return {
    unit,
    prevStatus: prev.current_status,
    nextStatus: mapping.nextStatus,
    line: lineRollup,
    eventId,
  };
}
