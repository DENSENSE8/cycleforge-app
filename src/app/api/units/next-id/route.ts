import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { peekNextUnitId } from '@/lib/inventory/unit-id';
import { resolveSkuCatalogRow } from '@/lib/inventory/resolve-sku-catalog';
import { getOrCreateInternalGtin } from '@/lib/inventory/internal-gtin';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** POST /api/units/next-id */
export const POST = withAuth(async (request, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const body = await request.json().catch(() => ({}));
  const skuInput = String(body?.sku || '').trim();
  const skuCatalogIdInput = Number(body?.sku_catalog_id);
  const explicitId =
    Number.isFinite(skuCatalogIdInput) && skuCatalogIdInput > 0
      ? Math.floor(skuCatalogIdInput)
      : null;

  if (!skuInput && !explicitId) {
    return NextResponse.json(
      { ok: false, error: 'sku or sku_catalog_id is required' },
      { status: 400 },
    );
  }

  try {
    // 1. Resolve sku_catalog row.
    const resolved = await resolveSkuCatalogRow(skuInput, explicitId, orgId);

    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: `sku_catalog row not found for "${skuInput || explicitId}"` },
        { status: 404 },
      );
    }

    // 2. Ensure GTIN exists (catalog data; not encoded on the products label).
    const gtin = resolved.gtin && resolved.gtin.trim() ? resolved.gtin.trim() : await getOrCreateInternalGtin(resolved.id, orgId);

    // 3. Peek the next unit serial — preview only, does NOT advance the
    //    sequence. The real per-serial allocation happens at print time.
    //    Org-scoped so the unit_id_sequences read is bound to this tenant.
    const preview = await peekNextUnitId(resolved.id, resolved.sku, undefined, orgId);

    return NextResponse.json({
      ok: true,
      unitId: preview.unitId,
      gtin,
      skuCatalogId: resolved.id,
      sku: resolved.sku,
      productTitle: resolved.product_title,
      year: preview.year,
      seq: preview.seq,
      skuShort: preview.skuShort,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'next-id failed';
    console.error('[POST /api/units/next-id] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'print.label' });
