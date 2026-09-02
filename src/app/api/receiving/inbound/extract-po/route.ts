/**
 * POST /api/receiving/inbound/extract-po
 *
 * Screenshot / text → structured Incoming PO draft (not persisted).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { extractPoIntake } from '@/lib/inbound/extract-po-llm';
import {
  canConfirmPoIntake,
  missingPoIntakeFields,
  poIntakeMissingPrompt,
} from '@/lib/inbound/po-intake-draft';

const Body = z.object({
  kind: z.enum(['purchase', 'return']).optional().default('purchase'),
  text: z.string().trim().max(20_000).optional().nullable(),
  /** data:image/...;base64,... — keep under ~4MB of base64. */
  image_data_url: z.string().trim().max(6_000_000).optional().nullable(),
  /** Pages of the same order (scroll captures). */
  image_data_urls: z
    .array(z.string().trim().max(6_000_000))
    .max(6)
    .optional()
    .nullable(),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(Body, raw);
  if (parsed instanceof NextResponse) return parsed;

  const text = parsed.text?.trim() || null;
  const imageDataUrl = parsed.image_data_url?.trim() || null;
  const imageDataUrls = (parsed.image_data_urls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  if (!text && !imageDataUrl && imageDataUrls.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Provide text or image_data_url(s)' },
      { status: 400 },
    );
  }

  try {
    const result = await extractPoIntake(ctx.organizationId, {
      kind: parsed.kind,
      text,
      imageDataUrl,
      imageDataUrls,
    });
    const missing = missingPoIntakeFields(result.draft);
    return NextResponse.json({
      success: true,
      draft: {
        kind: result.draft.kind,
        platform: result.draft.platform,
        order_id: result.draft.orderId,
        seller: result.draft.seller,
        account_name: result.draft.accountName,
        tracking_number: result.draft.trackingNumber,
        carrier_code: result.draft.carrierCode,
        listing_url: result.draft.listingUrl,
        priority: result.draft.priority,
        return_reason: result.draft.returnReason,
        rma_id: result.draft.rmaId,
        notes: result.draft.notes,
        lines: result.draft.lines.map((l) => ({
          sku: l.sku,
          item_name: l.itemName,
          quantity: l.quantity,
          line_item_id: l.lineItemId,
          sku_catalog_id: l.catalogId,
          listing_url: l.listingUrl,
        })),
      },
      missing,
      missing_prompt: poIntakeMissingPrompt(missing),
      ready: canConfirmPoIntake(result.draft),
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'extract failed';
    const status = /No AI chat provider|Provide purchase-order/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}, { permission: 'receiving.view' });
