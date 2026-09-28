import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveShipBy } from '@/lib/assistant/tools/manual-order-tools';
import { extractOrderCapture } from '@/lib/orders/import/extract-order-capture';
import { parseBody } from '@/lib/schemas/parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  /** A pasted order: email, marketplace row, typed note, CSV/TSV. */
  text: z.string().trim().max(20_000).optional().nullable(),
  /** Screenshots of one order list (scroll captures), data URLs. */
  image_data_urls: z.array(z.string().trim().max(6_000_000)).max(6).optional().nullable(),
});

/**
 * POST /api/orders/import/extract-capture — a pasted order (text or
 * screenshots) → fields for REVIEW. Never creates an order.
 *
 * `orders` is one flat row per product line (the To-ship paste staging reads
 * it); `captured` is the same read grouped per order with the customer,
 * ship-to and prices the intake form fills.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(Body, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  const text = parsed.text?.trim() || null;
  const imageDataUrls = (parsed.image_data_urls ?? []).filter(Boolean);
  if (!text && imageDataUrls.length === 0) {
    return NextResponse.json({ success: false, error: 'Paste order text or a screenshot' }, { status: 400 });
  }

  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'orders-import-extract-capture',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId, staffId: ctx.staffId,
  });
  if (!rate.ok) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  try {
    const { orders, source } = await extractOrderCapture(ctx.organizationId, { text, imageDataUrls });
    const rows = orders.flatMap((o) =>
      (o.lines.length > 0 ? o.lines : [null]).map((line) => ({
        order_number: o.orderNumber,
        platform: o.platform,
        item_title: line?.title ?? '',
        item_number: line?.itemNumber ?? '',
        sku: line?.sku ?? '',
        quantity: line?.quantity == null ? '' : String(line.quantity),
        customer_name: o.customerName,
        ship_by_date: o.shipBy,
        tracking_number: o.trackingNumber,
      })),
    );
    // The form takes a civil date; "Friday" / "10/2" resolve in the warehouse's zone.
    const captured = orders.map((o) => ({ ...o, shipBy: o.shipBy ? (resolveShipBy(o.shipBy) ?? '') : '' }));
    return NextResponse.json({ success: true, source, orders: rows, captured });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? `Could not read that order: ${err.message}` : 'Could not read that order' },
      { status: 422 },
    );
  }
}, { permission: 'orders.create' });
