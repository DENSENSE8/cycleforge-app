/**
 * QC print-pass outbox — Pass on the /test scan station prints the unit label
 * client-side first, then sends ONE request that only enqueues a
 * `qc_print_pass_outbox` row. This module owns that row's whole life:
 *
 *   enqueue (route, one statement) → run (route `after()`, then the cron sweep
 *   for retries): claim → print record → PASS verdict + audit → DONE.
 *
 * State machine (`runQcPrintPass`):
 *   PENDING ──claim (attempts+1, claimed_at)──► work
 *     work ok                                  → DONE (processed_at)
 *     GuardRejectedError / permanent error     → FAILED + the tech's inbox row
 *     other error, attempts < MAX              → PENDING, claim released (claimed_at NULL, last_error)
 *     other error, attempts ≥ MAX              → FAILED + the tech's inbox row
 *   A claim older than CLAIM_STALE is a crashed run: claimable again.
 *
 * Every step is idempotent on the row's `client_event_id` (upsert, LABELED
 * event, label_print_jobs, TEST_PASS event), so a replayed run is a no-op.
 */

import pool from '@/lib/db';
import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { upsertSerialUnit } from '@/lib/neon/serial-units-queries';
import { recordUnitLabelPrint } from '@/lib/labels/record-unit-label-print';
import {
  QC_PRINT_PASS_FAILED_INBOX_ITEM_SQL,
  qcPrintPassFailedInboxItemParams,
} from '@/lib/notifications/assign-inbox-item';
import { QC_PRINT_PASS_FAILED } from '@/lib/notifications/event-vocabulary';
import { publishInboxItem } from '@/lib/realtime/publish';
import { GuardRejectedError, recordTestVerdict } from './recordTestVerdict';

/** After this many claims a failing row is FAILED for good. */
export const QC_PRINT_PASS_MAX_ATTEMPTS = 5;

/** A claim this old belongs to a run that died; the row is claimable again. */
const CLAIM_STALE_SQL = "interval '2 minutes'";

/** The sweep leaves a row this young to its own `after()` run. */
const SWEEP_MIN_AGE_SQL = "interval '60 seconds'";

/** Label face + verdict inputs the press carried (`qc_print_pass_outbox.payload`). */
export interface QcPrintPassPayload {
  gtin: string | null;
  symbology: 'gs1datamatrix' | 'datamatrix' | null;
  condition: string | null;
  notes: string | null;
  product_sku: string;
  sku_catalog_id: number | null;
  serial_number: string;
}

/** A claimed outbox row. */
export interface QcPrintPassRow {
  id: number;
  organizationId: OrgId;
  serialUnitId: number;
  clientEventId: string;
  actorStaffId: number | null;
  /** true = record the PASS verdict; false = print record only (a reprint). */
  pass: boolean;
  /** The unit id the label printed. */
  unitUid: string;
  payload: QcPrintPassPayload;
  /** Claims so far, this one included. */
  attempts: number;
}

/** A failure retrying cannot fix (the unit is gone, has no serial, …). */
export class QcPrintPassPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QcPrintPassPermanentError';
  }
}

// ── Enqueue (the route's hot path) ──────────────────────────────────────────

export interface EnqueueQcPrintPassInput {
  serialUnitId: number;
  clientEventId: string;
  actorStaffId: number | null;
  pass: boolean;
  unitUid: string;
  payload: QcPrintPassPayload;
}

export interface QcPrintPassEnqueued {
  outboxId: number;
  /** The row's printed id — the original press's on a replay. */
  unitUid: string;
  replayed: boolean;
}

/**
 * Insert the press's outbox row in ONE round trip, idempotent on
 * `(organization_id, client_event_id)`: a replay returns the existing row.
 * The unit must belong to the org — null when it does not.
 */
