import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { ProvisionalUpdateBody } from '@/lib/schemas/provisional-sku';
import {
  findProvisionalMergeTarget,
  getProvisionalSkuDetail,
  updateProvisionalSku,
} from '@/lib/neon/provisional-sku-queries';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { publishSkuExceptionChanged } from '@/lib/realtime/publish';

/**
 * One SKU exception (on-hold placeholder product) — the record a shared link
 * opens on the desk (`/inventory/sku-exceptions?sku=`) and the phone
 * (`/m/on-hold/[sku]`).
 *
 * GET   → the placeholder with its photos and bins. A placeholder that was
 *         already paired answers 404 with `mergedInto`, so a stale link can
 *         say where the product went instead of "not found".
 * PATCH → rename / describe. Same gate as creating one (`sku_stock.adjust`).
 */

async function readSku(params: Promise<{ sku: string }>): Promise<string | null> {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  return isProvisionalSku(sku) ? sku : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sku: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const sku = await readSku(params);
  if (!sku) {
    return NextResponse.json({ success: false, error: 'Not an on-hold SKU' }, { status: 400 });
  }

  try {
    const item = await getProvisionalSkuDetail(sku, orgId);
    if (!item) {
      const mergedInto = await findProvisionalMergeTarget(sku, orgId);
      return NextResponse.json({ success: false, error: 'NOT_FOUND', mergedInto }, { status: 404 });
    }
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Error in GET /api/sku-catalog/provisional/[sku]:', error);
    return NextResponse.json({ success: false, error: 'Failed to load on-hold product' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sku: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.adjust');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const sku = await readSku(params);
  if (!sku) {
    return NextResponse.json({ success: false, error: 'Not an on-hold SKU' }, { status: 400 });
  }

  const parsed = parseBody(ProvisionalUpdateBody, await req.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;

  try {
    const before = await getProvisionalSkuDetail(sku, orgId);
    if (!before) {
      const mergedInto = await findProvisionalMergeTarget(sku, orgId);
      return NextResponse.json({ success: false, error: 'NOT_FOUND', mergedInto }, { status: 404 });
    }

    const item = await updateProvisionalSku(
      { sku, productTitle: parsed.productTitle, description: parsed.description },
      orgId,
    );
    if (!item) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', mergedInto: null }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'sku-exceptions-api',
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.SKU_STOCK,
      entityId: sku,
      before: { product_title: before.productTitle, description: before.description },
      after: { product_title: item.productTitle, description: item.description },
      reasonCode: 'PROVISIONAL_EDIT',
    });

    // The title is a catalog fact too (the placeholder's inactive row), so
    // cached title reads must see the rename.
    if (parsed.productTitle !== undefined) {
      await invalidateCacheTags(orgId, [CACHE_TAGS.skuCatalog]);
    }

    after(() =>
      publishSkuExceptionChanged({
        organizationId: orgId,
        sku,
        action: 'updated',
        source: 'sku-catalog.provisional.update',
      }),
    );

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Error in PATCH /api/sku-catalog/provisional/[sku]:', error);
    return NextResponse.json({ success: false, error: 'Failed to update on-hold product' }, { status: 500 });
  }
}
