/** Canonical write boundary for `packer_logs`. */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  PACKER_LOG_CAPTURING,
  PACKER_LOG_COMPLETED,
  type PackerLogCompletionState,
} from './packer-log-completion';

type Queryable = Pick<PoolClient, 'query'>;

/** `created_at` (timestamptz) as a UTC ISO-8601 instant — parseable on every client. */
const CREATED_AT_ISO = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;

export interface PackerLogWriteRow {
  id: number;
  createdAt: string;
  completionState: PackerLogCompletionState;
}

export interface CreatePackerLogInput {
  organizationId: OrgId;
  shipmentId?: number | null;
  scanRef?: string | null;
  trackingType: string;
  packedBy?: number | null;
  /**
   * Historical pack time as a warehouse (America/Los_Angeles) wall clock
   * `YYYY-MM-DD HH:MM:SS` — the `normalizePSTTimestamp()` shape every caller
   * passes. Omit for live scans so the DB clock owns it.
   */
  createdAt?: string | null;
  completionState?: PackerLogCompletionState;
  /** Identifies the calling workflow in the canonical event payload. */
  source: string;
  /** Preserve import/rescan sites whose existing contract is conflict=no-op. */
  onConflictDoNothing?: boolean;
}

interface RawPackerLogRow {
  id: number;
  created_at: string;
  completion_state: PackerLogCompletionState;
}

function eventTypeFor(trackingType: string, completionState: PackerLogCompletionState): string {
  if (completionState === PACKER_LOG_CAPTURING) return 'pack_capture_started';
  return trackingType === 'ORDERS' ? 'pack_completed' : 'pack_scan_recorded';
}

async function emitPackerLogEvent(
  db: Queryable,
  row: RawPackerLogRow,
  input: Pick<
    CreatePackerLogInput,
    'organizationId' | 'shipmentId' | 'scanRef' | 'trackingType' | 'packedBy' | 'source'
  >,
  eventType = eventTypeFor(input.trackingType, row.completion_state),
): Promise<void> {
  await db.query(
    `INSERT INTO ops_events (
       organization_id, occurred_at, event_type, entity_type, entity_id,
       actor_staff_id, client_event_id, workflow_node_id, payload
     ) VALUES (
       $1::uuid, $2::timestamptz, $3, 'other', $4::bigint,
       $5::int, $6, NULL, $7::jsonb
     )
     ON CONFLICT (client_event_id) DO NOTHING`,
    [
      input.organizationId,
      row.created_at,
      eventType,
      row.id,
      input.packedBy ?? null,
      `packer-log:${row.id}:${eventType}`,
      JSON.stringify({
        source: input.source,
        packerLogId: row.id,
        shipmentId: input.shipmentId ?? null,
        scanRef: input.scanRef ?? null,
        trackingType: input.trackingType,
        completionState: row.completion_state,
      }),
    ],
  );
}

function normalizeRow(row: RawPackerLogRow): PackerLogWriteRow {
  return {
    id: Number(row.id),
    createdAt: row.created_at,
    completionState: row.completion_state,
  };
}

/** Insert one compatibility packer log and its canonical event. */
export async function createPackerLog(
  db: Queryable,
  input: CreatePackerLogInput,
): Promise<PackerLogWriteRow | null> {
  const completionState = input.completionState ?? PACKER_LOG_COMPLETED;
  const conflictClause = input.onConflictDoNothing ? 'ON CONFLICT DO NOTHING' : '';
  const inserted = await db.query<RawPackerLogRow>(
    `INSERT INTO packer_logs (
       organization_id, shipment_id, scan_ref, tracking_type,
       completion_state, packed_by, created_at
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6,
               COALESCE(($7::timestamp AT TIME ZONE 'America/Los_Angeles'), NOW()))
     ${conflictClause}
     RETURNING id, ${CREATED_AT_ISO}, completion_state`,
    [
      input.organizationId,
      input.shipmentId ?? null,
      input.scanRef ?? null,
      input.trackingType,
      completionState,
      input.packedBy ?? null,
      input.createdAt ?? null,
    ],
  );
  const row = inserted.rows[0];
  if (!row) return null;
  await emitPackerLogEvent(db, row, input);
  return normalizeRow(row);
}

export interface StartPackerLogCaptureInput {
  organizationId: OrgId;
  shipmentId: number;
  scanRef: string;
  packedBy: number;
  source: string;
}

/** Start or resume the single active photo-capture parent for a shipment. */
export async function startPackerLogCapture(
  db: Queryable,
  input: StartPackerLogCaptureInput,
): Promise<PackerLogWriteRow> {
  const inserted = await db.query<RawPackerLogRow>(
    `INSERT INTO packer_logs (
       organization_id, shipment_id, scan_ref, tracking_type,
       completion_state, packed_by
     ) VALUES ($1::uuid, $2, $3, 'ORDERS', $4, $5)
     ON CONFLICT (organization_id, shipment_id)
       WHERE completion_state = 'CAPTURING' AND shipment_id IS NOT NULL
     DO UPDATE SET packed_by = EXCLUDED.packed_by, updated_at = NOW()
     RETURNING id, ${CREATED_AT_ISO}, completion_state`,
    [
      input.organizationId,
      input.shipmentId,
      input.scanRef,
      PACKER_LOG_CAPTURING,
      input.packedBy,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error('Could not start packing evidence.');
  await emitPackerLogEvent(db, row, {
    ...input,
    trackingType: 'ORDERS',
  });
  return normalizeRow(row);
}

export interface MutatePackerLogInput {
  organizationId: OrgId;
  packerLogId: number;
  packedBy: number;
  source: string;
}

/** Refresh actor/timestamp for an existing compatibility row. */
export async function touchPackerLog(
  db: Queryable,
  input: MutatePackerLogInput,
): Promise<PackerLogWriteRow | null> {
  const updated = await db.query<RawPackerLogRow>(
    `UPDATE packer_logs
        SET updated_at = NOW(), packed_by = $2
      WHERE id = $1 AND organization_id = $3::uuid
      RETURNING id, ${CREATED_AT_ISO}, completion_state`,
    [input.packerLogId, input.packedBy, input.organizationId],
  );
  return updated.rows[0] ? normalizeRow(updated.rows[0]) : null;
}

/** Promote a locked CAPTURING row to a completed physical-pack fact. */
export async function finalizePackerLogCapture(
  db: Queryable,
  input: MutatePackerLogInput & { shipmentId?: number | null; scanRef?: string | null },
): Promise<PackerLogWriteRow | null> {
  const updated = await db.query<RawPackerLogRow>(
    `UPDATE packer_logs
        SET completion_state = $2, packed_by = $3, updated_at = NOW()
      WHERE id = $1
        AND organization_id = $4::uuid
        AND completion_state = $5
      RETURNING id, ${CREATED_AT_ISO}, completion_state`,
    [
      input.packerLogId,
      PACKER_LOG_COMPLETED,
      input.packedBy,
      input.organizationId,
      PACKER_LOG_CAPTURING,
    ],
  );
  const row = updated.rows[0];
  if (!row) return null;
  await emitPackerLogEvent(db, row, {
    organizationId: input.organizationId,
    shipmentId: input.shipmentId ?? null,
    scanRef: input.scanRef ?? null,
    trackingType: 'ORDERS',
    packedBy: input.packedBy,
    source: input.source,
  }, 'pack_completed');
  return normalizeRow(row);
}