export async function enqueueQcPrintPass(
  orgId: OrgId,
  input: EnqueueQcPrintPassInput,
): Promise<QcPrintPassEnqueued | null> {
  const res = await tenantQueryOneTrip<{ id: string; unit_uid: string; replayed: boolean }>(
    orgId,
    `WITH ins AS (
       INSERT INTO qc_print_pass_outbox
         (organization_id, serial_unit_id, client_event_id, actor_staff_id, pass, unit_uid, payload)
       SELECT su.organization_id, su.id, $3::text, $4::int, $5::boolean, $6::text, $7::jsonb
         FROM serial_units su
        WHERE su.id = $2::int AND su.organization_id = $1::uuid
       ON CONFLICT (organization_id, client_event_id) DO NOTHING
       RETURNING id, unit_uid
     )
     SELECT id, unit_uid, false AS replayed FROM ins
     UNION ALL
     SELECT o.id, o.unit_uid, true AS replayed
       FROM qc_print_pass_outbox o
      WHERE o.organization_id = $1::uuid AND o.client_event_id = $3::text
        AND NOT EXISTS (SELECT 1 FROM ins)
     LIMIT 1`,
    [
      orgId,
      input.serialUnitId,
      input.clientEventId,
      input.actorStaffId,
      input.pass,
      input.unitUid,
      JSON.stringify(input.payload),
    ],
  );
  const row = res.rows[0];
  if (row) return { outboxId: Number(row.id), unitUid: row.unit_uid, replayed: row.replayed };

  // Nothing inserted and nothing visible: the unit is not in this org — or an
  // identical press committed while this statement waited on its conflict
  // (invisible to the statement's snapshot). A fresh read tells them apart.
  const replay = await tenantQueryOneTrip<{ id: string; unit_uid: string }>(
    orgId,
    `SELECT id, unit_uid FROM qc_print_pass_outbox
      WHERE organization_id = $1::uuid AND client_event_id = $2::text
      LIMIT 1`,
    [orgId, input.clientEventId],
  );
  const existing = replay.rows[0];
  return existing ? { outboxId: Number(existing.id), unitUid: existing.unit_uid, replayed: true } : null;
}

export type EnsureQcUnitUidResult =
  | { ok: true; unitUid: string }
  | { ok: false; status: 404 | 422; error: string };

/**
 * The unit's own id, minted now when it has none (rare: a unit received
 * without a catalog id). The mint is the print-record upsert — the unit keeps
 * its status; its catalog falls back to the press's SKU when the row has none.
 */
export async function ensureQcUnitUid(
  orgId: OrgId,
  args: { serialUnitId: number; productSku: string; skuCatalogId: number | null; actorStaffId: number | null },
): Promise<EnsureQcUnitUidResult> {
  const unitRes = await tenantQuery<{
    serial_number: string;
    sku: string | null;
    sku_catalog_id: number | null;
    unit_uid: string | null;
  }>(
    orgId,
    `SELECT serial_number, sku, sku_catalog_id, unit_uid
       FROM serial_units
      WHERE id = $1 AND organization_id = $2`,
    [args.serialUnitId, orgId],
  );
  const unit = unitRes.rows[0];
  if (!unit) return { ok: false, status: 404, error: 'unit not found' };
  if (unit.unit_uid) return { ok: true, unitUid: unit.unit_uid };

  const minted = await upsertSerialUnit(
    {
      serial_number: unit.serial_number,
      sku: unit.sku || args.productSku,
      sku_catalog_id: unit.sku_catalog_id ?? args.skuCatalogId,
      origin_source: 'manual',
      actor_id: args.actorStaffId,
      target_status: 'LABELED',
      target_status_on_create_only: true,
    },
    undefined,
    orgId,
  );
  const unitUid = minted?.unit.unit_uid ?? null;
  if (!unitUid) {
    return { ok: false, status: 422, error: 'the unit id could not be minted — the unit needs a catalog SKU' };
  }
  return { ok: true, unitUid };
}

// ── Run (after() and the sweep) ─────────────────────────────────────────────

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface QcPrintPassDeps {
  /** Claim a PENDING row (attempts+1); null when it is done, failed or claimed by a live run. */
  claim(orgId: OrgId, outboxId: number): Promise<QcPrintPassRow | null>;
  /** Serial upsert, LABELED event, label_print_jobs row. */
  printRecord(row: QcPrintPassRow): Promise<void>;
  /** The PASS verdict and its formal audit row. */
  recordPass(row: QcPrintPassRow): Promise<void>;
  markDone(row: QcPrintPassRow): Promise<void>;
  /** Back to the queue: claim released, error kept. */
  release(row: QcPrintPassRow, error: string): Promise<void>;
  markFailed(row: QcPrintPassRow, error: string): Promise<void>;
  /** Tell the tech who pressed, without blocking them (their inbox). */
  notifyFailed(row: QcPrintPassRow, reason: string): Promise<void>;
}

export type QcPrintPassOutcome = 'done' | 'retry' | 'failed' | 'not_claimed';

