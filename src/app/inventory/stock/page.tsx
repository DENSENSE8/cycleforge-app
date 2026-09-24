import { requirePermission } from '@/lib/auth/page-guard';
import { getStockByLocation } from '@/lib/neon/location-stock-queries';
import { StockByLocationView } from '@/components/inventory/StockByLocationView';

export const dynamic = 'force-dynamic';

/**
 * `/inventory/stock` — Inventory › **Stock**.
 *
 * One row per `(location, sku)` pair holding stock, warehouse-wide: the
 * LOCATION is the row's id, the PRODUCT is its title, and the count rides under
 * that title as the line qty. Read-only — `bin_contents` is written by the
 * counts and moves at the stations that scan them, never by a desk form.
 *
 * The tab wears the Inventory desk frame from `../layout.tsx` (`deskChrome` +
 * `railless`), so this file is the loader and nothing else: the search box, the
 * room funnel and the column sort are the client island's
 * (`StockByLocationView`), and the rows arrive as props rather than through a
 * second client fetch.
 *
 * `?q=` is the FETCH KEY for that search box, which is why it is read here.
 * The island already wrote it (optimistically, through
 * `useOptimisticUrlParams`), so the round-trip was being paid on every
 * committed keystroke; until this page spent it, the answer still came from a
 * substring pass over whatever survived the loader's row cap, and a pair past
 * the cap could not be found however exactly it was typed.
 *
 * Tenant scoping: `orgId` comes from the auth ctx (`requirePermission` →
 * `user.organizationId`), never from a param, and the read goes through
 * `tenantQuery` with an explicit `organization_id` predicate — `sku`, `barcode`
 * and `room` are tenant-scoped string keys that collide across orgs, and RLS
 * does not bite on the owner pool.
 */
export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Same permission as the desk's own nav row (`sku_stock.view`): this is the
  // stock the Ledger already grants sight of, listed by shelf instead of by SKU.
  const user = await requirePermission('sku_stock.view');
  const { q } = await searchParams;
  const { rows, totalCount } = await getStockByLocation({
    orgId: user.organizationId,
    query: q ?? null,
  });

  return <StockByLocationView rows={rows} totalCount={totalCount} />;
}
