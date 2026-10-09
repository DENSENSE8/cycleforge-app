import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { ensureBinSkuStock } from '@/lib/inventory/ensure-bin-sku-stock';

/**
 * POST /api/sku-stock/:sku/ensure — the `sku_stock` row a bin SKU's photos
 * hang off, created when missing (the phone's row camera, first photo).
 * Gated like the SKU_STOCK photo upload it precedes (`uploadPermissionFor`).
 * 404 when the SKU sits in no bin of this org.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'sku_stock.adjust');
    if (gate.denied) return gate.denied;

    const { sku: rawSku } = await params;
    const sku = decodeURIComponent(rawSku || '').trim();
    if (!sku) return NextResponse.json({ success: false, error: 'SKU is required' }, { status: 400 });

    const ensured = await ensureBinSkuStock(gate.ctx.organizationId, sku);
    if (!ensured) return NextResponse.json({ success: false, error: 'SKU is not in any location' }, { status: 404 });

    if (ensured.created) {
      await recordAudit(pool, gate.ctx, req, {
        source: 'sku-stock-ensure-api',
        action: AUDIT_ACTION.SKU_STOCK_ENSURE,
        entityType: AUDIT_ENTITY.SKU_STOCK,
        entityId: sku,
        after: { stockId: ensured.stockId },
      });
    }

    return NextResponse.json({ success: true, stockId: ensured.stockId, created: ensured.created });
  } catch (error) {
    console.error('Error in POST /api/sku-stock/[sku]/ensure:', error);
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
