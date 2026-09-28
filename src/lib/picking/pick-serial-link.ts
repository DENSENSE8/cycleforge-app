/**
 * Close the outbound loop at pick: the serial the picker's QC label names
 * becomes the order's serial.
 *
 * The outbound order reads its serials from `tech_serial_numbers` bound by
 * `order_id` (`orders-list.ts` / `orders-queries.ts`, CF-03). QC writes the
 * unit's lineage row unbound (no order yet), and a pick only moved
 * `order_unit_allocations` + `serial_units` — so the order never learned the
 * serial. `linkPickedSerialToOrder` writes the order-bound row inside the
 * pick's transaction, carrying the QC tester forward; `unlinkPickedSerialFromOrder`
 * is its inverse for an un-pick.
 */

import type { PoolClient } from 'pg';
import { attachTechSerial } from '@/lib/inventory/tech-serial';
import type { OrgId } from '@/lib/tenancy/constants';
import { pickScanKey } from '@/lib/picking/pick-scan-unit';

type Client = Pick<PoolClient, 'query'>;

/** The `station_source` a pick-bound lineage row carries (picks run at PACK). */
const PICK_STATION_SOURCE = 'PACK';

export interface LockedPickUnit {
  id: number;
  sku: string | null;
  current_status: string;
  serial_number: string | null;
}

/**
 * Resolve + lock the unit a pick scan names — a printed unit label (unit_uid,
 * GS1 `(01)(21)`, Digital Link, `U-` handle) or a typed serial. A numeric id
 * is honoured only from an explicit handle (`U-{id}`, `/m/u/{id}`), never from
 * a bare scan, so an all-digit serial cannot lock the wrong unit.
 */
export async function lockUnitForPickScan(
  client: Client,
  orgId: OrgId,
  raw: string,
): Promise<{ unit: LockedPickUnit; scanToken: string } | null> {
  const scan = pickScanKey(raw);
  if (!scan) return null;
  const idParam = scan.kind === 'label' && /^\d+$/.test(scan.key) ? Number(scan.key) : null;
  const { rows } = await client.query<LockedPickUnit>(
    `SELECT id, sku, current_status::text AS current_status, serial_number
       FROM serial_units
      WHERE organization_id = $1
        AND (id = $2 OR normalized_serial = UPPER(BTRIM($3)) OR unit_uid = BTRIM($3))
      ORDER BY (id = $2) DESC NULLS LAST, (normalized_serial = UPPER(BTRIM($3))) DESC
      LIMIT 1
      FOR UPDATE`,
    [orgId, idParam, scan.key],
  );
  const unit = rows[0];
  return unit ? { unit, scanToken: scan.key.toUpperCase() } : null;
}

/**
 * Bind the picked unit's serial to the order. Idempotent: a unit (or its
 * serial) already bound to the order — by an earlier pick or the desk serial
 * scan — writes nothing. Returns the new row id, or `null` when nothing was
 * written (already bound, or the unit carries no serial).
 */
export async function linkPickedSerialToOrder(
  client: Client,
  orgId: OrgId,
  input: { serialUnitId: number; orderId: number },
): Promise<number | null> {
  const { rows } = await client.query<{
    serial: string;
    unit_uid: string | null;
    shipment_id: number | null;
    tested_by: number | null;
    already: boolean;
  }>(
    `SELECT UPPER(BTRIM(su.serial_number)) AS serial,
            su.unit_uid,
            o.shipment_id,
            (SELECT t.tested_by
               FROM tech_serial_numbers t
              WHERE t.organization_id = su.organization_id
                AND t.serial_unit_id = su.id
                AND t.order_id IS NULL
                AND t.tested_by IS NOT NULL
              ORDER BY t.created_at DESC, t.id DESC
              LIMIT 1) AS tested_by,
            EXISTS (
              SELECT 1 FROM tech_serial_numbers b
               WHERE b.organization_id = su.organization_id
                 AND b.order_id = o.id
                 AND (b.serial_unit_id = su.id OR UPPER(BTRIM(b.serial_number)) = UPPER(BTRIM(su.serial_number)))
            ) AS already
       FROM serial_units su
       JOIN orders o ON o.id = $3 AND o.organization_id = su.organization_id
      WHERE su.id = $2
        AND su.organization_id = $1
        AND BTRIM(COALESCE(su.serial_number, '')) <> ''`,
    [orgId, input.serialUnitId, input.orderId],
  );
  const facts = rows[0];
  if (!facts || facts.already) return null;
  const written = await attachTechSerial(
    {
      serialNumber: facts.serial,
      serialUnitId: input.serialUnitId,
      stationSource: PICK_STATION_SOURCE,
      testedBy: facts.tested_by,
      shipmentId: facts.shipment_id,
      scanRef: facts.unit_uid,
      orderId: input.orderId,
    },
    client,
    orgId,
  );
  return written.id;
}

/** Inverse of {@link linkPickedSerialToOrder} for an un-pick: drops only the pick-bound row. */
export async function unlinkPickedSerialFromOrder(
  client: Client,
  orgId: OrgId,
  input: { serialUnitId: number; orderId: number },
): Promise<void> {
  await client.query(
    `DELETE FROM tech_serial_numbers
      WHERE organization_id = $1
        AND serial_unit_id = $2
        AND order_id = $3
        AND station_source = $4`,
    [orgId, input.serialUnitId, input.orderId, PICK_STATION_SOURCE],
  );
}
