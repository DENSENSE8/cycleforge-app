/** tech-serial.ts ──────────────────────────────────────────────────────────────────── Canonical writer for `tech_serial_numbers` lineage rows. */

import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PoolClient } from 'pg';

export type TechSerialStationSource = 'RECEIVING' | 'TECH' | (string & {});
export type TechSerialType = 'SERIAL' | 'FNSKU' | (string & {});

export interface AttachTechSerialInput {
  /** Raw serial; the helper upper-cases it to match the table's convention. */
  serialNumber: string;
  /** FK back to the serial_units master. Strongly recommended — its absence is
   *  exactly the drift this helper exists to prevent. */
  serialUnitId?: number | null;
  serialType?: TechSerialType;
  /** Origin station. Table default is 'TECH'; receiving paths pass 'RECEIVING'. */
  stationSource?: TechSerialStationSource;
  testedBy?: number | null;
  receivingLineId?: number | null;
  shipmentId?: number | null;
  scanRef?: string | null;
  notes?: string | null;
  fnsku?: string | null;
  sourceSkuId?: number | null;
  fbaShipmentId?: number | null;
  fbaShipmentItemId?: number | null;
  contextStationActivityLogId?: number | null;
  ordersExceptionId?: number | null;
  fnskuLogId?: number | null;
  /**
   * CF-03: orders.id this serial was attached to. Null for exception / FBA /
   * receiving paths that are not order-bound. Prefer over shipment_id joins.
   */
  orderId?: number | null;
  /** Tenant scope. */
  organizationId?: string;
  /**
   * Historical import timestamp as a true instant (ISO-8601 with `Z`/offset);
   * a naive wall string would be read in the DB session zone. Omit for live
   * scans so the DB clock owns it.
   */
  createdAt?: string | null;
}

/** Insert one `tech_serial_numbers` lineage row. */
export async function attachTechSerial(
  input: AttachTechSerialInput,
  executor: Pick<PoolClient, 'query'> = pool,
  orgId?: OrgId,
): Promise<{ id: number | null }> {
  // Fixed core columns (stable param positions; tests assert on these).
  const cols = [
    'serial_number', 'serial_type', 'tested_by', 'station_source',
    'receiving_line_id', 'shipment_id', 'scan_ref', 'notes',
    'fnsku', 'source_sku_id', 'fba_shipment_id', 'fba_shipment_item_id',
    'context_station_activity_log_id', 'orders_exception_id', 'serial_unit_id',
    'order_id',
  ];
  const vals: unknown[] = [
    input.serialNumber.toUpperCase(),
    input.serialType ?? 'SERIAL',
    input.testedBy ?? null,
    input.stationSource ?? 'TECH',
    input.receivingLineId ?? null,
    input.shipmentId ?? null,
    input.scanRef ?? null,
    input.notes ?? null,
    input.fnsku ?? null,
    input.sourceSkuId ?? null,
    input.fbaShipmentId ?? null,
    input.fbaShipmentItemId ?? null,
    input.contextStationActivityLogId ?? null,
    input.ordersExceptionId ?? null,
    input.serialUnitId ?? null,
    input.orderId ?? null,
  ];
  // fnsku_log_id is plain-nullable — always safe to bind.
  if (input.fnskuLogId !== undefined) {
    cols.push('fnsku_log_id');
    vals.push(input.fnskuLogId ?? null);
  }
  // organization_id is NOT NULL w/ session default. Bind it when a threaded
  // `orgId` is supplied (which always wins) OR — preserving the prior
  // behavior — when `input.organizationId` is explicitly provided.
  const effectiveOrgId = orgId ?? input.organizationId;
  if (effectiveOrgId !== undefined) {
    cols.push('organization_id');
    vals.push(effectiveOrgId);
  }
  if (input.createdAt !== undefined) {
    cols.push('created_at');
    vals.push(input.createdAt ?? null);
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const sql =
    `INSERT INTO tech_serial_numbers (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT DO NOTHING
     RETURNING id`;

  // No threaded org → byte-identical legacy path: raw executor, no GUC.
  if (orgId === undefined) {
    const result = await executor.query<{ id: number }>(sql, vals);
    return { id: result.rows[0]?.id ?? null };
  }

  // Threaded org + a caller-supplied executor (open txn): set the GUC on that
  // client with a txn-local set_config so we co-commit inside the caller's
  // transaction (do NOT open a nested one), then run the stamped INSERT.
  if (executor !== pool) {
    await executor.query("SELECT set_config('app.current_org', $1, true)", [orgId]);
    const result = await executor.query<{ id: number }>(sql, vals);
    return { id: result.rows[0]?.id ?? null };
  }

  // Threaded org + default pool executor: route the standalone write through
  // the tenant transaction so the GUC is set (BEGIN/COMMIT) around it.
  return withTenantTransaction(orgId, async (client) => {
    const result = await client.query<{ id: number }>(sql, vals);
    return { id: result.rows[0]?.id ?? null };
  });
}
