import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { tenantQuery } from '@/lib/tenancy/db';
import { serializeRows } from '@/lib/tables/export/serialize';
import { getCurrentPSTDateKey } from '@/utils/date';
import { ORDER_DATE_LABEL, placedElseImportedSql } from '@/lib/orders/order-dates';

const Query = z.object({
  record: z.enum(['inbound', 'outbound']),
  day: z.string().trim().min(1).optional(),
  staffId: z.coerce.number().int().positive().optional(),
}).strict();

/** Database-backed inbound/outbound operational record exports for Reports. */
export const GET = withAuth(async (request: NextRequest, context) => {
  const parsed = parseBody(Query, Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (parsed instanceof NextResponse) return parsed;
  const day = parsed.day ?? getCurrentPSTDateKey();

  if (parsed.record === 'inbound') {
    const values: unknown[] = [context.organizationId, day];
    let staffClause = '';
    if (parsed.staffId) {
      values.push(parsed.staffId);
      staffClause = `AND line.received_by = $${values.length}`;
    }
    const result = await tenantQuery<{
      id: number; inbound_order_id: number | null; source_order_id: string | null;
      sku: string | null; item_name: string | null; quantity_expected: number | null;
      quantity_received: number | null; status: string | null; staff_id: number | null;
      staff_name: string | null; activity_at: string;
    }>(context.organizationId, `
      SELECT line.id, line.inbound_order_id, line.source_order_id, line.sku, line.item_name,
             line.quantity_expected, line.quantity_received,
             COALESCE(line.receiving_line_status, line.workflow_status::text) AS status,
             line.received_by AS staff_id, staff.name AS staff_name,
             COALESCE(line.received_at, line.unboxed_at, line.scanned_at, line.created_at)::text AS activity_at
        FROM receiving_line line
        LEFT JOIN staff ON staff.id = line.received_by
       WHERE line.organization_id = $1
         AND (timezone('America/Los_Angeles', COALESCE(line.received_at, line.unboxed_at, line.scanned_at, line.created_at)))::date = $2::date
         ${staffClause}
       ORDER BY COALESCE(line.received_at, line.unboxed_at, line.scanned_at, line.created_at) DESC
       LIMIT 50000`, values);
    const csv = serializeRows(
      ['Line id', 'Inbound order id', 'Source order', 'SKU', 'Product', 'Expected qty', 'Received qty', 'Status', 'Staff id', 'Staff', 'Activity at'],
      result.rows.map((row) => [row.id, row.inbound_order_id, row.source_order_id, row.sku, row.item_name, row.quantity_expected, row.quantity_received, row.status, row.staff_id, row.staff_name, row.activity_at]),
      'csv',
    );
    return csvResponse(csv, `inbound-records-${day}.csv`);
  }

  const result = await tenantQuery<{
    id: number; order_id: string | null; item_number: string | null; sku: string | null;
    product_title: string | null; quantity: string | null; status: string | null;
    account_source: string | null; fulfillment_channel: string | null;
    order_date: string | null; created_at: string;
  }>(context.organizationId, `
    SELECT id, order_id, item_number, sku, product_title, quantity, status,
           account_source, fulfillment_channel, order_date::text, created_at::text
      FROM orders
     WHERE organization_id = $1
       AND (timezone('America/Los_Angeles', ${placedElseImportedSql('orders')}))::date = $2::date
     ORDER BY ${placedElseImportedSql('orders')} DESC
     LIMIT 50000`, [context.organizationId, day]);
  const csv = serializeRows(
    ['Row id', 'Order number', 'Item number', 'SKU', 'Product', 'Quantity', 'Status', 'Platform', 'Fulfillment', ORDER_DATE_LABEL.placed, ORDER_DATE_LABEL.imported],
    result.rows.map((row) => [row.id, row.order_id, row.item_number, row.sku, row.product_title, row.quantity, row.status, row.account_source, row.fulfillment_channel, row.order_date, row.created_at]),
    'csv',
  );
  return csvResponse(csv, `outbound-records-${day}.csv`);
}, { permission: 'operations.view' });

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
