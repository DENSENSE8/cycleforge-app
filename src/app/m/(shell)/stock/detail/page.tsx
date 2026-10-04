import { requirePermission } from '@/lib/auth/page-guard';
import { redirect } from 'next/navigation';
import { getLocationBarcodeForStockRowKey } from '@/lib/neon/location-queries';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

export const dynamic = 'force-dynamic';

function listHref(params: { q?: string; room?: string; page?: string }): string {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.room?.trim()) query.set('room', params.room.trim());
  if (params.page?.trim()) query.set('page', params.page.trim());
  return query.size > 0 ? `${WAREHOUSE_PATHS.stock}?${query}` : WAREHOUSE_PATHS.stock;
}

/** Compatibility seam: old row links (`?open=<location:sku:source>`) land on the canonical location record. */
export default async function MobileStockDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; q?: string; room?: string; page?: string }>;
}) {
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  const openKey = params.open?.trim() || '';
  const barcode = openKey ? await getLocationBarcodeForStockRowKey(openKey, user.organizationId) : null;
  const back = listHref(params);
  if (barcode) redirect(withJobReturn(locationHubPath(barcode), back));
  redirect(back);
}
