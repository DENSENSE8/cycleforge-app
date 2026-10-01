import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getLocationByBarcode } from '@/lib/neon/location-queries';
import { signLocationScanProof } from '@/lib/inventory/location-scan-proof';

export const runtime = 'nodejs';

/** Mint a short-lived, identity-bound proof after the camera/wedge scans a real location. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();
  if (!code) return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  const location = await getLocationByBarcode(code, gate.ctx.organizationId);
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });
  return NextResponse.json(signLocationScanProof({
    organizationId: gate.ctx.organizationId,
    staffId: gate.ctx.staffId,
    locationCode: location.barcode ?? code,
  }));
}
