/** Device-authenticated local-pickup intake. The only write is ingestInboundOrder. */

import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import { readIdempotencyKey } from '@/lib/api-idempotency';
import { getSupplierNameOptions } from '@/lib/neon/suppliers-queries';
import {
  ingestInboundOrder,
  InboundOrderRefused,
} from '@/lib/inbound/ingest-inbound-order';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';

export const runtime = 'nodejs';

const Body = z
  .object({
    draft: z.unknown(),
    staffId: z.number().int().positive(),
    pin: z.string().min(1).max(20),
  })
  .strict();

export const GET = withKioskAuth(async (request: NextRequest, ctx) => {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const vendors = await getSupplierNameOptions({ q, limit: 100 }, ctx.organizationId);
  return NextResponse.json({
    success: true,
    vendors,
  });
});

export const POST = withKioskAuth(async (request: NextRequest, ctx) => {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { success: false, error: 'body must include draft and staff authorization' },
      { status: 400 },
    );
  }

  try {
    const staffId = await resolveKioskStepUp(
      ctx.organizationId,
      body.data.staffId,
      body.data.pin,
      'receiving.scan_po',
    );
    if (staffId == null) {
      return NextResponse.json(
        { success: false, error: 'PIN incorrect or receiving access is unavailable' },
        { status: 403 },
      );
    }
    const result = await ingestInboundOrder(ctx.organizationId, body.data.draft, {
      origin: 'manual',
      source: 'kiosk-local-pickup',
      staffId,
      sourceEventId: readIdempotencyKey(request),
    });
    after(async () => {
      await invalidateReceivingViews(ctx.organizationId).catch((error) =>
        console.warn('[kiosk/local-pickup] invalidate failed', error),
      );
    });
    return NextResponse.json({ success: true, result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof InboundOrderRefused) {
      return NextResponse.json(
        { success: false, error: error.message, missing: error.missing },
        { status: error.status },
      );
    }
    console.error('[kiosk/local-pickup]', error);
    return NextResponse.json(
      { success: false, error: 'Could not add the local pickup' },
      { status: 500 },
    );
  }
});
