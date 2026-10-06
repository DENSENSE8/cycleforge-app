import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { skuPaperworkRequiredBodySchema } from '@/lib/label-prints/order-packet-contracts';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { setSkuPaperworkNotRequired } from '@/lib/manuals/sku-paperwork';
import pool from '@/lib/db';

/**
 * PATCH /api/sku-catalog/[id]/paperwork-required — `{ notRequired }` sets
 * `sku_catalog.paperwork_not_required`: this SKU never ships with product
 * paperwork, so its order lines read Not required and pass G2.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'product_manuals.manage');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(skuPaperworkRequiredBodySchema, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await setSkuPaperworkNotRequired(gate.ctx.organizationId, id, parsed.notRequired);
    if (!result) return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });

    await recordAudit(pool, gate.ctx, req, {
      source: 'sku-catalog-api',
      action: AUDIT_ACTION.SKU_CATALOG_UPDATE,
      entityType: AUDIT_ENTITY.SKU,
      entityId: id,
      before: { paperworkNotRequired: result.before },
      after: { paperworkNotRequired: result.after },
    });

    return NextResponse.json({ success: true, skuCatalogId: id, notRequired: result.after });
  } catch (error) {
    console.error('Error in PATCH /api/sku-catalog/[id]/paperwork-required:', error);
    return NextResponse.json({ success: false, error: 'Failed to update paperwork requirement' }, { status: 500 });
  }
}
