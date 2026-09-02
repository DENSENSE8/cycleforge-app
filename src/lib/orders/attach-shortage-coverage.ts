/**
 * Attach Shortage coverage onto existing org orders — never mint.
 *
 * Confirm writes `orders.shortage_coverage` + keeps/sets `is_out_of_stock`.
 * Inbound tracking stays in the jsonb bag; it is never `orders.tracking`.
 */

import type { PoolClient } from 'pg';
import {
  normalizeShortageCoverageToken,
  parseShortageShortQty,
  shortageRowNamesProduct,
} from '@/lib/orders/shortage-coverage';
import {
  projectCsvShortageCoverageRow,
  type CsvShortageCoverageKey,
} from '@/lib/orders/csv-shortage-coverage-import';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type AttachShortageCoverageResult = {
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

function coveragePayload(projected: Record<CsvShortageCoverageKey, string>) {
  return {
    po_number: normalizeShortageCoverageToken(projected.po_number),
    inbound_tracking: normalizeShortageCoverageToken(projected.inbound_tracking),
    eta: normalizeShortageCoverageToken(projected.eta),
    short_qty: parseShortageShortQty(projected.short_qty),
  };
}

async function findExistingOrder(
  client: PoolClient,
  orgId: OrgId,
  orderNumber: string,
  sku: string,
): Promise<{ id: number } | null> {
  const { rows } = await client.query<{ id: number; sku: string | null }>(
    `SELECT id, sku
       FROM orders
      WHERE organization_id = $1
        AND order_id = $2
      ORDER BY id DESC
      LIMIT 20`,
    [orgId, orderNumber],
  );
  if (rows.length === 0) return null;
  if (sku) {
    const skuHit = rows.find((r) => String(r.sku ?? '').trim() === sku);
    if (skuHit) return { id: skuHit.id };
  }
  return { id: rows[0].id };
}

export async function attachShortageCoverageRows(
  orgId: OrgId,
  input: {
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  },
): Promise<AttachShortageCoverageResult> {
  return withTenantConnection(orgId, async (client) => {
    const errors: Array<{ row: number; reason: string }> = [];
    const seen = new Set<string>();
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < input.rows.length; i += 1) {
      const projected = projectCsvShortageCoverageRow(input.rows[i], input.mapping);
      const orderNumber = projected.order_number.trim();
      if (!orderNumber) {
        skipped += 1;
        errors.push({ row: i + 1, reason: 'Missing order number' });
        continue;
      }
      if (
        !shortageRowNamesProduct({
          sku: projected.sku,
          itemNumber: projected.item_number,
          itemTitle: projected.item_title,
        })
      ) {
        skipped += 1;
        errors.push({ row: i + 1, reason: 'Product is unnamed' });
        continue;
      }
      if (parseShortageShortQty(projected.short_qty) == null) {
        skipped += 1;
        errors.push({ row: i + 1, reason: 'Short qty must be a positive integer' });
        continue;
      }

      const sku = projected.sku.trim();
      const dupKey = `${orderNumber}\u0000${sku}`;
      if (sku && seen.has(dupKey)) {
        skipped += 1;
        errors.push({ row: i + 1, reason: 'Duplicate order + SKU in this file' });
        continue;
      }
      if (sku) seen.add(dupKey);

      const existing = await findExistingOrder(client, orgId, orderNumber, sku);
      if (!existing) {
        skipped += 1;
        errors.push({ row: i + 1, reason: 'Order not found — import does not create orders' });
        continue;
      }

      await client.query(
        `UPDATE orders
            SET shortage_coverage = $1::jsonb,
                is_out_of_stock = true
          WHERE id = $2
            AND organization_id = $3`,
        [JSON.stringify(coveragePayload(projected)), existing.id, orgId],
      );
      updated += 1;
    }

    return { updated, skipped, errors };
  });
}