export async function runQcPrintPass(
  orgId: OrgId,
  outboxId: number,
  deps: QcPrintPassDeps = defaultQcPrintPassDeps,
): Promise<QcPrintPassOutcome> {
  const row = await deps.claim(orgId, outboxId);
  if (!row) return 'not_claimed';

  try {
    await deps.printRecord(row);
    if (row.pass) await deps.recordPass(row);
    await deps.markDone(row);
    return 'done';
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const permanent = err instanceof GuardRejectedError || err instanceof QcPrintPassPermanentError;
    if (!permanent && row.attempts < QC_PRINT_PASS_MAX_ATTEMPTS) {
      console.warn(`[qc-print-pass] outbox ${row.id} attempt ${row.attempts} failed; will retry`, err);
      await deps.release(row, reason);
      return 'retry';
    }
    console.error(`[qc-print-pass] outbox ${row.id} FAILED after ${row.attempts} attempt(s)`, err);
    await deps.markFailed(row, reason);
    try {
      await deps.notifyFailed(row, reason);
    } catch (notifyErr) {
      console.error(`[qc-print-pass] outbox ${row.id} failure notice not delivered`, notifyErr);
    }
    return 'failed';
  }
}

export interface QcPrintPassSweepResult {
  due: number;
  done: number;
  retry: number;
  failed: number;
  notClaimed: number;
  errored: number;
}

/**
 * Cron: run every PENDING row older than a minute whose claim is free or
 * stale, across orgs (owner connection — session-less, like the workflow-tap
 * reconcile). Each run claims its row itself, so a live `after()` run and the
 * sweep never both work one row.
 */
