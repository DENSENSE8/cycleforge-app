import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { signLocationScanProof } from '@/lib/inventory/location-scan-proof';
import { locationCode, locationCodeFlat, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { locationLookupKeys, suggestLocations } from '@/lib/locations/location-lookup';
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
      // Only a scanned sticker that reads as exactly ONE address is registered
      // (`?typed=1` never registers: a typo must not mint a location); anything
      // else answers with the real locations it is closest to.
      const typed = request.nextUrl.searchParams.get('typed') === '1';
      const addresses = locationLookupKeys(code).filter((key) => parseLocationCodeFlat(key) != null);
      const segs = addresses.length === 1 ? parseLocationCodeFlat(addresses[0]!) : null;
      if (!segs || typed) {
        const suggestions = await suggestLocations(code, orgId);
        const named = segs ? locationCode(segs) : code;
        return NextResponse.json({
          error: suggestions.length > 0
            ? `No location ${named}. Did you mean ${suggestions[0]!.face}?`
            : segs
              ? `No location ${named}. Scan its sticker to add it.`
              : `No location ${code}. Location stickers read zone-aisle-bay-level (e.g. C-02-09-4).`,
          suggestions,
        }, { status: 404 });
      }
      if (!gate.ctx.can(LOCATION_REGISTER_PERMISSION)) {
        return NextResponse.json({
          error: `Location ${locationCode(segs)} is not set up yet, and your role cannot add locations. Ask a lead to print or register it.`,
          permission: LOCATION_REGISTER_PERMISSION,
          suggestions: await suggestLocations(code, orgId),
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
