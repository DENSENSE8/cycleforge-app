/** Unbox lookup-scan — the SERVER half of `unbox-scan-kind.ts`. */

import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import {
  RECEIVING_LOOKUP_SCAN_EVENT,
  classifyScanKind,
  lookupScanClientEventId,
  type UnboxScanKind,
} from '@/lib/receiving/unbox-scan-kind';

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

/** The carton facts a lookup verdict carries back to the operator. */
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

/** Classify a scan against the carton's live state, with the facts the receipt needs to render. */
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
}

/** Record that an operator scanned an already-unboxed carton to inspect it. */
export async function recordUnboxLookupScan(
  args: RecordUnboxLookupScanArgs,
  deps: UnboxLookupScanDeps = defaultDeps,
): Promise<void> {
  const occurredAtIso = (args.occurredAt ?? new Date()).toISOString();
  try {
    const workflowNodeId = await deps.resolveWorkflowNodeId('unbox', args.organizationId);
    await deps.recordOpsEvent({
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
