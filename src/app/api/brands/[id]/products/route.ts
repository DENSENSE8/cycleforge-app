import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { handleBrandProducts } from '@/lib/brands/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/brands/[id]/products?cursor=&limit=&status= — the brand's SKUs, descendant lines included. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  return handleBrandProducts(req, gate.ctx, id);
}
