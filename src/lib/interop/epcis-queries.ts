/** The one SQL read behind the EPCIS projection. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { EpcisCursor, EpcisSourceRow } from './epcis-projection';

/** One page of the event spine, oldest-first. */
export async function fetchEpcisEvents(args: {
  orgId: string;
  since: string | null;
  cursor: EpcisCursor | null;
  limit: number;
}): Promise<EpcisSourceRow[]> {
  const params: unknown[] = [args.orgId];
  const clauses: string[] = ['ie.organization_id = $1'];

  if (args.since) {
    params.push(args.since);
    clauses.push(`ie.occurred_at >= $${params.length}`);
  }

  if (args.cursor) {
    // Keyset, not OFFSET. The tuple comparison matches the ORDER BY exactly,
    // so Postgres walks the index forward instead of re-scanning the prefix.
    params.push(args.cursor.occurredAt, args.cursor.id);
    clauses.push(
      `(ie.occurred_at, ie.id) > ($${params.length - 1}::timestamptz, $${params.length}::bigint)`,
    );
  }

  params.push(args.limit);

  const sql = `
    SELECT
      ie.id,
      ie.occurred_at,
      ie.event_type,
      ie.station,
      ie.actor_staff_id,
      ie.receiving_id,
      ie.receiving_line_id,
      ie.serial_unit_id,
      ie.sku,
      ie.bin_id,
      ie.prev_bin_id,
      ie.prev_status,
      ie.next_status,
      ie.client_event_id,
      su.serial_number,
      sc.gtin,
      rc.zoho_purchaseorder_number AS po_number
    FROM inventory_events ie
    LEFT JOIN serial_units su ON su.id = ie.serial_unit_id
    LEFT JOIN sku_catalog  sc ON sc.id = su.sku_catalog_id
    LEFT JOIN receiving_carton rc ON rc.id = ie.receiving_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ie.occurred_at ASC, ie.id ASC
    LIMIT $${params.length}
  `;

  const res = await tenantQuery<EpcisSourceRow>(args.orgId as OrgId, sql, params);
  return res.rows;
}
