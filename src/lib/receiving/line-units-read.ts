/** Read side of `receiving_line_unit`: the per-line wire shape and the planner's view of already-read units. */

import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ReceivingLineUnitView } from '@/lib/receiving/receiving-line-row';
import type { ExistingLineUnit } from '@/lib/receiving/ensure-line-units';

function toPositiveLineId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// condition_grade is an enum — cast to text so the driver hands back a
// plain string rather than the enum's OID-typed value.
const LINE_UNITS_SELECT_SQL = `SELECT u.receiving_line_id, u.id, u.ordinal, u.serial_unit_id,
            su.serial_number, u.serial_absent, u.serial_absent_reason,
            u.condition_grade::text AS condition_grade
       FROM receiving_line_unit u
       LEFT JOIN serial_units su
         ON su.id = u.serial_unit_id AND su.organization_id = u.organization_id`;

/** {@link fetchLineUnits}'s read for every line of ONE carton: `$1` receiving id, `$2` org. Group the rows with {@link groupLineUnitRows}. */
export const CARTON_LINE_UNITS_SQL = `${LINE_UNITS_SELECT_SQL}
       JOIN receiving_line rl
         ON rl.id = u.receiving_line_id AND rl.organization_id = u.organization_id
      WHERE u.organization_id = $2 AND rl.receiving_id = $1
      ORDER BY u.receiving_line_id ASC, u.ordinal ASC`;

/** Group unit rows (ordered by line, ordinal) into the per-line wire shape. */
export function groupLineUnitRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): Map<number, ReceivingLineUnitView[]> {
  const grouped = new Map<number, ReceivingLineUnitView[]>();
  for (const row of rows) {
    const lineId = Number(row.receiving_line_id);
    if (!Number.isFinite(lineId)) continue;
    const view: ReceivingLineUnitView = {
      // BIGSERIAL arrives as a string from node-postgres (no int8 parser here).
      id: Number(row.id),
      ordinal: Number(row.ordinal),
      serial_unit_id: row.serial_unit_id != null ? Number(row.serial_unit_id) : null,
      serial: (row.serial_number as string | null) ?? null,
      serial_absent: !!row.serial_absent,
      serial_absent_reason: (row.serial_absent_reason as string | null) ?? null,
      condition_grade: (row.condition_grade as string | null) ?? null,
    };
    const bucket = grouped.get(lineId);
    if (bucket) bucket.push(view);
    else grouped.set(lineId, [view]);
  }
  return grouped;
}

/** The planner's view of units the caller already read, so `ensureLineUnitsSafe` need not re-load them. */
export function existingLineUnitsFromViews(
  unitsByLine: ReadonlyMap<number, ReadonlyArray<ReceivingLineUnitView>>,
): Map<number, ExistingLineUnit[]> {
  const existing = new Map<number, ExistingLineUnit[]>();
  for (const [lineId, units] of unitsByLine) {
    existing.set(
      lineId,
      units.map((u) => ({
        id: u.id,
        ordinal: u.ordinal,
        serialUnitId: u.serial_unit_id,
        serialAbsent: u.serial_absent,
      })),
    );
  }
  return existing;
}

/** Injectable collaborators for {@link fetchLineUnits} (real impl by default). */
export interface FetchLineUnitsDeps {
  query: typeof tenantQuery;
}

const defaultFetchDeps: FetchLineUnitsDeps = { query: tenantQueryOneTrip };

/** Read the materialised units for a set of lines, grouped by line id and ordered by ordinal — the wire shape both /api/receiving-lines and the carton open attach. */
export async function fetchLineUnits(
  lineIds: number[],
  orgId: OrgId,
  deps: FetchLineUnitsDeps = defaultFetchDeps,
): Promise<Map<number, ReceivingLineUnitView[]>> {
  const ids = Array.from(new Set(lineIds.map(toPositiveLineId).filter((n): n is number => n != null)));
  if (ids.length === 0) return new Map();

  const result = await deps.query(
    orgId,
    `${LINE_UNITS_SELECT_SQL}
      WHERE u.organization_id = $2 AND u.receiving_line_id = ANY($1::int[])
      ORDER BY u.receiving_line_id ASC, u.ordinal ASC`,
    [ids, orgId],
  );
  return groupLineUnitRows(result.rows);
}
