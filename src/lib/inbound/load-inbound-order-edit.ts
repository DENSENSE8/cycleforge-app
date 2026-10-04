import 'server-only';

/**
 * Server reads for correcting a landed inbound order:
 *   - `loadInboundOrderEdit` — one order as the editable draft (`inbound-order-edit.ts`);
 *   - `listCartonInboundOrders` — the inbound orders a carton's lines belong to,
 *     so a phone carton record can open the order behind it.
 * Tenant-scoped reads only; corrections land through `ingestInboundOrder`.
 */

import type { QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  inboundOrderEditRecordFrom,
  inboundOrderEditRefusal,
  inboundPlatformForIdentity,
  type CartonInboundOrder,
  type InboundOrderEditRecord,
  type InboundOrderHeaderRow,
  type InboundOrderLineRow,
  type InboundOrderTrackingRow,
} from '@/lib/inbound/inbound-order-edit';

export interface LoadInboundOrderEditDeps {
  query: <T extends QueryResultRow = QueryResultRow>(orgId: OrgId, sql: string, params?: ReadonlyArray<unknown>) => Promise<{ rows: T[] }>;
}

const defaultDeps: LoadInboundOrderEditDeps = { query: tenantQuery };

export async function loadInboundOrderEdit(
  orgId: OrgId,
  inboundOrderId: number,
  deps: LoadInboundOrderEditDeps = defaultDeps,
): Promise<InboundOrderEditRecord | null> {
  const header = await deps.query<InboundOrderHeaderRow>(
    orgId,
    `SELECT id, source_type, source_platform, external_order_id, receiving_type, origin, status,
            vendor_name, currency, order_date::text AS order_date, expected_date::text AS expected_date,
            priority_tier, notes
       FROM inbound_order
      WHERE organization_id = $1 AND id = $2`,
    [orgId, inboundOrderId],
  );
  if (!header.rows[0]) return null;

  const [lines, tracking, ledger] = await Promise.all([
    deps.query<InboundOrderLineRow>(
      orgId,
      `SELECT rl.line_key, rl.sku, rl.item_name, rl.sku_catalog_id, rl.quantity_expected,
              rl.quantity_received, rl.unit_cost_cents, rl.listing_url
         FROM receiving_line rl
        WHERE rl.organization_id = $1 AND rl.inbound_order_id = $2
        ORDER BY rl.id`,
      [orgId, inboundOrderId],
    ),
    deps.query<InboundOrderTrackingRow>(
      orgId,
      `SELECT stn.tracking_number_raw AS tracking,
              COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), rc.carrier) AS carrier
         FROM receiving_carton rc
         JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
        WHERE rc.organization_id = $1
          AND rc.id IN (SELECT rl.receiving_id FROM receiving_line rl
                         WHERE rl.organization_id = $1 AND rl.inbound_order_id = $2
                           AND rl.receiving_id IS NOT NULL)
        ORDER BY rc.id`,
      [orgId, inboundOrderId],
    ),
    deps.query<{ payload: unknown }>(
      orgId,
      `SELECT payload
         FROM inbound_ingest_event
        WHERE organization_id = $1 AND inbound_order_id = $2 AND status IN ('landed', 'unchanged')
        ORDER BY landed_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [orgId, inboundOrderId],
    ),
  ]);

  return inboundOrderEditRecordFrom({
    header: header.rows[0],
    lines: lines.rows,
    tracking: tracking.rows,
    ledgerPayload: ledger.rows[0]?.payload ?? null,
  });
}

export async function listCartonInboundOrders(
  orgId: OrgId,
  receivingId: number,
  deps: LoadInboundOrderEditDeps = defaultDeps,
): Promise<CartonInboundOrder[]> {
  const r = await deps.query<{
    id: number;
    external_order_id: string;
    source_type: string;
    source_platform: string;
    receiving_type: string;
    line_count: number;
  }>(
    orgId,
    `SELECT io.id, io.external_order_id, io.source_type, io.source_platform, io.receiving_type,
            COUNT(rl.id)::int AS line_count
       FROM receiving_line rl
       JOIN inbound_order io ON io.id = rl.inbound_order_id AND io.organization_id = rl.organization_id
      WHERE rl.organization_id = $1 AND rl.receiving_id = $2
      GROUP BY io.id
      ORDER BY io.id`,
    [orgId, receivingId],
  );
  return r.rows.map((row) => ({
    inboundOrderId: Number(row.id),
    orderNumber: row.external_order_id,
    platform: inboundPlatformForIdentity(row.source_type, row.source_platform),
    type: row.receiving_type,
    lineCount: Number(row.line_count),
    refusal: inboundOrderEditRefusal(row),
  }));
}
