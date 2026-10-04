import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2LocationLabelFlow } from '@/components/mobile/v2/stock/MobileV2LocationLabelFlow';
import { canonicalRackCode } from '@/lib/locations/rack-code';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

export const dynamic = 'force-dynamic';

/** `/m/stock/labels` — Rack → Shelves → Print rack labels (doors: `/m/racks` › Print labels, the rack record › Print labels). */
export default async function MobileStockLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ rack?: string; back?: string }>;
}) {
  await requirePermission('sku_stock.view');
  const { rack, back } = await searchParams;
  return (
    <MobileV2LocationLabelFlow
      initialRack={rack ? canonicalRackCode(rack) : null}
      backHref={mobileJobReturn(back) ?? WAREHOUSE_PATHS.racks}
    />
  );
}
