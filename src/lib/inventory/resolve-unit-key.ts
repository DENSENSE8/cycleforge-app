/**
 * Resolve a scanned/typed string to the serial unit it names — org-scoped.
 *
 * Resolution order mirrors `GET /api/serial-units/[id]`: numeric
 * `serial_units.id` → `normalized_serial` → minted `unit_uid`. That order is
 * the contract a printed unit label already relies on, so a command sticker
 * acting on "the unit I just scanned" resolves the same value the unit page
 * would open.
 *
 * A narrower job than that route's read (which projects a full unit + timeline
 * + photos), so this is a sibling rather than a refactor of it: a command only
 * needs the id and the state it is transitioning from.
 *
 * The raw value is decoded through `unwrapScannedSerial` first, so a printed
 * `U-…` handle or a GS1 `(01)…(21)…` element string resolves as readily as a
 * hand-typed serial.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { unwrapScannedSerial } from '@/lib/barcode-routing';

export interface ResolvedUnitKey {
  id: number;
  serialNumber: string | null;
  currentStatus: string;
}

interface UnitRow {
  id: number;
  serial_number: string | null;
  current_status: string;
}

const SELECT =
  `SELECT id, serial_number, current_status::text AS current_status
     FROM serial_units`;

export async function resolveUnitByScanKey(
  orgId: OrgId,
  raw: string,
): Promise<ResolvedUnitKey | null> {
  const key = unwrapScannedSerial(raw);
  if (!key) return null;

  const attempts: Array<{ where: string; param: string | number }> = [];
  if (/^\d+$/.test(key)) attempts.push({ where: 'id = $1', param: Number(key) });
  attempts.push({ where: 'normalized_serial = UPPER(TRIM($1))', param: key });
  attempts.push({ where: 'unit_uid = $1', param: key });

  for (const attempt of attempts) {
    const { rows } = await tenantQuery<UnitRow>(
      orgId,
      `${SELECT} WHERE ${attempt.where} AND organization_id = $2 LIMIT 1`,
      [attempt.param, orgId],
    );
    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        serialNumber: row.serial_number,
        currentStatus: row.current_status,
      };
    }
  }
  return null;
}
