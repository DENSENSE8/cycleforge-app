import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { searchIntakeProducts } from '@/lib/orders/intake-product-search';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/intake/products?q=<anything>&limit=8 — catalog products for
 * an intake line: title words, SKU, item #, FNSKU, UPC or a phrase. Composes
 * the shared search cores (`searchIntakeProducts`); read-only.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 8));
  const products = await searchIntakeProducts(ctx.organizationId, q, limit);
  return NextResponse.json({ ok: true, query: q, products });
}, { permission: 'orders.create' });
