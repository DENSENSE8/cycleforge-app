import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getSkuPaperworkReach } from '@/lib/manuals/sku-paperwork';

/**
 * GET /api/sku-catalog/[id]/paperwork-reach — how many open orders a
 * SKU-scope paperwork pair / unpair touches (`SkuPaperworkReach`).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'orders.view');
    if (gate.denied) return gate.denied;

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const reach = await getSkuPaperworkReach(gate.ctx.organizationId, id);
    if (!reach) return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
    return NextResponse.json(reach);
  } catch (error) {
    console.error('Error in GET /api/sku-catalog/[id]/paperwork-reach:', error);
    return NextResponse.json({ success: false, error: 'Failed to read paperwork reach' }, { status: 500 });
  }
}
