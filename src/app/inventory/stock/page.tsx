import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation, LOCATION_STOCK_ROW_CAP } from '@/lib/neon/location-stock-queries';
import {
  filterLocationStockByRooms,
  locationStockRoomFacets,
  parseStockRooms,
} from '@/lib/inventory/location-stock-row';
import { StockLedger } from '@/components/inventory/stock/StockLedger';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/stock` — Inventory › **Stock**.
 *
 * Every (location, SKU) pair holding stock, warehouse-wide, as a record ledger
 * with a triage evidence column (count ± at a location, open the SKU, the SKU
 * exception for a `TMP-` placeholder).
 *
 * This file is the loader: `?q=` is answered in SQL (so the find box reaches
 * past the row cap) and `?room=` over the matched set, and the rows arrive as
 * props — no second client fetch. The client island writes the URL and
 * re-reads this loader (`router.refresh()`) when a count lands anywhere.
 *
 * Tenant scoping: `orgId` comes from the auth ctx, never from a param; the
 * read goes through `tenantQuery` with an explicit `organization_id`
 * predicate on every table.
 */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string }>;
}) {
  // Same permission as the desk's own nav row (`sku_stock.view`).
  const user = await requirePermission('sku_stock.view');
  const { q, room } = await searchParams;
  const { rows, totalCount } = await getStockByLocation({ orgId: user.organizationId, query: q ?? null });
  const selectedRooms = parseStockRooms(room);

  return (
    <Suspense fallback={null}>
      <StockLedger
        rows={filterLocationStockByRooms(rows, selectedRooms)}
        rooms={locationStockRoomFacets(rows)}
        selectedRooms={selectedRooms}
        totalCount={totalCount}
        capped={rows.length >= LOCATION_STOCK_ROW_CAP && totalCount > rows.length}
      />
    </Suspense>
  );
}
