/** Device-authenticated paperwork OCR. Produces a review draft; never writes receiving rows. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { extractPoIntake } from '@/lib/inbound/extract-po-llm';
import {
  inboundOrderMissing,
  inboundOrderMissingSentence,
} from '@/lib/inbound/inbound-order-draft';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z
  .object({
    text: z.string().trim().max(20_000).optional().nullable(),
    imageDataUrls: z.array(z.string().trim().max(6_000_000)).min(1).max(6),
  })
  .strict();

export const POST = withKioskAuth(async (request: NextRequest, ctx) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Attach between one and six pickup-paperwork images' },
      { status: 400 },
    );
  }

  try {
    const result = await extractPoIntake(ctx.organizationId, {
      type: 'PICKUP',
      text: parsed.data.text?.trim() || null,
      imageDataUrls: parsed.data.imageDataUrls,
    });
    const missing = inboundOrderMissing(result.draft);
    return NextResponse.json({
      success: true,
      draft: result.draft,
      missing,
      missingPrompt: inboundOrderMissingSentence(missing),
      ready: missing.length === 0,
      model: result.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the paperwork';
    const status = /No self-hosted AI provider/i.test(message) ? 503 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
});
