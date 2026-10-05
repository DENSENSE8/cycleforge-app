import 'server-only';

import { tenantQueryOneTrip, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { UNKNOWN_CARRIER } from '@/lib/shipping/carrier-resolution';
import { weekdayOfDateKey } from '@/utils/date';
import { pickupCutoffsForDay, type PickupCutoffRow, type PickupWeekday } from './pickup-cutoffs-shared';

/** `carrier_pickup_cutoffs` — the ONE reader/writer. The org's whole set is replaced at once. */

const ROW_SELECT_SQL = `SELECT carrier, weekday::int AS weekday, to_char(cutoff_local, 'HH24:MI') AS cutoff_local
   FROM carrier_pickup_cutoffs WHERE organization_id = $1`;

/** Days of shipment history whose carriers the editor offers. */
const CARRIER_CHOICE_WINDOW_DAYS = 90;

interface DbRow {
  carrier: string;
  weekday: number;
  cutoff_local: string;
}

function toRow(row: DbRow): PickupCutoffRow {
  return { carrier: row.carrier, weekday: row.weekday as PickupWeekday, cutoffLocal: row.cutoff_local };
}

/** Every configured cutoff (all carriers × weekdays), by carrier then weekday. */
export async function listPickupCutoffs(orgId: OrgId): Promise<PickupCutoffRow[]> {
  const { rows } = await tenantQueryOneTrip<DbRow>(orgId, `${ROW_SELECT_SQL} ORDER BY carrier, weekday`, [orgId]);
  return rows.map(toRow);
}

/** Carriers the editor offers: those on this org's recent shipments plus any already configured. */
export async function listPickupCarrierChoices(orgId: OrgId): Promise<string[]> {
  const { rows } = await tenantQueryOneTrip<{ carrier: string }>(
    orgId,
    `SELECT carrier FROM (
       SELECT DISTINCT UPPER(BTRIM(carrier)) AS carrier
         FROM shipping_tracking_numbers
        WHERE organization_id = $1
          AND created_at > now() - make_interval(days => $2)
          AND UPPER(BTRIM(carrier)) NOT IN ('', $3)
       UNION
       SELECT carrier FROM carrier_pickup_cutoffs WHERE organization_id = $1
     ) c
     ORDER BY carrier`,
    [orgId, CARRIER_CHOICE_WINDOW_DAYS, UNKNOWN_CARRIER],
  );
  return rows.map((row) => row.carrier);
}

/**
 * Replace the org's whole cutoff set in one transaction. `rows` are already
 * normalized (`normalizePickupCarrier`, `HH:MM`) and unique per carrier ×
 * weekday. Returns the set before and after, for the audit row.
 */
export async function replacePickupCutoffs(
  orgId: OrgId,
  staffId: number | null,
  rows: ReadonlyArray<PickupCutoffRow>,
): Promise<{ before: PickupCutoffRow[]; after: PickupCutoffRow[] }> {
  return withTenantTransaction(orgId, async (client) => {
    // Serialize concurrent replaces of the same org's set (an empty set has no rows to lock).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('carrier_pickup_cutoffs:' || $1::text))`, [orgId]);
    const prior = await client.query<DbRow>(`${ROW_SELECT_SQL} ORDER BY carrier, weekday`, [orgId]);
    await client.query('DELETE FROM carrier_pickup_cutoffs WHERE organization_id = $1', [orgId]);
    if (rows.length > 0) {
      await client.query(
        `INSERT INTO carrier_pickup_cutoffs (organization_id, carrier, weekday, cutoff_local, updated_by_staff_id)
         SELECT $1, c, w, t::time, $5
           FROM unnest($2::text[], $3::smallint[], $4::text[]) AS u(c, w, t)`,
        [orgId, rows.map((r) => r.carrier), rows.map((r) => r.weekday), rows.map((r) => r.cutoffLocal), staffId],
      );
    }
    const next = await client.query<DbRow>(`${ROW_SELECT_SQL} ORDER BY carrier, weekday`, [orgId]);
    return { before: prior.rows.map(toRow), after: next.rows.map(toRow) };
  });
}

/**
 * The cutoffs on warehouse day `dateKey` (`YYYY-MM-DD`): each carrier with a
 * pickup that weekday, its wall-clock time, and the instant it falls on that
 * day in the warehouse zone — earliest first. An invalid key yields none.
 */
export async function loadPickupCutoffsForDay(
  orgId: OrgId,
  dateKey: string,
): Promise<Array<{ carrier: string; cutoffLocal: string; cutoffAt: string }>> {
  const weekday = weekdayOfDateKey(dateKey);
  if (weekday === null) return [];
  const { rows } = await tenantQueryOneTrip<DbRow>(orgId, `${ROW_SELECT_SQL} AND weekday = $2`, [orgId, weekday]);
  return pickupCutoffsForDay(rows.map(toRow), dateKey);
}
