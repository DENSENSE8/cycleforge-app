import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation, getStockRoomFacets, LOCATION_STOCK_ROW_CAP } from '@/lib/neon/location-stock-queries';
import { StockLedger } from '@/components/inventory/stock/StockLedger';
import { locationStockScopeKey, resolveExplicitStockRoom } from '@/lib/inventory/location-stock-row';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/stock` — Inventory › **Stock**: all stock, one ledger. The
 * sidebar walks the address Room › Aisle › Bay › Level › Position; every part
 * is applied before the feed cap so a walk is complete.
 */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    room?: string;
    aisle?: string;
    bay?: string;
    level?: string;
    position?: string;
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
  // Bare Stock means the complete warehouse. A room is applied only when the
  // operator explicitly chooses a valid room; the server must never inject a
  // convenient default because that turns "All stock" into a hidden filter.
  const room = resolveExplicitStockRoom(rooms, params.room);
  const { rows, totalCount, counts } = await getStockByLocation({
    orgId: user.organizationId,
    query: params.q ?? null,
    room,
    aisle: params.aisle ?? null,
    bay: params.bay ?? null,
    level: params.level ?? null,
    position: params.position ?? null,
    sort: params.sort ?? null,
  });

  return (
    <Suspense fallback={null}>
      <StockLedger
        rows={rows}
        rooms={rooms}
        loadedScopeKey={locationStockScopeKey(params)}
        loadedRoomFilter={room}
        totalCount={totalCount}
        counts={counts}
        capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
      />
    </Suspense>
  );
}
