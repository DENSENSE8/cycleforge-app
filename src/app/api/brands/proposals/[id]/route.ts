import type { NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { handleBrandProposalReview } from '@/lib/brands/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/brands/proposals/[id] — { decision: 'approve' | 'reject', notes?, brandId? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'sku_stock.manage');
  if (gate.denied) return gate.denied;
  const { id } = await params;
  return handleBrandProposalReview(req, gate.ctx, id);
}
