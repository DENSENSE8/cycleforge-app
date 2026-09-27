import type { PoolClient } from 'pg';
import type pool from '@/lib/db';
import { mergeSerialsFromTsnRows } from '@/lib/tech/serialFields';

/**
 * Session helpers shared by the desk scan writers — the Picker desk tracking
 * scan (`POST /api/picking/desk/scan`) and the FNSKU desk scan
 * (`POST /api/fba/fnsku-scan`). Both anchor a station_activity_logs row and
 * answer with the same order-card payload.
 */

/** A raw pool or an open transaction's client. */
type Db = Pick<PoolClient, 'query'> | typeof pool;

export type ScanSourceStation = 'TECH' | 'FBA';

export function resolveScanSourceStation(value: unknown): ScanSourceStation {
  return String(value || '').trim().toUpperCase() === 'FBA' ? 'FBA' : 'TECH';
}

export async function resolveStaff(db: Db, techId: number) {
  const r = await db.query(`SELECT id, name FROM staff WHERE id = $1 LIMIT 1`, [techId]);
  return r.rows[0] as { id: number; name: string } | undefined;
}

/** Get existing serials linked to a SAL anchor row. */
export async function getSerialsBySalId(db: Db, salId: number): Promise<string[]> {
  const r = await db.query(
    `SELECT serial_number FROM tech_serial_numbers
     WHERE context_station_activity_log_id = $1 ORDER BY id`,
    [salId],
  );
  return mergeSerialsFromTsnRows(r.rows);
}

export async function getScannedSkuCodes(
  db: Db,
  params: { shipmentId?: number | null; trackingValue?: string | null },
): Promise<string[]> {
  const shipmentId = params.shipmentId ?? null;
  const trackingValue = String(params.trackingValue || '').trim();
  if (!shipmentId && !trackingValue) return [];

  const r = await db.query(
    `SELECT DISTINCT BTRIM(static_sku) AS static_sku
     FROM v_sku
     WHERE (shipment_id = $1)
        OR ($2::text <> '' AND BTRIM(COALESCE(shipping_tracking_number, '')) = BTRIM($2))
     ORDER BY BTRIM(static_sku) ASC`,
    [shipmentId, trackingValue],
  );

  return r.rows
    .map((row) => String(row.static_sku || '').trim())
    .filter(Boolean);
}