export async function sweepQcPrintPass(
  limit: number,
  deps: QcPrintPassDeps = defaultQcPrintPassDeps,
): Promise<QcPrintPassSweepResult> {
  const due = await pool.query<{ id: string; organization_id: string }>(
    `SELECT id, organization_id
       FROM qc_print_pass_outbox
      WHERE status = 'PENDING'
        AND created_at < now() - ${SWEEP_MIN_AGE_SQL}
        AND (claimed_at IS NULL OR claimed_at < now() - ${CLAIM_STALE_SQL})
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
  );
  const result: QcPrintPassSweepResult = { due: due.rows.length, done: 0, retry: 0, failed: 0, notClaimed: 0, errored: 0 };
  for (const row of due.rows) {
    try {
      const outcome = await runQcPrintPass(row.organization_id, Number(row.id), deps);
      if (outcome === 'not_claimed') result.notClaimed += 1;
      else result[outcome] += 1;
    } catch (err) {
      // The claim/mark itself failed; the claim goes stale and a later sweep retries.
      result.errored += 1;
      console.error(`[qc-print-pass] sweep: outbox ${row.id} errored`, err);
    }
  }
  return result;
}

// ── Real collaborators ──────────────────────────────────────────────────────

interface OutboxDbRow {
  id: string;
  organization_id: string;
  serial_unit_id: string;
  client_event_id: string;
  actor_staff_id: number | null;
  pass: boolean;
  unit_uid: string;
  payload: QcPrintPassPayload;
  attempts: number;
}

export const defaultQcPrintPassDeps: QcPrintPassDeps = {
  async claim(orgId, outboxId) {
    const res = await tenantQuery<OutboxDbRow>(
      orgId,
      `UPDATE qc_print_pass_outbox
          SET claimed_at = now(), attempts = attempts + 1
        WHERE id = $1 AND organization_id = $2 AND status = 'PENDING'
          AND (claimed_at IS NULL OR claimed_at < now() - ${CLAIM_STALE_SQL})
        RETURNING id, organization_id, serial_unit_id, client_event_id, actor_staff_id,
                  pass, unit_uid, payload, attempts`,
      [outboxId, orgId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      organizationId: r.organization_id,
      serialUnitId: Number(r.serial_unit_id),
      clientEventId: r.client_event_id,
      actorStaffId: r.actor_staff_id,
      pass: r.pass,
      unitUid: r.unit_uid,
      payload: r.payload,
      attempts: r.attempts,
    };
  },

  async printRecord(row) {
    // The unit's own serial keys the upsert, so the record lands on THIS unit
    // whatever the press's payload says.
    const unitRes = await tenantQuery<{ serial_number: string; sku: string | null; sku_catalog_id: number | null }>(
      row.organizationId,
      `SELECT serial_number, sku, sku_catalog_id
         FROM serial_units
        WHERE id = $1 AND organization_id = $2`,
      [row.serialUnitId, row.organizationId],
    );
    const unit = unitRes.rows[0];
    if (!unit) throw new QcPrintPassPermanentError(`unit ${row.serialUnitId} not found`);

    const printed = await recordUnitLabelPrint(
      {
        serialNumber: unit.serial_number,
        sku: unit.sku || row.payload.product_sku || null,
        skuCatalogId: unit.sku_catalog_id ?? row.payload.sku_catalog_id,
        unitUid: row.unitUid,
        conditionGrade: row.payload.condition,
        actorStaffId: row.actorStaffId,
        notes: row.payload.notes,
        gtin: row.payload.gtin,
        symbology: row.payload.symbology,
        clientEventId: row.clientEventId,
        eventPayload: { print_class: 'print', qc_print_pass_outbox_id: row.id },
      },
      row.organizationId,
    );
    if (!printed) throw new QcPrintPassPermanentError(`unit ${row.serialUnitId} has no serial number`);
    if (printed.unitUid !== row.unitUid) {
      console.warn(
        `[qc-print-pass] outbox ${row.id}: label printed ${row.unitUid} but unit ${row.serialUnitId} is ${printed.unitUid}`,
      );
    }
    if (printed.failed.length > 0) {
      throw new Error(`print record incomplete: ${printed.failed.join(', ')}`);
    }
  },

  async recordPass(row) {
    const result = await recordTestVerdict({
      serialUnitId: row.serialUnitId,
      verdict: 'PASS',
      notes: row.payload.notes,
      clientEventId: row.clientEventId,
      actorStaffId: row.actorStaffId,
      organizationId: row.organizationId,
    });
    if (!result) throw new QcPrintPassPermanentError(`unit ${row.serialUnitId} not found`);

    // The formal audit row POST /api/serial-units/[id]/test writes, with no
    // live request: actor and org ride the overrides.
    await recordAudit(pool, null, null, {
      source: 'tech.qc-verdict',
      action: AUDIT_ACTION.TECH_QC_PASS,
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.unit.id,
      method: 'manual',
      before: { status: result.prevStatus },
      after: { status: result.nextStatus },
      note: row.payload.notes,
      actorStaffIdOverride: row.actorStaffId,
      organizationIdOverride: row.organizationId,
      extra: {
        verdict: 'PASS',
        receiving_line_id: result.unit.origin_receiving_line_id,
        serial_number: result.unit.serial_number,
        sku: result.unit.sku,
        inventory_event_id: result.eventId,
        qc_print_pass_outbox_id: row.id,
      },
    });
  },

  async markDone(row) {
    await tenantQuery(
      row.organizationId,
      `UPDATE qc_print_pass_outbox
          SET status = 'DONE', processed_at = now(), last_error = NULL
        WHERE id = $1 AND organization_id = $2`,
      [row.id, row.organizationId],
    );
  },

  async release(row, error) {
    await tenantQuery(
      row.organizationId,
      `UPDATE qc_print_pass_outbox
          SET claimed_at = NULL, last_error = $3
        WHERE id = $1 AND organization_id = $2`,
      [row.id, row.organizationId, error],
    );
  },

  async markFailed(row, error) {
    await tenantQuery(
      row.organizationId,
      `UPDATE qc_print_pass_outbox
          SET status = 'FAILED', processed_at = now(), last_error = $3
        WHERE id = $1 AND organization_id = $2`,
      [row.id, row.organizationId, error],
    );
  },

  async notifyFailed(row, reason) {
    if (row.actorStaffId == null) return;
    const serial = row.payload.serial_number || `unit ${row.serialUnitId}`;
    const title = row.pass ? `Pass not saved · ${serial}` : `Label print not recorded · ${serial}`;
    const inserted = await tenantQuery<{ id: string }>(
      row.organizationId,
      QC_PRINT_PASS_FAILED_INBOX_ITEM_SQL,
      qcPrintPassFailedInboxItemParams(row.organizationId, {
        staffId: row.actorStaffId,
        serialUnitId: row.serialUnitId,
        outboxId: row.id,
        title,
        note: reason,
      }),
    );
    const itemId = inserted.rows[0]?.id;
    if (itemId == null) return; // already delivered for this row
    await publishInboxItem({
      organizationId: row.organizationId,
      recipientId: row.actorStaffId,
      itemId: Number(itemId),
      entityType: 'serial_unit',
      entityId: row.serialUnitId,
      eventKey: QC_PRINT_PASS_FAILED,
      actorStaffId: null,
      note: title,
      urgent: true,
    });
  },
};
