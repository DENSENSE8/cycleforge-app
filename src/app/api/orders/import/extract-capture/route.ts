/**
 * POST /api/orders/import/extract-capture
 *
 * Screenshot(s) / pasted text of an orders LIST → order rows for the To-ship
 * staging draft. Nothing is persisted: the rows go back to the browser, land
 * in the same session draft a CSV file does, and the operator confirms them
 * into `ingestCanonicalOrders` from the staging grid like any other batch.
 *
 * Generation, not mutation (backend-patterns.md → AI generation routes): no
 * audit row, a per-org rate limit, and the org's provider chain. Reuses the
 * `orders.import` permission because this is a step inside that flow — an
 * operator who may not import has no use for extracted rows.
 *
 * Org scope is STRICTLY `ctx.organizationId`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { parseBody } from '@/lib/schemas/parse';
import { extractOrdersFromCapture } from '@/lib/orders/import/extract-orders-llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().max(20_000).optional().nullable(),
  /** data:image/...;base64,... — pages of the SAME list. Keep each under ~4MB. */
  image_data_urls: z
    .array(z.string().trim().max(6_000_000))
    .max(6)
    .optional()
    .nullable(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'orders-import-extract-capture',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined,
      },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(Body, raw);
  if (parsed instanceof NextResponse) return parsed;

  const text = parsed.text?.trim() || null;
  const imageDataUrls = (parsed.image_data_urls ?? []).map((u) => u.trim()).filter(Boolean);
  if (!text && imageDataUrls.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Provide text or image_data_urls' },
      { status: 400 },
    );
  }

  try {
    const result = await extractOrdersFromCapture(ctx.organizationId, { text, imageDataUrls });
    return NextResponse.json({
      success: true,
      orders: result.orders.map((o) => ({
        order_number: o.orderNumber,
        platform: o.platform,
        item_title: o.itemTitle,
        item_number: o.itemNumber,
        sku: o.sku,
        quantity: o.quantity,
        customer_name: o.customerName,
        ship_by_date: o.shipByDate,
        tracking_number: o.trackingNumber,
      })),
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    // No provider connected, the whole chain down, or a malformed tool call.
    // The operator can still import the same orders from a CSV, so this is a
    // stated reason — never a 500 that reads like the import itself broke.
    const message = err instanceof Error ? err.message : 'extract failed';
    const status = /No AI (chat )?provider|Provide orders text/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}, { permission: 'orders.import' });
