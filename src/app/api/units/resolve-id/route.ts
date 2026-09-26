import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseUnitId } from '@/lib/inventory/unit-id';
import { resolveSkuCatalogRow } from '@/lib/inventory/resolve-sku-catalog';
import { getOrCreateInternalGtin } from '@/lib/inventory/internal-gtin';
import { findByUnitUid, findByNormalizedSerial } from '@/lib/neon/serial-units-queries';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** POST /api/units/resolve-id */
export const POST = withAuth(async (request, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const body = await request.json().catch(() => ({}));
  const unitId = String(body?.unitId || '').trim();
  if (!unitId) {
    return NextResponse.json({ ok: false, error: 'unitId is required' }, { status: 400 });
  }

  // 1+2. Direct unit lookup — by minted uid, then by manufacturer serial.
  const unitRow =
    (await findByUnitUid(unitId, orgId)) ?? (await findByNormalizedSerial(unitId, orgId));
  const canonicalUid = unitRow?.unit_uid ?? null;

  // 3. Resolve the catalog for title + gtin. Prefer the unit's own sku; else
  //    an explicit override; else the base SKU parsed off the id; else raw.
  const baseSku =
    unitRow?.sku?.trim() ||
    String(body?.sku || '').trim() ||
    parseUnitId(unitId)?.baseSku ||
    unitId;

  // Org-scoped: baseSku falls back to attacker-controlled body.sku / parseUnitId(unitId).baseSku, so the sku/platform_sku string-key match…
  const resolved = await resolveSkuCatalogRow(baseSku, null, orgId);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: `sku_catalog row not found for "${baseSku}"` },
      { status: 404 },
    );
  }

  // Org-scoped: the lazy gtin-minting UPDATE is gated by organization_id,
  // so we can never persist a gtin onto another tenant's sku_catalog row.
  const gtin =
    resolved.gtin && resolved.gtin.trim()
      ? resolved.gtin.trim()
      : await getOrCreateInternalGtin(resolved.id, orgId);

  return NextResponse.json({
    ok: true,
    unitId,
    // The id the reprint should encode: the stored uid when we have one, else
    // the input itself (legacy labels / pre-unit_uid rows).
    unitUid: canonicalUid ?? unitId,
    gtin,
    skuCatalogId: resolved.id,
    sku: resolved.sku,
    productTitle: resolved.product_title,
  });
}, { permission: 'print.label' });
