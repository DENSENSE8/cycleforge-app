import { redirect } from 'next/navigation';
import { MobileOnHoldList } from '@/components/mobile/onhold/MobileOnHoldList';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { mobileSkuExceptionHref } from '@/lib/inventory/sku-exception-links';

/**
 * `/m/on-hold` — SKU exceptions queue. `?sku=` is the shared desk link
 * (`/inventory/sku-exceptions?sku=…`) after the proxy's phone rewrite; it lands
 * on the record.
 */
export default async function MobileOnHoldPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string | string[] }>;
}) {
  const { sku } = await searchParams;
  const target = (Array.isArray(sku) ? sku[0] : sku)?.trim();
  if (target) redirect(mobileSkuExceptionHref(target));
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileOnHoldList />
    </ModeRegion>
  );
}
