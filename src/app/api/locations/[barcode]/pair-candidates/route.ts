import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getLocationByBarcode } from '@/lib/neon/location-queries';
import {
  listRoomPairCandidates,
  listSkuStockedAt,
} from '@/lib/neon/pair-candidates-queries';

/**
 * GET /api/locations/[barcode]/pair-candidates
 *   → products already stocked in this location's ROOM (the idle list on the
 *     pairing screen — see listRoomPairCandidates for why that beats "type
 *     something").
 *
 * GET …?sku=ABC
 *   → where that product is stocked right now (the detail sheet's one useful
 *     fact: am I about to scatter it across another bin).
 *
 * Read-only, `sku_stock.view`-shaped. Uses the same manual session resolution
 * as the sibling `[barcode]` route, which takes Next's typed `{ params }`
 * second argument and so cannot use the `withAuth` wrapper.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;
  const code = decodeURIComponent(barcode).trim();

  const gate = await requireRoutePerm(req, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const sku = new URL(req.url).searchParams.get('sku')?.trim();
  if (sku) {
    const stockedAt = await listSkuStockedAt(sku, orgId);
    return NextResponse.json({ success: true, stockedAt });
  }

  const location = await getLocationByBarcode(code, orgId);
  if (!location) {
    // A sticker scanned before print-register has no row yet. That is not an
    // error here — it just means there is no room to draw neighbours from, and
    // the screen falls back to its search field.
    return NextResponse.json({ success: true, candidates: [], room: null });
  }

  const candidates = await listRoomPairCandidates(
    { locationId: location.id, room: location.room ?? null },
    orgId,
  );

  return NextResponse.json({ success: true, candidates, room: location.room ?? null });
}
