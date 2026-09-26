import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { batchPair, type BatchPairInput } from '@/lib/neon/pairing-queries';

/** POST /api/sku-catalog/pair-batch */

export const POST = withAuth(
  async (request, ctx) => {
    let body: Partial<BatchPairInput> = {};
    try {
      body = (await request.json()) as Partial<BatchPairInput>;
    } catch {
      return NextResponse.json(
        { success: false, error: 'invalid JSON body' },
        { status: 400 },
      );
    }

    const skuCatalogId = Number(body.skuCatalogId || 0);
    if (!Number.isFinite(skuCatalogId) || skuCatalogId <= 0) {
      return NextResponse.json(
        { success: false, error: 'skuCatalogId is required' },
        { status: 400 },
      );
    }

    const accept = Array.isArray(body.accept) ? body.accept : [];
    const reject = Array.isArray(body.reject) ? body.reject : [];
    const unpair = Array.isArray(body.unpair) ? body.unpair : [];

    if (accept.length === 0 && reject.length === 0 && unpair.length === 0) {
      return NextResponse.json(
        { success: false, error: 'nothing to do — accept/reject/unpair all empty' },
        { status: 400 },
      );
    }

    try {
      const result = await batchPair({
        skuCatalogId,
        actorId: ctx.staffId,
        actorKind: 'user',
        organizationId: ctx.organizationId,
        accept,
        reject,
        unpair,
      });
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'pair-batch failed';
      if (message.includes('not found')) {
        return NextResponse.json({ success: false, error: message }, { status: 404 });
      }
      console.error('[pair-batch] error:', err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'sku_stock.manage' },
);
