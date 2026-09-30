/**
 * Write `orders.service_level` from the ShipStation order refs paired to each
 * row, and mark the row urgent when its level CHANGES to an urgent one (owner
 * 2026-09-29: Next day / 2-day / Expedited / fedex_2day_one_rate import as
 * urgent). A row whose level is unchanged is not touched, so an operator who
 * clears urgent is never re-flagged by the next sync; `is_urgent` is never
 * cleared here — it stays the operator's toggle.
 */
import { SERVICE_LEVEL, type ServiceLevel } from '@cycleforge/design-tokens';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { fastestServiceLevel, serviceLevelOf } from './service-level';

export interface ServiceLevelApplied {
  /** Rows whose service_level changed. */
  classified: number;
  /** Of those, rows this call newly marked urgent. */
  markedUrgent: number;
}

/**
 * Classify and write the given order rows (all paired rows when `rowIds` is
 * omitted — the backfill). Returns what changed.
 */
export async function applyOrderServiceLevels(orgId: OrgId, rowIds?: readonly number[]): Promise<ServiceLevelApplied> {
  if (rowIds && rowIds.length === 0) return { classified: 0, markedUrgent: 0 };
  const refs = await tenantQuery<{ order_row_id: number; requested_service: string | null; service_code: string | null }>(
    orgId,
    `SELECT order_row_id, requested_service, service_code
       FROM shipstation_order_refs
      WHERE organization_id = $1 AND order_row_id IS NOT NULL
        AND ($2::int[] IS NULL OR order_row_id = ANY($2::int[]))`,
    [orgId, rowIds ? [...rowIds] : null],
  );

  // A split row carries several ShipStation orders: the fastest service wins.
  const byRow = new Map<number, ServiceLevel | null>();
  for (const ref of refs.rows) {
    const level = serviceLevelOf({ requested: ref.requested_service, serviceCode: ref.service_code });
    byRow.set(ref.order_row_id, fastestServiceLevel([byRow.get(ref.order_row_id), level]));
  }
  const payload = [...byRow].flatMap(([id, level]) =>
    level ? [{ id, level, urgent: SERVICE_LEVEL[level].urgent }] : [],
  );
  if (payload.length === 0) return { classified: 0, markedUrgent: 0 };

  const res = await tenantQuery<{ marked: boolean }>(
    orgId,
    `WITH x AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(id int, level text, urgent boolean)
     ), prior AS (
       SELECT o.id, o.is_urgent FROM orders o JOIN x ON x.id = o.id
        WHERE o.organization_id = $1 AND o.service_level IS DISTINCT FROM x.level
     )
     UPDATE orders o
        SET service_level = x.level,
            is_urgent = o.is_urgent OR x.urgent
       FROM x JOIN prior ON prior.id = x.id
      WHERE o.organization_id = $1 AND o.id = x.id
     RETURNING (x.urgent AND NOT prior.is_urgent) AS marked`,
    [orgId, JSON.stringify(payload)],
  );
  return { classified: res.rows.length, markedUrgent: res.rows.filter((r) => r.marked).length };
}
