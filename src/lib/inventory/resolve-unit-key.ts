/** Resolve a scanned/typed string to the serial unit it names — org-scoped. */

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
