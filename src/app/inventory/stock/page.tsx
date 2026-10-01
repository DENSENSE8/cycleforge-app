import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation, getStockRoomFacets, LOCATION_STOCK_ROW_CAP } from '@/lib/neon/location-stock-queries';
import { StockLedger } from '@/components/inventory/stock/StockLedger';

export const dynamic = 'force-dynamic';

/** `/inventory/stock` — Inventory › **Stock**. Rooms (`?room=`) are applied before the feed cap so a zone walk is complete. */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    room?: string;
    aisle?: string;
    status?: string;
    sku?: string;
    sort?: string;
    open?: string;
    page?: string;
  }>;
}) {
  // Same permission as the desk's own nav row (`sku_stock.view`).
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  const rooms = await getStockRoomFacets(user.organizationId);
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
    for (const key of ['q', 'aisle', 'status', 'sku', 'sort', 'open', 'page'] as const) {
      const value = params[key]?.trim();
      if (value) canonical.set(key, value);
    }
    canonical.set('room', room);
    redirect(`/inventory/stock?${canonical}`);
  }
  const { rows, totalCount, counts } = await getStockByLocation({
    orgId: user.organizationId,
    query: params.q ?? null,
    room,
    aisle: params.aisle ?? null,
  });

  return (
    <Suspense fallback={null}>
      <StockLedger
        rows={rows}
        rooms={rooms}
        loadedRoomFilter={room}
        loadedAisleFilter={params.aisle?.trim() || null}
        loadedSortFilter={params.sort?.trim() || null}
        totalCount={totalCount}
        counts={counts}
        capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
      />
    </Suspense>
  );
}
