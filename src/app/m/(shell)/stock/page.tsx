import { requirePermission } from '@/lib/auth/page-guard';
import { redirect } from 'next/navigation';
import {
  getStockByLocation,
  getStockRoomFacets,
  LOCATION_STOCK_ROW_CAP,
} from '@/lib/neon/location-stock-queries';
import { MobileV2StockLocations } from '@/components/mobile/v2/stock/MobileV2StockLocations';

export const dynamic = 'force-dynamic';

/** `/m/stock` — one compact row per physical location, backed by the desktop Stock read. */
export default async function MobileStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string; aisle?: string; page?: string }>;
}) {
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  const rooms = await getStockRoomFacets(user.organizationId);
  // Same rule as the desk: ONE room is always in play before the feed cap, so
  // the page walk is a complete aisle 1→N walk of that room (no mixed-room
  // pages that read as unordered).
  const requestedRoom = params.room?.trim() || null;
  const matchedRoom = requestedRoom
    ? rooms.find((facet) => facet.id === requestedRoom || facet.label === requestedRoom)
    : null;
  const defaultRoom = rooms.length > 0
    ? rooms.reduce((best, facet) => (facet.count > best.count ? facet : best))
    : null;
  const room = (matchedRoom ?? defaultRoom)?.id ?? null;
  if (room && requestedRoom !== room) {
    const canonical = new URLSearchParams();
    for (const key of ['q', 'aisle', 'page'] as const) {
      const value = params[key]?.trim();
      if (value) canonical.set(key, value);
    }
    canonical.set('room', room);
    redirect(`/m/stock?${canonical}`);
  }
  const { rows, totalCount } = await getStockByLocation({
    orgId: user.organizationId,
    query: params.q ?? null,
    room,
    aisle: params.aisle ?? null,
  });

  return (
    <MobileV2StockLocations
      rows={rows}
      rooms={rooms}
      legacyQuery={params.q?.trim() || ''}
      activeRoom={room}
      requestedPage={params.page?.trim() || null}
      capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
    />
  );
}
