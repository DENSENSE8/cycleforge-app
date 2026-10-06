import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation, getStockRoomFacets, LOCATION_STOCK_ROW_CAP } from '@/lib/neon/location-stock-queries';
import { StockLedger } from '@/components/inventory/stock/StockLedger';
import { ReplenishWorkspace } from '@/components/replenish/ReplenishWorkspace';
import { resolveExplicitStockRoom } from '@/lib/inventory/location-stock-row';

export const dynamic = 'force-dynamic';

/** `/inventory/stock` — Inventory › **Stock**. Rooms (`?room=`) are applied before the feed cap so a zone walk is complete. */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    room?: string;
    excludeRoom?: string;
    aisle?: string;
    excludeAisle?: string;
    status?: string;
    sku?: string;
    sort?: string;
    open?: string;
    page?: string;
    view?: string;
    rsku?: string;
    rtab?: string;
    rstatus?: string;
  }>;
}) {
  // Same permission as the desk's own nav row (`sku_stock.view`).
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  if (params.view === 'replenish') {
    return (
      <Suspense fallback={null}>
        <ReplenishWorkspace />
      </Suspense>
    );
  }
  const rooms = await getStockRoomFacets(user.organizationId);
  // Bare Stock means the complete warehouse. A room is applied only when the
  // operator explicitly chooses a valid room; the server must never inject a
  // convenient default because that turns "All stock" into a hidden filter.
  const room = resolveExplicitStockRoom(rooms, params.room);
  const { rows, totalCount, counts } = await getStockByLocation({
    orgId: user.organizationId,
    query: params.q ?? null,
    room,
    aisle: params.aisle ?? null,
    excludeRoom: params.excludeRoom ?? null,
    excludeAisle: params.excludeAisle ?? null,
  });

  return (
    <Suspense fallback={null}>
      <StockLedger
        rows={rows}
        rooms={rooms}
        loadedRoomFilter={room}
        loadedAisleFilter={params.aisle?.trim() || null}
        loadedExcludedRoomFilter={params.excludeRoom?.trim() || null}
        loadedExcludedAisleFilter={params.excludeAisle?.trim() || null}
        loadedSortFilter={params.sort?.trim() || null}
        totalCount={totalCount}
        counts={counts}
        capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
      />
    </Suspense>
  );
}
