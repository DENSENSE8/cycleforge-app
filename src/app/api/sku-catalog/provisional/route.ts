import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ProvisionalCreateBody } from '@/lib/schemas/provisional-sku';
import {
  createProvisionalSku,
  listProvisionalSkus,
} from '@/lib/neon/provisional-sku-queries';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { publishSkuExceptionChanged } from '@/lib/realtime/publish';

/** On-hold placeholder products. */

export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 });
    }
    const items = await listProvisionalSkus(orgId);
    return NextResponse.json({ success: true, items });
  },
  { permission: 'sku_stock.view' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 });
    }

    const parsed = parseBody(ProvisionalCreateBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    let item;
    try {
      item = await createProvisionalSku(
        {
          barcode: parsed.barcode ?? null,
          sourceRef: parsed.sourceRef ?? null,
          productTitle: parsed.productTitle,
          description: parsed.description ?? null,
          staffId: parsed.staffId ?? ctx.staffId ?? null,
        },
        orgId,
      );
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Could not create' },
        { status: 400 },
      );
    }

    await recordAudit(pool, ctx, req, {
      source: 'mobile-scanner',
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.SKU_STOCK,
      entityId: item.sku,
      after: { sku: item.sku, product_title: item.productTitle, description: item.description },
      method: item.barcode ? 'scan' : 'manual',
      reasonCode: 'PROVISIONAL_CREATE',
      actorStaffIdOverride: parsed.staffId ?? ctx.staffId ?? null,
      extra: { provisional_barcode: item.barcode || null },
    });

    // This INSERTED a `sku_catalog` row (see createProvisionalSku), and every other catalog writer busts this tag.
    await invalidateCacheTags(orgId, [CACHE_TAGS.skuCatalog]);

    after(() =>
      publishSkuExceptionChanged({
        organizationId: orgId,
        sku: item.sku,
        action: 'created',
        source: 'sku-catalog.provisional.create',
      }),
    );

    return NextResponse.json({ success: true, item });
  },
  { permission: 'sku_stock.adjust' },
);
