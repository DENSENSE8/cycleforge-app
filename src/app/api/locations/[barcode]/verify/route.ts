import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { signLocationScanProof } from '@/lib/inventory/location-scan-proof';
import { locationCodeFlat, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { readLocationRecord } from '@/lib/locations/location-record';
import { LOCATION_REGISTER_PERMISSION, registerLocationsAudited } from '@/lib/locations/location-registration';
import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * The phone's one-trip location scan: the location record (the same payload
 * `GET /api/locations/[barcode]` serves) plus a short-lived, identity-bound
 * proof that the camera/wedge scanned it. A structurally valid sticker that
 * has no row yet is registered first, under the permission
 * `POST /api/locations/register` requires.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();
  if (!code) return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  const orgId = gate.ctx.organizationId;

  try {
    let record = await readLocationRecord(code, orgId);
    if (!record) {
      const segs = parseLocationCodeFlat(code);
      if (!segs) {
        return NextResponse.json({
          error: `No location ${code}. Location stickers read zone-aisle-bay-level-position (e.g. C-01-01-1-01).`,
        }, { status: 404 });
      }
      if (!gate.ctx.can(LOCATION_REGISTER_PERMISSION)) {
        return NextResponse.json({
          error: `Location ${code} is not set up yet, and your role cannot add locations. Ask a lead to print or register it.`,
          permission: LOCATION_REGISTER_PERMISSION,
        }, { status: 403 });
      }
      await registerLocationsAudited(request, gate.ctx, { room: `Zone ${segs.zone}`, segments: [segs] });
      record = await readLocationRecord(locationCodeFlat(segs), orgId);
      if (!record) throw new Error(`Location ${code} was registered but could not be read back.`);
    }

    const proof = signLocationScanProof({
      organizationId: orgId,
      staffId: gate.ctx.staffId,
      locationCode: record.location.barcode ?? code,
    });
    return NextResponse.json({ ...proof, record });
  } catch (err) {
    return errorResponse(err, 'POST /api/locations/[barcode]/verify');
  }
}
