import { MobileOnHoldMerge } from '@/components/mobile/onhold/MobileOnHoldMerge';

/** `/m/on-hold/[sku]` — pick the real SKU this placeholder becomes. */
export default async function MobileOnHoldSkuPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  return <MobileOnHoldMerge sku={decodeURIComponent(sku)} />;
}
