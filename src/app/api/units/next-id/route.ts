import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { peekNextUnitId } from '@/lib/inventory/unit-id';
import { resolveSkuCatalogRow } from '@/lib/inventory/resolve-sku-catalog';
import { getOrCreateInternalGtin } from '@/lib/inventory/internal-gtin';
import { tenantQuery } from '@/lib/tenancy/db';
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
  const serialUnitIdInput = Number(body?.serial_unit_id);
  const serialUnitId =
    Number.isFinite(serialUnitIdInput) && serialUnitIdInput > 0 ? Math.floor(serialUnitIdInput) : null;

  if (!skuInput && !explicitId) {
    return NextResponse.json(
      { ok: false, error: 'sku or sku_catalog_id is required' },
      { status: 400 },
    );
  }

  // 1. Resolve sku_catalog row.
  const resolved = await resolveSkuCatalogRow(skuInput, explicitId, orgId);

  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: `sku_catalog row not found for "${skuInput || explicitId}"` },
      { status: 404 },
    );
  }

  // 2. Ensure GTIN exists (catalog data; not encoded on the products label) and,
  //    for a known unit, read the id it already wears (minted at receiving).
  const [gtin, ownUid] = await Promise.all([
    resolved.gtin && resolved.gtin.trim() ? resolved.gtin.trim() : getOrCreateInternalGtin(resolved.id, orgId),
    serialUnitId == null
      ? null
      : tenantQuery<{ unit_uid: string | null }>(
          orgId,
          `SELECT unit_uid FROM serial_units WHERE id = $1 AND organization_id = $2`,
          [serialUnitId, orgId],
        ).then(({ rows }) => rows[0]?.unit_uid?.trim() || null),
  ]);

  if (ownUid) {
    // The label prints the unit's own id — never a peek at the next one.
    return NextResponse.json({
      ok: true,
      unitId: ownUid,
      existing: true,
      gtin,
      skuCatalogId: resolved.id,
      sku: resolved.sku,
      productTitle: resolved.product_title,
    });
  }

  // 3. Peek the next unit serial — preview only, does NOT advance the
  //    sequence. The real per-serial allocation happens at print time.
  //    Org-scoped so the unit_id_sequences read is bound to this tenant.
  const preview = await peekNextUnitId(resolved.id, resolved.sku, undefined, orgId);

  return NextResponse.json({
    ok: true,
    unitId: preview.unitId,
    existing: false,
    gtin,
    skuCatalogId: resolved.id,
    sku: resolved.sku,
    productTitle: resolved.product_title,
    year: preview.year,
    seq: preview.seq,
    skuShort: preview.skuShort,
  });
}, { permission: 'print.label' });
