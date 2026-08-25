/**
 * Unbox lookup-scan — the SERVER half of `unbox-scan-kind.ts`.
 *
 * Reads the carton's completion milestone to classify a scan, and records a
 * lookup as an append-only ops event that never touches work attribution.
 *
 * Why an ops event and not a column on `receiving_scans`: that table holds
 * exactly ONE row per (tracking_number, receiving_id) — `ux_receiving_scans_
 * tracking_receiving` is UNIQUE. There is no per-scan row to tag, so a
 * `scan_kind` column could not express "this carton was worked once and looked
 * at three times" at all. `ops_events` is already the append-only spine, its
 * `event_type` is free text (no CHECK — only `entity_type` is constrained), and
 * it carries the actor + Studio-node axes the other scan events use. So this
 * needs no migration.
 *
 * Deps are injectable (house `Deps` pattern, backend-patterns.md) so the whole
 * path is unit-testable with zero DB.
 */

import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import {
  RECEIVING_LOOKUP_SCAN_EVENT,
  classifyScanKind,
  lookupScanClientEventId,
  type UnboxScanKind,
} from '@/lib/receiving/unbox-scan-kind';
import type { SessionAttribution } from '@/lib/sessions/attribution';

export interface UnboxLookupScanDeps {
  query: (text: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  recordOpsEvent: typeof recordOpsEvent;
  resolveWorkflowNodeId: (surface: 'unbox', orgId: string) => Promise<string | null>;
}

const defaultDeps: UnboxLookupScanDeps = {
  query: (text, params) => pool.query(text, params) as Promise<{ rows: Array<Record<string, unknown>> }>,
  recordOpsEvent,
  resolveWorkflowNodeId: (surface, orgId) => resolveSurfaceWorkflowNodeId(surface, orgId),
};

/**
 * The carton facts a lookup verdict carries back to the operator.
 *
 * The kind alone is enough for the WRITE decisions, but not for the receipt:
 * that has to name who actually did the work and offer a way into the package's
 * details. Both are already on the row we read to classify, so they ride along
 * in the same round trip rather than costing the scan a second one.
 */
export interface UnboxScanState {
  kind: UnboxScanKind;
  /** `receiving_unbox.unboxed_at` — the completion milestone. */
  unboxedAt: string | null;
  /** Staff who completed the unbox, when the row names one. */
  unboxedByName: string | null;
  /** PO number, for the receipt's "open the details" search jump. */
  poNumber: string | null;
}

const WORK_STATE: UnboxScanState = {
  kind: 'work',
  unboxedAt: null,
  unboxedByName: null,
  poNumber: null,
};

/**
 * Classify a scan against the carton's live state, with the facts the receipt
 * needs to render.
 *
 * Fails **open to `work`**: if the street row is missing or the read throws, the
 * scan keeps today's full behavior. That direction is deliberate — a
 * misclassified work scan loses nothing, while a misclassified lookup would
 * silently skip a real attribution write.
 *
 * LEFT JOINs throughout: a carton with no street row has never been unboxed
 * (→ work), and an unfound carton legitimately has no PO number.
 */
export async function resolveUnboxScanState(
  organizationId: string,
  receivingId: number,
  intakeSurface: 'unbox' | 'triage',
  deps: UnboxLookupScanDeps = defaultDeps,
): Promise<UnboxScanState> {
  if (intakeSurface !== 'unbox') return WORK_STATE;
  try {
    const res = await deps.query(
      `SELECT ru.unboxed_at,
              staff_unbox.name AS unboxed_by_name,
              rc.zoho_purchaseorder_number
         FROM receiving_carton rc
         LEFT JOIN receiving_unbox ru
           ON ru.receiving_id = rc.id AND ru.organization_id = rc.organization_id
         LEFT JOIN staff staff_unbox ON staff_unbox.id = ru.unboxed_by
        WHERE rc.id = $1 AND rc.organization_id = $2
        LIMIT 1`,
      [receivingId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return WORK_STATE;
    const unboxedAt = (row.unboxed_at ?? null) as string | null;
    return {
      kind: classifyScanKind(intakeSurface, { unboxedAt }),
      unboxedAt,
      unboxedByName: (row.unboxed_by_name ?? null) as string | null,
      poNumber: (row.zoho_purchaseorder_number ?? null) as string | null,
    };
  } catch (err) {
    console.warn('[resolveUnboxScanState] read failed — treating scan as work:', err);
    return WORK_STATE;
  }
}

/**
 * Kind-only wrapper for the call sites that decide a WRITE and never render.
 * Delegates so there is one query and one fail-open branch, not two.
 */
export async function resolveUnboxScanKind(
  organizationId: string,
  receivingId: number,
  intakeSurface: 'unbox' | 'triage',
  deps: UnboxLookupScanDeps = defaultDeps,
): Promise<UnboxScanKind> {
  const state = await resolveUnboxScanState(organizationId, receivingId, intakeSurface, deps);
  return state.kind;
}

interface RecordUnboxLookupScanArgs {
  organizationId: string;
  receivingId: number;
  actorStaffId: number | null;
  trackingNumber: string;
  /** Occurrence instant; defaults to now. Also keys the client-event id. */
  occurredAt?: Date;
  /**
   * The unbox session this lookup happened inside. Required, un-defaulted —
   * a lookup scan is operator work at a bench, so it is exactly the kind of
   * event a session report is expected to contain. Pass `NO_SESSION` until the
   * Unbox surface opens one.
   */
  session: SessionAttribution;
}

/**
 * Record that an operator scanned an already-unboxed carton to inspect it.
 *
 * Writes ONLY the append-only ops event: no `receiving_scans` upsert (so
 * `scanned_by` keeps naming whoever actually did the work), no
 * `UNBOX_SCAN_OPENED`, no `receiving_unbox` stamp. Best-effort — a failure here
 * must never break the operator's lookup.
 */
export async function recordUnboxLookupScan(
  args: RecordUnboxLookupScanArgs,
  deps: UnboxLookupScanDeps = defaultDeps,
): Promise<void> {
  const occurredAtIso = (args.occurredAt ?? new Date()).toISOString();
  try {
    const workflowNodeId = await deps.resolveWorkflowNodeId('unbox', args.organizationId);
    await deps.recordOpsEvent({
      session: args.session,
      organizationId: args.organizationId,
      entityType: 'receiving',
      entityId: args.receivingId,
      eventType: RECEIVING_LOOKUP_SCAN_EVENT,
      actorStaffId: args.actorStaffId,
      occurredAt: occurredAtIso,
      clientEventId: lookupScanClientEventId({
        organizationId: args.organizationId,
        receivingId: args.receivingId,
        occurredAtIso,
      }),
      workflowNodeId,
      payload: { trackingNumber: args.trackingNumber, scanKind: 'lookup' },
    });
  } catch (err) {
    console.warn('[recordUnboxLookupScan] ops_events write skipped:', err);
  }
}
