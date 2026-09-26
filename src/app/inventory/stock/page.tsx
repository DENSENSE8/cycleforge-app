import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation, LOCATION_STOCK_ROW_CAP } from '@/lib/neon/location-stock-queries';
import {
  filterLocationStockByRooms,
  filterLocationStockByState,
  locationStockRoomFacets,
  parseStockRooms,
  parseStockStates,
} from '@/lib/inventory/location-stock-row';
import { StockLedger } from '@/components/inventory/stock/StockLedger';

export const dynamic = 'force-dynamic';

/** `/inventory/stock` — Inventory › **Stock**. */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string; status?: string; sku?: string }>;
}) {
  // Same permission as the desk's own nav row (`sku_stock.view`).
  const user = await requirePermission('sku_stock.view');
  const { q, room, status } = await searchParams;
  const { rows, totalCount } = await getStockByLocation({ orgId: user.organizationId, query: q ?? null });
  const selectedRooms = parseStockRooms(room);
  const selectedStates = parseStockStates(status);
  const stateRows = filterLocationStockByState(rows, selectedStates);

  return (
    <Suspense fallback={null}>
      <StockLedger
        rows={filterLocationStockByRooms(stateRows, selectedRooms)}
        rooms={locationStockRoomFacets(stateRows)}
        selectedRooms={selectedRooms}
        selectedStates={selectedStates}
        totalCount={totalCount}
        capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
      />
    </Suspense>
  );
}
