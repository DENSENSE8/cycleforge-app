import { MobileOnHoldMerge } from '@/components/mobile/onhold/MobileOnHoldMerge';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/m/on-hold/[sku]/pair` — pick the real Zoho SKU this placeholder becomes. */
export default async function MobileOnHoldPairPage({
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
