import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ENTITY } from '@/lib/audit-logs';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import { resolveSpreadsheetShipByDate } from '@/lib/orders/canonical-order';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { autoAllocateAfterIngest } from '@/lib/allocation/auto-allocate';

/** POST /api/orders/import-csv */

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(10_000),
  mapping: z.record(z.string(), z.string()),
});

type CanonicalRow = {
  order_number: string;
  item_title: string;
  sku: string;
  item_number: string;
  quantity: string;
  condition: string;
  customer_name: string;
  ship_by_date: string;
  tracking_number: string;
  platform: string;
  note: string;
};

function pick(row: Record<string, string>, header: string | undefined): string {
  if (!header) return '';
  const v = row[header];
  return typeof v === 'string' ? v.trim() : '';
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rows, mapping } = parsed.data;

  if (!mapping.order_number) {
    return NextResponse.json(
      { error: 'mapping.order_number is required (an order number column must be mapped)' },
      { status: 400 },
    );
  }

  const errors: Array<{ row: number; reason: string }> = [];
  let skipped = 0;

  // 1. Map every row to canonical fields; collect per-row validation errors.
  const mapped: Array<{ index: number; canonical: CanonicalRow }> = [];
  rows.forEach((row, index) => {
    const canonical: CanonicalRow = {
      order_number: pick(row, mapping.order_number),
      item_title: pick(row, mapping.item_title),
      sku: pick(row, mapping.sku),
      item_number: pick(row, mapping.item_number),
      quantity: pick(row, mapping.quantity),
      condition: pick(row, mapping.condition),
      customer_name: pick(row, mapping.customer_name),
      ship_by_date: pick(row, mapping.ship_by_date),
      tracking_number: pick(row, mapping.tracking_number),
      platform: pick(row, mapping.platform),
      note: pick(row, mapping.note),
    };
    if (!canonical.order_number) {
      errors.push({ row: index, reason: 'Missing order_number' });
      return;
    }
    mapped.push({ index, canonical });
  });

  // 2. Dedupe within the batch by order_number (first occurrence wins).
  const seen = new Set<string>();
  const deduped: Array<{ index: number; canonical: CanonicalRow }> = [];
  for (const entry of mapped) {
    if (seen.has(entry.canonical.order_number)) {
      skipped += 1;
      continue;
    }
    seen.add(entry.canonical.order_number);
    deduped.push(entry);
  }

  // 3. Hand EVERY deduped row to the shared order-ingest writer — the ones this org already has included.
  let inserted = 0;
  let updated = 0;
  let insertedOrderIds: number[] = [];
  if (deduped.length > 0) {
    const result = await ingestCanonicalOrders(
      deduped.map(({ canonical }) => ({
        externalOrderId: canonical.order_number,
        // A marketplace item number (ASIN / eBay listing id) when the file has one — it resolves through `sku_platform_ids.platform_item_id`, a…
        itemNumber: canonical.item_number || '',
        sku: canonical.sku || '',
        productTitle: canonical.item_title || '',
        condition: canonical.condition || '',
        quantity: canonical.quantity || '1',
        // The mapped `note` column is an operator REMARK, and lands in the legacy scalar `orders.notes` the writer owns on insert.
        notes: canonical.note || '',
        customerName: canonical.customer_name || '',
        // Platform acknowledgment: an Amazon 3-7-7 / eBay 2-5-5 order number
        // names its own channel, so a file with no platform column still
        // stores the inferred slug instead of a blank `account_source`.
        accountSource:
          canonical.platform
          || inferMarketplaceFromOrderId(canonical.order_number)
          || '',
        trackings: canonical.tracking_number ? [canonical.tracking_number] : [],
        // END of the named warehouse civil day — a ship-by is a deadline, and
        // a blank/unparseable cell is unknown (null), never today. Shared
        // with the Google-Sheet lane, which reads the same file shapes.
        shipByDate: resolveSpreadsheetShipByDate(canonical.ship_by_date),
        orderDate: null,
        saleAmount: null,
        currency: null,
        status: null,
      })),
      {
        orgId: ctx.organizationId,
        source: 'orders-import-csv',
        // See the block above — never let an upload delete existing orders.
        collapseDuplicates: false,
        // Only claim an opinion about deadlines when the file actually carries one.
        manageDeadlines: Boolean(mapping.ship_by_date),
      },
    );
    inserted = result.insertedOrders;
    insertedOrderIds = result.insertedOrderIds;
    updated = result.processedOrders - result.insertedOrders;
    // Reserve units for the rows that just landed, so an uploaded file produces a pick list rather than an unallocated backlog.
    await autoAllocateAfterIngest(result.insertedOrderIds, {
      orgId: ctx.organizationId,
      staffId: typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null,
      source: 'orders-import-csv',
    });
  }

  await recordAudit(pool, ctx, request, {
    source: 'orders-import-csv',
    action: 'orders.import',
    entityType: AUDIT_ENTITY.ORDER,
    entityId: `csv:${inserted}+${updated}`,
    method: 'system',
    extra: {
      inserted,
      updated,
      skipped,
      errorCount: errors.length,
      rowCount: rows.length,
    },
  });

  return NextResponse.json({ inserted, insertedOrderIds, updated, skipped, errors });
}, { permission: 'orders.import' });
