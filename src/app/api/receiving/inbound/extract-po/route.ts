/**
 * POST /api/receiving/inbound/extract-po
 *
 * Screenshot / text → an InboundOrderDraft (not persisted).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { extractPoIntake } from '@/lib/inbound/extract-po-llm';
import { inboundOrderMissing, inboundOrderMissingSentence } from '@/lib/inbound/inbound-order-draft';

const Body = z.object({
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
      text,
      imageDataUrl,
      imageDataUrls,
    });
    const missing = inboundOrderMissing(result.draft);
    return NextResponse.json({
      success: true,
      draft: result.draft,
      missing,
      missing_prompt: inboundOrderMissingSentence(missing),
      ready: missing.length === 0,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'extract failed';
    const status = /No AI chat provider|Provide purchase-order/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}, { permission: 'receiving.view' });
