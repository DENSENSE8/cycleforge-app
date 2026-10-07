import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { suggestLinePaperwork } from '@/lib/manuals/paperwork-suggest';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET — the library documents an order line most likely ships with (`paperwork-suggest.ts`). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;
  const lineId = Number((await params).id);
  if (!Number.isSafeInteger(lineId) || lineId <= 0) return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  try {
    const suggestions = await suggestLinePaperwork(gate.ctx.organizationId as OrgId, lineId);
    if (!suggestions) return NextResponse.json({ error: 'Order line not found' }, { status: 404 });
    return NextResponse.json({ suggestions });
  } catch (error: unknown) {
    console.error('[GET /api/orders/[id]/paperwork-suggestions] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read paperwork suggestions' }, { status: 500 });
  }
}
