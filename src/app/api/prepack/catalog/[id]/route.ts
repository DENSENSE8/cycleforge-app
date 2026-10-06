import { NextResponse, type NextRequest } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { catalogIdFrom } from '@/lib/prepack/pairing';
import { loadPrepackKit } from '@/lib/prepack/server';

/** The chosen catalog product's pairing facts: parts, child SKUs, SKU-level manual. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const id = await catalogIdFrom(params);
  if (id == null) {
    return NextResponse.json({ success: false, error: 'Invalid catalog id' }, { status: 400 });
  }
  const kit = await loadPrepackKit(gate.ctx.organizationId, id);
  if (!kit) return NextResponse.json({ success: false, error: 'SKU not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...kit });
}
