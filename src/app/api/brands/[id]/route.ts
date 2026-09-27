import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { handleBrandGet, handleBrandUpdate } from '@/lib/brands/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/brands/[id] — aliases, parent/children, SKU / open-order / on-hand roll-ups. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  return handleBrandGet(req, gate.ctx, id);
}

/** PATCH /api/brands/[id] — rename / re-parent / (de)activate; aliasesAdd / aliasesRemove. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.manage');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  return handleBrandUpdate(req, gate.ctx, id);
}
