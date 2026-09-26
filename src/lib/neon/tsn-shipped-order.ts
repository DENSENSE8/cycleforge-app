/**
 * Legacy tech-serial → sales-order resolve.
 *
 * `tech_serial_numbers.shipment_id → orders.shipment_id` is the pre-allocation
 * ship record. It is also how a leftover TECH serial scan hangs an unrelated
 * unit on an already-packed tracking (Wave serial onto a Bose 151 order after
 * PACK_COMPLETED). Post-pack attaches are not a ship.
 */

import pool from '../db';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  normalizeSerial,
  type MatchedOrderForSerial,
  type Queryable,
} from '@/lib/neon/serial-units-queries';

const TSN_ATTACH_INSTANT_SQL = `COALESCE(
             (SELECT MIN(added.created_at)
                FROM station_activity_logs added
               WHERE added.tech_serial_number_id = t.id
                 AND added.activity_type = 'SERIAL_ADDED'),
             t.created_at
           )`;

/** Exported so tests can pin the post-pack exclusion without a live DB. */
export const FIND_SHIPPED_ORDER_BY_TSN_SQL = `SELECT o.id                    AS order_pk,
            o.order_id              AS order_id,
            o.item_number           AS item_number,
            o.account_source        AS account_source,
            o.product_title         AS product_title,
            o.sku                   AS sku,
            o.condition             AS condition,
            o.quantity              AS quantity,
            stn.tracking_number_raw AS tracking_number,
            'SHIPPED'               AS allocation_state,
            t.created_at            AS allocated_at,
            t.serial_number         AS serial_number
       FROM tech_serial_numbers t
       JOIN orders o ON (
              (t.order_id IS NOT NULL AND o.id = t.order_id)
              OR (
                t.order_id IS NULL
                AND t.shipment_id IS NOT NULL
                AND o.shipment_id = t.shipment_id
              )
            )
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE UPPER(t.serial_number) = $1
        AND (t.order_id IS NOT NULL OR t.shipment_id IS NOT NULL)
        AND ($2::uuid IS NULL OR t.organization_id = $2::uuid)
        AND ($2::uuid IS NULL OR o.organization_id = $2::uuid)
        AND (
          t.order_id IS NOT NULL
          OR NOT EXISTS (
          SELECT 1
            FROM station_activity_logs pack
           WHERE pack.shipment_id = t.shipment_id
             AND pack.activity_type = 'PACK_COMPLETED'
             AND ($2::uuid IS NULL OR pack.organization_id = $2::uuid)
             AND ${TSN_ATTACH_INSTANT_SQL} > pack.created_at
        )
        )
      ORDER BY t.created_at DESC, o.id ASC
      LIMIT 1`;

export async function findShippedOrderByTsnSerial(
  serial: string,
  options?: { organizationId?: string | null; executor?: Queryable },
  orgId?: OrgId,
): Promise<(MatchedOrderForSerial & { serial_number: string }) | null> {
  const normalized = normalizeSerial(serial);
  if (!normalized) return null;
  const effectiveOrg = orgId ?? options?.organizationId ?? null;
  const params = [normalized, effectiveOrg];

  if (orgId && !options?.executor) {
    const scoped = await tenantQuery<MatchedOrderForSerial & { serial_number: string }>(
      orgId,
      FIND_SHIPPED_ORDER_BY_TSN_SQL,
      params,
    );
    return scoped.rows[0] ?? null;
  }

  const executor = options?.executor ?? pool;
  const result = await executor.query<MatchedOrderForSerial & { serial_number: string }>(
    FIND_SHIPPED_ORDER_BY_TSN_SQL,
    params,
  );
  return result.rows[0] ?? null;
}
