import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ENTITY } from '@/lib/audit-logs';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import { resolveSpreadsheetShipByDate } from '@/lib/orders/canonical-order';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';

/**
 * POST /api/orders/import-csv
 *
 * Tenant-generic CSV order import. Where the Google-Sheets import is hardcoded
 * to USAV (transitionalDogfoodOrgId), this lane lets ANY tenant bring orders in:
 * the client parses the CSV in-browser, picks which detected header maps to each
 * canonical field, and posts the already-parsed rows + the mapping here.
 *
 * Body: { rows: Array<Record<string,string>>, mapping: Record<canonical, csvHeader> }
 * Canonical fields: order_number (required), sku, quantity, customer_name,
 *                   tracking_number?, platform?
 *
 * Org scope is taken STRICTLY from ctx.organizationId — never the body. Rows are
 * normalized to `CanonicalOrderLine` and written by the shared order-ingest
 * writer, so this lane gets tracking resolution, catalog linking, cache
 * invalidation and the realtime publish for free.
 *
 * Idempotency: `orders` has no UNIQUE(organization_id, order_id) constraint, so
 * we dedupe within the batch and let the writer match an incoming row to the
 * one this org already has. A re-upload therefore BACKFILLS (additive — fills
 * blanks, never overwrites an operator's correction) instead of inserting a
 * duplicate; `collapseDuplicates: false` guarantees it can never delete one.
 * Rows are reported as `inserted` · `updated` · `skipped` (in-batch duplicate).
 */

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

  // 3. Hand EVERY deduped row to the shared order-ingest writer — the ones
  //    this org already has included.
  //
  //    This route used to pre-filter existing order numbers out of the batch
  //    and report them as `skipped`, because the writer's default `orderId`
  //    match COLLAPSES DUPLICATES by deleting the losing rows and a user
  //    uploading a spreadsheet must never be able to delete existing orders.
  //    That guarantee was right; expressing it as a pre-filter was not — it
  //    made the lane insert-only, so re-uploading a file whose rows had since
  //    gained a tracking number, a ship-by, a title or a condition wrote none
  //    of them and called the whole file skipped.
  //
  //    `collapseDuplicates: false` states the guarantee at the layer that owns
  //    it, and lets existing orders reach the writer's ADDITIVE backfill path:
  //    it fills blanks and never overwrites, so an operator's correction always
  //    survives the next upload.
  //
  //    Going through the writer also fixes a silent data-loss bug: this route
  //    used to insert `shippingTrackingNumber` and `isShipped`, neither of
  //    which is a real `orders` column any more (tracking lives in
  //    shipping_tracking_numbers + shipment_links). Drizzle dropped both keys
  //    without error, so every tracking number in an imported CSV was thrown
  //    away. The writer resolves it to a shipment and links it properly.
  let inserted = 0;
  let updated = 0;
  if (deduped.length > 0) {
    try {
      const result = await ingestCanonicalOrders(
        deduped.map(({ canonical }) => ({
          externalOrderId: canonical.order_number,
          // A marketplace item number (ASIN / eBay listing id) when the file
          // has one — it resolves through `sku_platform_ids.platform_item_id`,
          // a path the SKU lookup cannot reach. When the file has only a SKU
          // the writer falls back to it via `resolveListingIdentity` on a
          // catalog miss, so either way the order lands in the catalog-link
          // queue instead of writing a blank `orders.item_number` and being
          // unlinkable forever.
          itemNumber: canonical.item_number || '',
          sku: canonical.sku || '',
          productTitle: canonical.item_title || '',
          condition: canonical.condition || '',
          quantity: canonical.quantity || '1',
          // The mapped `note` column is an operator REMARK, and lands in the
          // legacy scalar `orders.notes` the writer owns on insert. The mapped
          // `customer_name` column is a BUYER, not a note: it used to land as
          // `notes: "Customer: <name>"`, which made the buyer invisible to
          // every customer-scoped read and put import prose in the column
          // operators type into. The writer resolves it to a `customers` row
          // and sets `orders.customer_id`.
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
          // Only claim an opinion about deadlines when the file actually
          // carries one. `upsertOrderDeadline` CREATES an OPEN TEST assignment
          // when none exists, so managing deadlines with no mapped ship-by
          // column would fill the tech queue with null-deadline assignments —
          // one per row of every CSV ever uploaded.
          manageDeadlines: Boolean(mapping.ship_by_date),
        },
      );
      inserted = result.insertedOrders;
      updated = result.processedOrders - result.insertedOrders;
    } catch (error: any) {
      console.error('CSV order import insert error:', error);
      return NextResponse.json(
        { error: 'Failed to insert orders', details: error?.message },
        { status: 500 },
      );
    }
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

  return NextResponse.json({ inserted, updated, skipped, errors });
}, { permission: 'orders.import' });
