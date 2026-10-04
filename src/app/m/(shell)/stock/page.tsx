import { requirePermission } from '@/lib/auth/page-guard';
import { redirect } from 'next/navigation';
import {
  getStockByLocation,
  getStockRoomFacets,
  LOCATION_STOCK_ROW_CAP,
} from '@/lib/neon/location-stock-queries';
import { parseStockDrillScope, stockDrillHref } from '@/lib/inventory/stock-drill';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { MobileV2StockLocations } from '@/components/mobile/v2/stock/MobileV2StockLocations';

export const dynamic = 'force-dynamic';

/**
 * `/m/stock` — the warehouse as a drill-down: Rooms › Aisles › Side › Bays ›
 * Locations (`?room=` · `&aisle=` · `&side=left|right` · `&bay=`). The room
 * level reads only the room facets; a room reads its own locations, narrowed
 * server-side to one aisle when known.
 */
export default async function MobileStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string; aisle?: string; side?: string; bay?: string }>;
}) {
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  const rooms = await getStockRoomFacets(user.organizationId);
  const scope = parseStockDrillScope(params);
  const legacyQuery = params.q?.trim() || '';

  // A room named by label (old links) lands on its facet id; an unknown room on the room level.
  if (scope.room) {
    const facet = rooms.find((room) => room.id === scope.room || room.label === scope.room);
    if (!facet) redirect(WAREHOUSE_PATHS.stock);
    if (facet.id !== scope.room) redirect(stockDrillHref({ ...scope, room: facet.id }));
  }

  const page = scope.room
    ? await getStockByLocation({
        orgId: user.organizationId,
        query: legacyQuery || null,
        room: scope.room,
        aisle: typeof scope.aisle === 'number' ? String(scope.aisle) : null,
      })
    : null;

  return (
    <MobileV2StockLocations
      rows={page?.rows ?? []}
      rooms={rooms}
      scope={scope}
      legacyQuery={legacyQuery}
      capped={page != null && page.rows.length >= LOCATION_STOCK_ROW_CAP && page.totalCount > page.rows.length}
    />
  );
}
