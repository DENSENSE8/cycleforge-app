import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { normalizeSku } from '@/utils/sku';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/sku/lookup?id=123 GET /api/sku/lookup?staticSku=PROD or PROD:tag (base segment before ':' is matched) */
type SkuLookupRow = {
  id: number;
  static_sku: string | null;
  serial_number: string | null;
  shipping_tracking_number: string | null;
  notes: string | null;
  location: string | null;
};

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get('id');
  const staticRaw = searchParams.get('staticSku') || searchParams.get('code') || '';

  if (idRaw != null && String(idRaw).trim() !== '') {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    // v_sku is a read-only VIEW without an organization_id column, so tenant
    // scope rides on the GUC (RLS on the underlying serial_units rows).
    const r = await tenantQuery<SkuLookupRow>(
      ctx.organizationId,
      `SELECT id, static_sku, serial_number, shipping_tracking_number, notes, location
         FROM v_sku WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) return NextResponse.json({ error: 'SKU row not found' }, { status: 404 });
    return NextResponse.json(row);
  }

  let base = String(staticRaw).trim();
  if (!base) {
    return NextResponse.json({ error: 'Provide id or staticSku' }, { status: 400 });
  }
  if (base.includes(':')) {
    base = base.split(':')[0].trim();
  }
  const xMatch = base.match(/^(.+?)x(\d+)$/i);
  if (xMatch) base = xMatch[1].trim();

  const normalized = normalizeSku(base);

  let row: SkuLookupRow | undefined = (
    await tenantQuery<SkuLookupRow>(
      ctx.organizationId,
      `SELECT id, static_sku, serial_number, shipping_tracking_number, notes, location
         FROM v_sku WHERE BTRIM(static_sku) = BTRIM($1) LIMIT 1`,
      [base],
    )
  ).rows[0];

  if (!row) {
    const fuzzy = await tenantQuery<SkuLookupRow>(
      ctx.organizationId,
      `SELECT id, static_sku, serial_number, shipping_tracking_number, notes, location
         FROM v_sku WHERE static_sku IS NOT NULL AND BTRIM(static_sku) <> ''`,
    );
    row = fuzzy.rows.find((r) =>
      normalizeSku(String(r.static_sku || '')) === normalized,
    );
  }

  if (!row) {
    return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
  }

  return NextResponse.json(row);
}, { permission: 'sku_stock.view' });
