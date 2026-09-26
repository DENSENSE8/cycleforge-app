import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { loadSellerClaimedFacts } from '@/lib/receiving/seller-claimed-facts';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/testing/seller-claimed */
export const GET = withAuth(async (request, ctx) => {
  const sp = request.nextUrl.searchParams;
  const serialUnitIdRaw = Number(sp.get('serialUnitId'));
  const skuCatalogIdRaw = Number(sp.get('skuCatalogId'));
  const serial = (sp.get('serial') || '').trim() || null;
  const orderId = (sp.get('orderId') || '').trim() || null;

  const serialUnitId =
    Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0 ? serialUnitIdRaw : null;
  const skuCatalogId =
    Number.isFinite(skuCatalogIdRaw) && skuCatalogIdRaw > 0 ? skuCatalogIdRaw : null;

  if (serialUnitId == null && !serial && skuCatalogId == null && !orderId) {
    return NextResponse.json(
      { ok: false, error: 'serialUnitId, serial, skuCatalogId, or orderId required' },
      { status: 400 },
    );
  }

  try {
    const facts = await loadSellerClaimedFacts(ctx.organizationId as OrgId, {
      serialUnitId,
      serialNumber: serial,
      skuCatalogId,
      orderIdHint: orderId,
    });
    return NextResponse.json({ ok: true, ...facts });
  } catch (err) {
    console.error('testing/seller-claimed failed', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load seller-claimed facts' },
      { status: 500 },
    );
  }
}, { permission: 'tech.qc_pass' });
