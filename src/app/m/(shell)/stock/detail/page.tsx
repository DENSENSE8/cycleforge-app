import { requirePermission } from '@/lib/auth/page-guard';
import { redirect } from 'next/navigation';
import { getStockByLocation } from '@/lib/neon/location-stock-queries';
import { resolveLocationStockRow } from '@/lib/inventory/location-stock-row';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';

export const dynamic = 'force-dynamic';

function listHref(params: { q?: string; room?: string; page?: string }): string {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.room?.trim()) query.set('room', params.room.trim());
  if (params.page?.trim()) query.set('page', params.page.trim());
  return query.size > 0 ? `/m/stock?${query}` : '/m/stock';
}

/** Compatibility seam: old row links now land on the canonical location record. */
export default async function MobileStockDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; q?: string; room?: string; page?: string }>;
}) {
  const user = await requirePermission('sku_stock.view');
  const params = await searchParams;
  const openKey = params.open?.trim() || '';
  const { rows } = await getStockByLocation({
    orgId: user.organizationId,
    query: params.q ?? null,
    room: params.room ?? null,
  });
  const record = openKey ? resolveLocationStockRow(rows, openKey) : null;
  const back = listHref(params);
  if (record?.location_barcode) redirect(withJobReturn(locationHubPath(record.location_barcode), back));
  redirect(back);
}
