import { MobileOnHoldMerge } from '@/components/mobile/onhold/MobileOnHoldMerge';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/m/on-hold/[sku]` — pick the real SKU this placeholder becomes. */
export default async function MobileOnHoldSkuPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileOnHoldMerge sku={decodeURIComponent(sku)} />
    </ModeRegion>
  );
}
