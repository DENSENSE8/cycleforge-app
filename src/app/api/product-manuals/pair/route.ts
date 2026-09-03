import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { pairManualToSku } from '@/lib/documents/pair-manual-to-sku';

/**
 * POST /api/product-manuals/pair
 *
 * Pair an existing library manual to a SKU (order intake / details). Same
 * write path as QC receiving-line pairing, but keyed by SKU string so it
 * works before an order row exists.
 *
 * Body: { manualId, sku, productTitle?, itemNumber?, orderId? }
 */
export const POST = withAuth(
  async (request, ctx) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      /* empty */
    }

    const result = await pairManualToSku({
      orgId: ctx.organizationId,
      manualId: Number(body.manualId),
      sku: String(body.sku || ''),
      productTitle:
        body.productTitle != null || body.product_title != null
          ? String(body.productTitle ?? body.product_title)
          : null,
      itemNumber:
        body.itemNumber != null || body.item_number != null
          ? String(body.itemNumber ?? body.item_number)
          : null,
      orderId: body.orderId != null ? String(body.orderId) : null,
      accountSource:
        body.accountSource != null ? String(body.accountSource) : null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      skuCatalogId: result.skuCatalogId,
      manual: result.manual,
      documentId: result.documentId,
    });
  },
  {
    permission: 'orders.create',
    audit: {
      source: 'orders',
      action: 'manual.pair_sku',
      entityType: 'product_manual',
      entityId: ({ body }) =>
        (body as { manualId?: number })?.manualId ?? null,
    },
  },
);
